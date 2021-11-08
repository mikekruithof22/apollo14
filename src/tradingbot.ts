import { AllCoinsInformationResponse, CancelSpotOrderResult, ExchangeInfo, MainClient, OrderBookResponse, OrderResponseFull, SpotOrder, SymbolExchangeInfo, SymbolFilter, SymbolLotSizeFilter, SymbolPercentPriceFilter, SymbolPriceFilter, WsMessageSpotUserDataExecutionReportEventFormatted, WsUserDataEvents } from 'binance';
import { AmountAndPrice, ConfigOrderCondition, ConfigOrderConditionOrder } from './models/logic';
import { OrderStatusEnum, OrderTypeEnum } from './models/order';

import { ActiveBuyOrder } from './models/trading-bot';
import BinanceService from './binance-service/binanceService';
import BinanceError from './models/binance-error';
import CalculateHelper from './helpers/calculate';
import CandleHelper from './helpers/candle';
import { LightWeightCandle } from './models/candle';
import { LogLevel } from './models/log-level';
import Order from './binance-service/order';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance-service/logic';
import { OrderConditionResult } from './models/calculate';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;
    public botPauseActive: boolean = false;

    // config
    private brokerApiUrl: string = config.brokerApiUrl;
    private candleInterval: string = config.timeIntervals[0]; // For the time being only one interval, therefore [0].
    private numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    private maxAllowedActiveOrdersForTraidingPair: number = config.production.maxAllowedActiveOrdersForTraidingPair;
    private orderConditions: ConfigOrderCondition[] = config.orderConditions;
    private minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
    private tradingPairs: string[] = config.tradingPairs;
    private basePair: string = config.basePair;
    private rsiCalculationLength: number = config.genericOrder.rsiCalculationLength;
    private limitBuyOrderExpirationTime: number = config.genericOrder.limitBuyOrderExpirationTimeInSeconds * 1000; // multiply with 1000 for milliseconds 
    private doNotOrderWhenRSIValueIsBelow: number = config.genericOrder.doNotOrder.RSIValueIsBelow;
    private pauseConditionActiveboolean = config.production.pauseCondition.active;

    // devTest config
    private triggerBuyOrderLogic: boolean = config.production.devTest.triggerBuyOrderLogic;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();

        txtLogger.log(`New TradingBot created`);
    }

    public async runProgram() {
        if (this.binanceRest === undefined) {
            txtLogger.log(`The method runProgram() quit because:`);
            txtLogger.log(`Generating binanceRest client failed.`, LogLevel.ERROR);
            return;
        }

        // STEP 1 If USDT is to low, you don't need to run the program, therefore quit.
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }

        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.log(`Free USDT balance amount: ${currentFreeUSDTAmount}.`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.log(`The method runProgram() quit because:`);
            txtLogger.log(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        // STEP 2 - based on btc 24 hour drop some order conditions should be skipped, therefore remove those for this.orderConditions (only for this run) 
        this.orderConditions = config.orderConditions;
        const btcStatistics = await this.binanceService.get24hrChangeStatististics(this.binanceRest, 'BTCUSDT');
        const btc24HourChange: number = btcStatistics.priceChangePercent;

        const orderConditionsWithActiveDoNotOrderCheck: ConfigOrderCondition[] = this.orderConditions.filter(o => o.doNotOrder.active === true);

        let oderConditionsNamesToRemove: string[] = [];
        if (orderConditionsWithActiveDoNotOrderCheck.length > 0) {
            orderConditionsWithActiveDoNotOrderCheck.forEach(condition => {
                if (condition.doNotOrder.btc24HourDeclineIsLowerThen >= btc24HourChange) {
                    oderConditionsNamesToRemove.push(condition.name);
                }
            });
        }

        if (oderConditionsNamesToRemove.length > 0) {
            oderConditionsNamesToRemove.forEach(name => {
                const index = this.orderConditions.findIndex(i => i.name === name);
                if (index > -1) {
                    txtLogger.log(`Order condition ${name} will this run NOT be evaluated, because:`);
                    txtLogger.log(`Last 24 hour BTC has dropped or risen ${btc24HourChange}% which is lower than configured inside the config.json`);
                    this.orderConditions.splice(index, 1);
                }
            });
        }

        // STEP 3 - Checking crash order conditions and bullish divergences for each tradingpair
        if (!this.botPauseActive) {
            txtLogger.log(`Checking ${this.tradingPairs.length} trading pair(s) for crash condition.`);
            txtLogger.log(`Checking ${this.orderConditions.length * this.tradingPairs.length} order condition(s) for bullish divergences.`);
        }
   
        for await (let pair of this.tradingPairs) {
            const tradingPair: string = `${pair}${this.basePair}`;
            const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${this.numberOfCandlesToRetrieve}`;
            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: number[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection: number[] = await rsiHelper.calculateRsi(closePriceList, this.rsiCalculationLength);
            const mostRecentRsiValue = rsiCollection[rsiCollection.length - 1];

            for await (let order of this.orderConditions) {
                const orderConditionName: string = `${pair}-${this.basePair}-${order.name}`; 
                if (this.triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                    txtLogger.log(`##### DEVTEST - Skipping bullish divergence calculation and trigger a limit buy order #####`);
                    await this.buyLimitOrderLogic(
                        order.order,
                        tradingPair,
                        orderConditionName,
                    );
                    return;
                }

                const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
                const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
                const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
                const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

                const orderConditionResult: OrderConditionResult = calculate.calculateBullishDivergenceOrCrashOrder(
                    closePriceList,
                    candleObjectList,
                    rsiCollection,
                    startCount,
                    stopCount,
                    rsiMinimumRisingPercentage,
                    candleMinimumDeclingPercentage,
                    orderConditionName,
                    this.botPauseActive
                );

                if (orderConditionResult !== undefined) {
                    txtLogger.log(`***** Bullish divergence or crash condition detected for ${tradingPair} *****`);
                    txtLogger.log(`Checking if there are already orders open for this tradingPair. In case there are to many open orders a limit buy order will NOT be placed.`);

                    const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
                    if (currentOpenOrders.length > 0) {
                        const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
                        txtLogger.log(`The amount of open orders is equal to: ${activeOrdersForTraidingPair.length}`);

                        if (activeOrdersForTraidingPair.length >= this.maxAllowedActiveOrdersForTraidingPair) {
                            txtLogger.log(`Limit buy order will NOT be created because:`);
                            txtLogger.log(`The configured maximum amount of active orders for this tradingPair - ${activeOrdersForTraidingPair.length} - is larger or equal to the amount configured inside the config.json - ${this.maxAllowedActiveOrdersForTraidingPair}`);
                            break;
                        }

                        if (activeOrdersForTraidingPair.length >= 5) {
                            txtLogger.log(`Limit buy order will NOT be created because:`);
                            txtLogger.log(`Binance does not allow more than 5 automaticly created orders`);
                            break;
                        }
                    }

                    if (orderConditionResult.isCrashOrder) {
                        txtLogger.log(`*** Condition type is equal to CRASH`);
                        txtLogger.log(`Details:`);
                        txtLogger.log(JSON.stringify(orderConditionResult, null, 4))

                        // STEP 4. 
                        //      OPTION I - A crash condition was detected , continue to the ordering logic method.
                        const ordercondition = config.production.largeCrashOrder.order as ConfigOrderConditionOrder;
                        await this.buyLimitOrderLogic(
                            ordercondition,
                            tradingPair,
                            `crashOrder-${tradingPair}`,
                        );
                    } else {
                        txtLogger.log(`*** Condition type is equal to BULLISH DIVERGENCE: ${orderConditionName}`);
                        txtLogger.log(`Details:`);
                        txtLogger.log(JSON.stringify(orderConditionResult, null, 4))
                        txtLogger.log(`The most recent rsi value is: ${orderConditionResult.endiRsiValue}. The minimum configured for this condition is: ${order.rsi.minimumRisingPercentage}`);
                        if (mostRecentRsiValue < this.doNotOrderWhenRSIValueIsBelow) {
                            txtLogger.log(`Because the RSI is lower than minimum configured the program will not place an limit buy order`);
                        } else {
                            // STEP 4. 
                            //      OPTION II - A bullish divergence was found, continue to the ordering logic method.
                            await this.buyLimitOrderLogic(
                                order.order,
                                tradingPair,
                                orderConditionName
                            );
                        }
                    }
                    // TODO: testmike, for now we will 'RETURN' out of the loop once we trigger the buy buyLimitOrderLogic
                    // This makes the program, for the time being way simpler! In the future we can let it continue.
                    return;
                }
            }
        }

        this.botPauseActive ?
            txtLogger.log(`No crash condition(s) where found during this run.`) :
            txtLogger.log(`No bullish divergence(s) or crash condition(s) where found during this run.`);
    }

    public async buyLimitOrderLogic(
        order: ConfigOrderConditionOrder,
        tradingPair: string,
        orderName: string
    ) {
        txtLogger.log(`The method buyLimitOrderLogic() will try to place a limit buy order`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.takeProfitPercentage;
        const takeLossPercentage: number = order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.maxUsdtBuyAmount;
        const maxPercentageOfBalance: number = order.maxPercentageOfBalance;

        // STEP II. Check current amount off free USDT on the balance
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.log(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.log(`The method buyLimitOrderLogic() quit because:`);
            txtLogger.log(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        // STEP III. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOfBalance);
        txtLogger.log(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

        const symbol: string = `symbol=${tradingPair}`; // workaround, npm package sucks
        const exchangeInfo = await this.binanceService.getExchangeInfo(this.binanceRest, symbol) as ExchangeInfo;

        if (exchangeInfo === undefined) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`getExchangeInfo() method failed.`, LogLevel.ERROR);
            return;
        }

        const symbolResult: SymbolExchangeInfo = exchangeInfo.symbols.find(r => r.symbol === tradingPair);

        if (symbolResult === undefined) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`symbolResult was undefined .`, LogLevel.ERROR);
            return;
        }

        const lotSize: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'LOT_SIZE') as SymbolLotSizeFilter;
        const priceFilter: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'PRICE_FILTER') as SymbolPriceFilter;
        const stepSize: number = exchangeLogic.determineStepSize(lotSize);
        const minimumOrderQuantity: number = exchangeLogic.determineMinQty(lotSize);
        const tickSize: number = exchangeLogic.determineTickSize(priceFilter);

        txtLogger.log(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.log(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        const percentPriceObj: SymbolPercentPriceFilter = symbolResult.filters.find(f => f.filterType === 'PERCENT_PRICE') as SymbolPercentPriceFilter;
        const multiplierDown: number = Number(percentPriceObj.multiplierDown);
        const allowedStopLossPercentageBinance: number = 100 - (multiplierDown * 100);

        if (takeLossPercentage >= allowedStopLossPercentageBinance) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`The configured takeLossPercentage ${takeLossPercentage} is lower than Binance allows: ${allowedStopLossPercentageBinance}.`);
            txtLogger.log(`****** Creating a buy limit order is useless because later on an OCO sell order will be rejected by Binance. ****** `);
            txtLogger.log(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information`);
            return;
        }

        // STEP IV. Retrieve bid prices.
        const currentOrderBook = await this.binanceService.getOrderBook(this.binanceRest, tradingPair);
        const currentOrderBookBids = exchangeLogic.bidsToObject((currentOrderBook as OrderBookResponse).bids);
        const orderPriceAndAmount: AmountAndPrice = exchangeLogic.calcOrderAmountAndPrice(
            currentOrderBookBids,
            amountOffUSDTToSpend,
            stepSize
        );

        const orderPrice: number = orderPriceAndAmount.price;
        const orderAmount: number = orderPriceAndAmount.amount;
        const totalUsdtAmount: number = orderPriceAndAmount.totalUsdtAmount;

        txtLogger.log(`Based on the order book the following order limit buy order will be (very likely) filled immediately:`);
        txtLogger.log(`Price: ${orderPrice}. Amount: ${orderAmount}. Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        if (totalUsdtAmount < 11) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`The total usdt amount of the order - ${totalUsdtAmount} - the minimum allowed order quanity: 10 dollar`);
        }

        if (orderAmount < minimumOrderQuantity) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`Order quantity is lower than - ${orderAmount} - the minimum allowed order quanity: ${minimumOrderQuantity}`);
            return;
        }

        // STEP V. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`There was an error creating the limit buy order`, LogLevel.ERROR);
            return;
        }
        txtLogger.log(`Buy order created. Details:`);
        txtLogger.log(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}, price: ${buyOrder.price}`);

        if (buyOrder.status === OrderStatusEnum.PARTIALLY_FILLED ||
            buyOrder.status === OrderStatusEnum.NEW ||
            buyOrder.status === OrderStatusEnum.FILLED
        ) {
            const currentBuyOrder: ActiveBuyOrder = {
                clientOrderId: buyOrder.clientOrderId,
                orderName: orderName,
                takeProfitPercentage: takeProfitPercentage,
                takeLossPercentage: takeLossPercentage,
                minimumOrderQuantity: minimumOrderQuantity,
                stepSize: stepSize,
                tickSize: tickSize,
                status: buyOrder.status
            }
            this.activeBuyOrders.push(currentBuyOrder);
        }

        if (buyOrder.status !== OrderStatusEnum.FILLED) {
            // STEP VI. Activate cancelLimitBuyOrderCheck() because after X seconds you want to cancel the limit buy order if it is not filled.
            if (this.limitBuyOrderExpirationTime > 0) {
                setTimeout(() => {
                    txtLogger.log(`The method cancelLimitBuyOrderCheck() is going to check if the limit buy order - ${orderName} - has been filled within the allocated time: ${this.limitBuyOrderExpirationTime / 1000} seconds`);
                    this.cancelLimitBuyOrderCheck(tradingPair, buyOrder.clientOrderId, orderName);
                }, this.limitBuyOrderExpirationTime);
            }
        }
    }

    public async processFormattedUserDataMessage(data: WsUserDataEvents) {

        // POSSIBILITY I - When a buy order is FILLED an oco order should be created.
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.FILLED) {
            const clientOrderId: string = data.newClientOrderId;

            if (data.orderType === 'LIMIT' && data.side === 'BUY') {
                const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);

                if (buyOrder !== undefined) {
                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
                    this.activeBuyOrders[index].status = 'FILLED';

                    txtLogger.log(`Limit buy order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled`);
                    await this.createOcoOrder(data, clientOrderId, buyOrder);
                } else {
                    txtLogger.log(`Buy order not found inside this.activeBuyOrders: ActiveBuyOrder[]`);
                    // TODO: testmike wil je proces.exit? indien this.activeBuyOrders deze niet langer correct is? 
                }
            }
        }

        // POSSIBILITY II - Order canceled was successfull, in case of partial fill create OCO order
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.CANCELED) {
            const clientOrderId: string = data.originalClientOrderId; // TODO: kijken of 'newClientOrderId' juist vervangen is door: 'originalClientOrderId'

            const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);
            txtLogger.log(`Limit buy order with clientOrderId ${clientOrderId} is successfully cancelled.`);

            if (buyOrder !== undefined && buyOrder.status === 'PARTIALLY_FILLED') {
                txtLogger.log(`The limit buy order was PARTIALLY_FILLED. Therefore, the next step will be trying to create an oco order.`);
                await this.createOcoOrder(data, clientOrderId, buyOrder);
            }
        }

        // // POSSIBILITY III - OCO order is finished - ALL_DONE
        if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
            const listClientOrderId = data.listClientOrderId;
            txtLogger.log(`Oco order with listClientOrderId: ${listClientOrderId} is filled. Details:`);
            txtLogger.log(`${JSON.stringify(data, null, 4)}`);
        }
    }

    public async cancelLimitBuyOrderCheck(tradingPair: string, clientOrderId: string, orderName: string) {
        // STEP 1 - check if the limit buy order is not filled yet (it may be partially filled)
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const limitBuyOrder: SpotOrder = currentOpenOrders.find(f => f.clientOrderId === clientOrderId);
            txtLogger.log(`Checking if it is necessary to cancel the limit buy order with the following details:`);
            txtLogger.log(`orderName: ${orderName}, clientOrderId: ${clientOrderId} `);

            // STEP 2 - If the limit buy order is still open cancel it ('NEW' or 'PARTIALLY_FILLED')
            if (
                limitBuyOrder !== undefined &&
                (limitBuyOrder.status === 'NEW' || limitBuyOrder.status === 'PARTIALLY_FILLED')
            ) {
                txtLogger.log(`Limit buy order status: ${limitBuyOrder.status}`);
                txtLogger.log(`${JSON.stringify(limitBuyOrder)}`);
                txtLogger.log(`Trying to cancel the limit buy order.`);
                const cancelSpotOrderResult: CancelSpotOrderResult = await this.binanceService.cancelOrder(this.binanceRest, tradingPair, limitBuyOrder.orderId);
                txtLogger.log(`The cancel spot order results looks as follows:`);
                txtLogger.log(`${JSON.stringify(cancelSpotOrderResult, null, 4)}`);
            } else {
                txtLogger.log(`Limit buy order was not found among the current open orders and/or the status was not equal to: 'PARTIALLY_FILLED' or 'NEW', therefore nothing to cancel.`);
            }
        } else {
            txtLogger.log(`Currently there are no active open orders, therefore there is nothing to cancel.`);
        }
    }

    public async createOcoOrder(data: WsMessageSpotUserDataExecutionReportEventFormatted, clientOrderId: string, buyOrder: ActiveBuyOrder) {
        txtLogger.log(`The method createOcoOrder() is triggered`);

        const tradingPair: string = data.symbol;
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.log(`The amount of open orders for ${tradingPair} length is equal to: ${activeOrdersForTraidingPair.length}`);
            if (activeOrdersForTraidingPair.length >= 5) {
                txtLogger.log(`The method createOcoOrder() quit because:`);
                txtLogger.log(`Binance does not allow more than 5 automaticly created orders`);
                return;
            }
        }

        const stepSize: number = buyOrder.stepSize;
        const tickSize: number = buyOrder.tickSize;

        const profitPrice: number = exchangeLogic.calcProfitPrice(Number(data.price), buyOrder.takeProfitPercentage, tickSize);
        const stopLossPrice: number = exchangeLogic.calcStopLossPrice(Number(data.price), buyOrder.takeLossPercentage, tickSize);
        const stopLimitPrice: number = exchangeLogic.callStopLimitPrice(stopLossPrice, tickSize);

        const coinName: string = data.symbol.replace('USDT', '');
        let balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
        let currentFreeCryptoBalance = Number(currentCryptoBalance.free);

        // TODO: testmike, note: ALL of the crypto trading pairs inside the wallet will be sold!
        let ocoOrderAmount: number = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);
        const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;

        const usdtAmountForProfitPrice: number = profitPrice * ocoOrderAmount;
        const usdtAmountForStopLimitPrice: number = stopLimitPrice * ocoOrderAmount;
        const usdtAmountForStopLossPrice: number = stopLossPrice * ocoOrderAmount;

        if ((usdtAmountForProfitPrice < 11) || (usdtAmountForStopLimitPrice < 11) || (usdtAmountForStopLossPrice < 11)) {
            txtLogger.log(`The method createOcoOrder() quit because:`);
            txtLogger.log(`One of the following values is lower than minimum of 10 usdt:`);
            txtLogger.log(`usdt amount for profit price: ${usdtAmountForProfitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLimitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLossPrice}`)
            txtLogger.log(`****** Creating an oco order with values lower than 10 USDT price will be rejected by Binance ****** `);
            txtLogger.log(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information.`);
            return;
        }

        txtLogger.log(`Current crypto balance (including the none free part)`);
        txtLogger.log(JSON.stringify(currentCryptoBalance));
        txtLogger.log(`Current free crypto balance: ${currentFreeCryptoBalance}`);

        if (ocoOrderAmount < minimumOcoOrderQuantity) {
            txtLogger.log(`Oco order quantity - ${ocoOrderAmount} - is lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);
            txtLogger.log(`Re-retrieving current free balance after a couple of seconds to ensure it's not a timing issue!`);

            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(3000);

            balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
            if (balance instanceof BinanceError) {
                txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
                return;
            }
            currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
            currentFreeCryptoBalance = Number(currentCryptoBalance.free);
            ocoOrderAmount = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);

            if (ocoOrderAmount < minimumOcoOrderQuantity) {
                txtLogger.log(`The method createOcoOrder() quit because:`);
                txtLogger.log(`Oco order quantity - ${ocoOrderAmount} - is STILL lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);
                return;
            }
        }

        txtLogger.log(`Trying to create an OCO order`);
        txtLogger.log(`The oco order amount is equal to: ${ocoOrderAmount}`);
        txtLogger.log(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.log(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        txtLogger.log(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}`);

        const ocoOrder = await this.order.createOcoSellOrder(
            this.binanceRest,
            data.symbol,
            ocoOrderAmount,
            profitPrice,
            stopLossPrice,
            stopLimitPrice
        );

        if (ocoOrder === undefined) {
            txtLogger.log(`The method createOcoOrder() quit because:`);
            txtLogger.log(`Oco order creation failed.`, LogLevel.ERROR);

            const limitSellOrderAmount: number = ocoOrderAmount;
            const limitSellOrderPrice: number = exchangeLogic.roundOrderAmount((data.price * 0.98), stepSize);

            const limitSellOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITSELL, data.symbol, limitSellOrderAmount, limitSellOrderPrice) as OrderResponseFull;
            if (limitSellOrder === undefined) {
                txtLogger.log(`There was an error creating the limit sell order`, LogLevel.ERROR);
            } else {
                txtLogger.log(`Limit sell order created. Details:`);
                txtLogger.log(`Status: ${limitSellOrder.status}, orderId: ${limitSellOrder.orderId}, clientOrderId: ${limitSellOrder.clientOrderId}, price: ${limitSellOrder.price}`);
            }
            txtLogger.log(`***SAFETY MEASURE***: When oco fails the bot will be switched off!`);
            txtLogger.log(`Program is closed by 'process.exit`);

            process.exit();
            return;
        } else {
            const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
            if (index > -1) {
                this.activeBuyOrders.splice(index, 1);
            }
            txtLogger.log(`Oco Order was successfully created. Details:`);
            txtLogger.log(`${JSON.stringify(ocoOrder)}`);
        }
    }

    public async crashDetected() {
        if (!this.pauseConditionActiveboolean) {
            return false;
        }

        const numberOfCandlesToRetrieve: number = config.production.pauseCondition.maxAmountOfCandlesToLookBack;
        const minimumDeclingPercentage: number = config.production.pauseCondition.minimumDeclingPercentage;
        const tradingPair: string = config.production.pauseCondition.tradingPair;
        txtLogger.log(`Checking whether a crash has happened to pause bot for. Trading pair: ${tradingPair}.`);

        const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${numberOfCandlesToRetrieve}`;
        const candleList = await this.candleHelper.retrieveCandles(url);
        const mostRecentCandle = candleList[candleList.length - 1];
        const mostRecentCandleLow = mostRecentCandle[3];
        for (var i = candleList.length - 2; i >= 0; i--) {
            const compareWithCandle = candleList[i];
            const compareWithCandleClose = compareWithCandle[4];
            const closePriceChangePercentage = CalculateHelper.calculatePercentageChange(compareWithCandleClose, mostRecentCandleLow);
            if (closePriceChangePercentage <= minimumDeclingPercentage) {
                txtLogger.log(`Crash detected. Price decline percentage: ${closePriceChangePercentage}.`);
                return true;
            }
        }
        txtLogger.log(`No crash found therefore no need to pause the bot.`);
        return false;
    }
}
