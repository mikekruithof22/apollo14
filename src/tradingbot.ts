import { AllCoinsInformationResponse, CancelSpotOrderResult, ExchangeInfo, MainClient, OrderBookResponse, OrderResponseFull, SpotOrder, SymbolExchangeInfo, SymbolFilter, SymbolLotSizeFilter, SymbolPercentPriceFilter, SymbolPriceFilter, WsMessageSpotUserDataExecutionReportEventFormatted, WsUserDataEvents } from 'binance';
import { AmountAndPrice, ConfigOrderCondition, ConfigOrderConditionOrder } from './models/logic';
import { OrderStatusEnum, OrderTypeEnum } from './models/order';

import { ActiveBuyOrder } from './models/trading-bot';
import BinanceError from './models/binance-error';
import BinanceService from './binance/binance';
import CalculateHelper from './helpers/calculate';
import CandleHelper from './helpers/candle';
import { LightWeightCandle } from './models/candle';
import { LogLevel } from './models/log-level';
import Order from './binance/order';
import { OrderConditionResult } from './models/calculate';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;
    // config
    private brokerApiUrl: string = config.brokerApiUrl;
    private candleInterval: string = config.timeIntervals[0]; // For the time being only one interval, therefore [0].
    private numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    private maxAllowedActiveOrdersForTraidingPair: number = config.production.maxAllowedActiveOrdersForTraidingPair;
    private orderConditions: ConfigOrderCondition[] = config.orderConditions;
    private minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
    private tradingPairs: string[] = config.tradingPairs;
    private rsiCalculationLength: number = config.genericOrder.rsiCalculationLength;
    private limitBuyOrderExpirationTime: number = config.genericOrder.limitBuyOrderExpirationTimeInSeconds * 1000; // multiply with 1000 for milliseconds 
    private doNotOrderWhenRSIValueIsBelow: number = config.genericOrder.doNotOrder.RSIValueIsBelow;
    private pauseConditionActiveboolean = config.production.pauseCondition.active;
    
    // devTest config
    private triggerBuyOrderLogic: boolean = config.production.devTest.triggerBuyOrderLogic;
    private triggerCancelLogic: boolean = config.production.devTest.triggerCancelLogic;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();
    }

    public async runProgram(botPauseActive: boolean) {
        // STEP 1 - Sanity check the config.json.
        const incorrectConfigData: boolean = configChecker.checkConfigData();

        if (incorrectConfigData) {
            txtLogger.writeToLogFile(`The method runProgram() quit because:`);
            txtLogger.writeToLogFile(`The the method checkConfigData() detected wrong config values`);
            return;
        }

        if (this.binanceRest === undefined) {
            txtLogger.writeToLogFile(`The method runProgram() quit because:`);
            txtLogger.writeToLogFile(`Generating binanceRest client failed.`, LogLevel.ERROR);
            return;
        }

        // STEP 2 If USDT is to low, you don't need to run the program, therefore quit.
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }

        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Free USDT balance amount: ${currentFreeUSDTAmount}.`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`The method runProgram() quit because:`);
            txtLogger.writeToLogFile(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        // STEP 3 - Checking crash order conditions and bullish divergences for each tradingpair
        txtLogger.writeToLogFile(`Checking ${this.tradingPairs.length} trading pair(s) for crash condition.`);
        if (!botPauseActive) {
            txtLogger.writeToLogFile(`Checking ${this.orderConditions.length * this.tradingPairs.length} order condition(s) for bullish divergences.`);
        }
        for await (let tradingPair of this.tradingPairs) {

            const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${this.numberOfCandlesToRetrieve}`;

            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: number[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection: number[] = await rsiHelper.calculateRsi(closePriceList, this.rsiCalculationLength);
            const mostRecentRsiValue = rsiCollection[rsiCollection.length - 1];

            for await (let order of this.orderConditions) {
                const orderConditionName: string = `${tradingPair}-${order.name}`;

                if (this.triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                    txtLogger.writeToLogFile(`DEVTEST - Skipping bullish divergence calculation and trigger a limit buy order`);
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
                    botPauseActive
                );

                if (orderConditionResult !== undefined) {

                    if (orderConditionResult.isCrashOrder) {
                        txtLogger.writeToLogFile(`***** Crash condition detected for: ${tradingPair} *****`);
                        txtLogger.writeToLogFile(`Details:`);
                        txtLogger.writeToLogFile(JSON.stringify(orderConditionResult, null, 4))

                        // STEP 4. 
                        //      OPTION I - A crash condition was detected , continue to the ordering logic method.
                        const ordercondition = config.production.largeCrashOrder.order as ConfigOrderConditionOrder;
                        await this.buyLimitOrderLogic(
                            ordercondition,
                            tradingPair,
                            `crashOrder-${tradingPair}`,
                        );
                    } else {
                        txtLogger.writeToLogFile(`***** Bullish divergence detected for: ${orderConditionName} *****`);
                        txtLogger.writeToLogFile(`Details:`);
                        txtLogger.writeToLogFile(JSON.stringify(orderConditionResult, null, 4))
                        txtLogger.writeToLogFile(`The most recent rsi value is: ${orderConditionResult.endiRsiValue}. The minimun configured for this condition is: ${order.rsi.minimumRisingPercentage}`);
                        if (mostRecentRsiValue < this.doNotOrderWhenRSIValueIsBelow) {
                            txtLogger.writeToLogFile(`Because the RSI is lower than minimum configured the program will not place an limit buy order`);
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

        botPauseActive ?
            txtLogger.writeToLogFile(`No crash condition(s) where found during this run.`) :
            txtLogger.writeToLogFile(`No bullish divergence(s) or crash condition(s) where found during this run.`);
    }

    public async buyLimitOrderLogic(
        order: ConfigOrderConditionOrder,
        tradingPair: string,
        orderName: string
    ) {
        txtLogger.writeToLogFile(`The method buyLimitOrderLogic() will try to place a limit buy order`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.takeProfitPercentage;
        const takeLossPercentage: number = order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.maxUsdtBuyAmount;
        const maxPercentageOfBalance: number = order.maxPercentageOfBalance;

        // STEP II. Check current amount off free USDT on the balance and amount of open orders for this trading pair
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`The method buyLimitOrderLogic() quit because:`);
            txtLogger.writeToLogFile(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.writeToLogFile(`The amount of open orders for ${tradingPair} length is equal to: ${activeOrdersForTraidingPair.length}`);
            
            if (activeOrdersForTraidingPair.length >= this.maxAllowedActiveOrdersForTraidingPair) {
                txtLogger.writeToLogFile(`The method buyLimitOrderLogic() quit because:`);
                txtLogger.writeToLogFile(`The configured maximum amount of active orders for this tradingPair - ${activeOrdersForTraidingPair.length} - is larger or equal to the amouunt configured inside the config.json - ${this.maxAllowedActiveOrdersForTraidingPair}`);
                return;
            }
            
            if (activeOrdersForTraidingPair.length >= 5) {
                txtLogger.writeToLogFile(`The method buyLimitOrderLogic() quit because:`);
                txtLogger.writeToLogFile(`Binance does not allow more than 5 automaticly created orders`);
                return;
            }
        }

        // STEP III. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOfBalance);
        txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

        const symbol: string = `symbol=${tradingPair}`; // workaround, npm package sucks
        const exchangeInfo = await this.binanceService.getExchangeInfo(this.binanceRest, symbol) as ExchangeInfo;

        if (exchangeInfo === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`getExchangeInfo() method failed.`, LogLevel.ERROR);
            return;
        }

        const symbolResult: SymbolExchangeInfo = exchangeInfo.symbols.find(r => r.symbol === tradingPair);

        if (symbolResult === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`symbolResult was undefined .`, LogLevel.ERROR);
            return;
        }

        const lotSize: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'LOT_SIZE') as SymbolLotSizeFilter;
        const priceFilter: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'PRICE_FILTER') as SymbolPriceFilter;
        const stepSize: number = exchangeLogic.determineStepSize(lotSize);
        const minimumOrderQuantity: number = exchangeLogic.determineMinQty(lotSize);
        const tickSize: number = exchangeLogic.determineTickSize(priceFilter);

        txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        const percentPriceObj: SymbolPercentPriceFilter  = symbolResult.filters.find(f => f.filterType === 'PERCENT_PRICE') as SymbolPercentPriceFilter;
        const multiplierDown: number = Number(percentPriceObj.multiplierDown);
        const allowedStopLossPercentageBinance: number = 100 - (multiplierDown * 100);
  
        if (takeLossPercentage >= allowedStopLossPercentageBinance) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`The configured takeLossPercentage ${takeLossPercentage} is lower than Binance allows: ${allowedStopLossPercentageBinance}.`);
            txtLogger.writeToLogFile(`****** Creating a buy limit order is useless because later on an OCO sell order will be rejected by Binance. ****** `);
            txtLogger.writeToLogFile(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information`);
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

        txtLogger.writeToLogFile(`Based on the order book the following order limit buy order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}. Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        if (totalUsdtAmount < 11) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`The total usdt amount of the order - ${totalUsdtAmount} - the minimum allowed order quanity: 10 dollar`);
        }

        if (orderAmount < minimumOrderQuantity) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Order quantity is lower than - ${orderAmount} - the minimum allowed order quanity: ${minimumOrderQuantity}`);
            return;
        }

        // STEP V. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`There was an error creating the limit buy order`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Buy order created. Details:`);
        txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}, price: ${buyOrder.price}`);

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

        if (this.triggerCancelLogic === true) { // TESTING PURPOSE ONLY!
            txtLogger.writeToLogFile(`DEVTEST - Cancel the limit buy order immediately`);
            this.cancelLimitBuyOrderCheck(tradingPair, buyOrder.clientOrderId, orderName);
        }

        if (buyOrder.status !== OrderStatusEnum.FILLED) {
            // STEP VI. Activate cancelLimitBuyOrderCheck() because after X seconds you want to cancel the limit buy order if it is not filled.
            if (this.limitBuyOrderExpirationTime > 0) {
                setTimeout(() => {
                    txtLogger.writeToLogFile(`The method cancelLimitBuyOrderCheck() is going to check if the limit buy order - ${orderName} - has been filled within the allocated time: ${this.limitBuyOrderExpirationTime / 1000} seconds`);
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

                    txtLogger.writeToLogFile(`Limit buy order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled`);
                    await this.createOcoOrder(data, clientOrderId, buyOrder);
                } else {
                    txtLogger.writeToLogFile(`Buy order not found inside this.activeBuyOrders: ActiveBuyOrder[]`);
                    // TODO: testmike wil je proces.exit? indien this.activeBuyOrders deze niet langer correct is? 
                }
            }
        }

        // POSSIBILITY II - Order canceled was successfull, in case of partial fill create OCO order
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.CANCELED) {
            const clientOrderId: string = data.newClientOrderId;

            const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);
            txtLogger.writeToLogFile(`Limit buy order with clientOrderId ${clientOrderId} is successfully cancelled.`);

            if (buyOrder !== undefined && buyOrder.status === 'PARTIALLY_FILLED') {
                txtLogger.writeToLogFile(`The limit buy order was PARTIALLY_FILLED. Therefore, the next step will be trying to create an oco order.`);
                await this.createOcoOrder(data, clientOrderId, buyOrder);
            }
        }

        // // POSSIBILITY III - OCO order is finished - ALL_DONE
        if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
            const listClientOrderId = data.listClientOrderId;
            txtLogger.writeToLogFile(`Oco order with listClientOrderId: ${listClientOrderId} is filled. Details:`);
            txtLogger.writeToLogFile(`${JSON.stringify(data, null, 4)}`);
        }
    }

    public async cancelLimitBuyOrderCheck(tradingPair: string, clientOrderId: string, orderName: string) {
        // STEP 1 - check if the limit buy order is not filled yet (it may be partially filled)
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            // TODO: testmike, o.b.v. ronald zijn suggestie van 6-11-2021 - zie email:
            // "Wat je volgens mij moet doen is in de Websocket method als de cancel terugkomt in de activeBuyOrders zoeken naar een clientId die overeenkomt met de origClientOrderId en niet de newClientOrderId."
            const limitBuyOrder: SpotOrder = currentOpenOrders.find(f => f.origQuoteOrderQty === clientOrderId); // was voorheen: clientOrderId

            txtLogger.writeToLogFile(`Checking if it is necessary to cancel the limit buy order with the following details:`);
            txtLogger.writeToLogFile(`orderName: ${orderName}, clientOrderId: ${clientOrderId} `);

            // STEP 2 - If the limit buy order is still open cancel it ('NEW' or 'PARTIALLY_FILLED')
            if (
                limitBuyOrder !== undefined &&
                (limitBuyOrder.status === 'NEW' || limitBuyOrder.status === 'PARTIALLY_FILLED')
            ) {
                txtLogger.writeToLogFile(`Limit buy order status: ${limitBuyOrder.status}`);
                txtLogger.writeToLogFile(`${JSON.stringify(limitBuyOrder)}`);
                txtLogger.writeToLogFile(`Trying to cancel the limit buy order.`);
                const cancelSpotOrderResult: CancelSpotOrderResult = await this.binanceService.cancelOrder(this.binanceRest, tradingPair, limitBuyOrder.orderId);
                txtLogger.writeToLogFile(`The cancel spot order results looks as follows:`);
                txtLogger.writeToLogFile(`${JSON.stringify(cancelSpotOrderResult, null, 4)}`);
            } else {
                txtLogger.writeToLogFile(`Limit buy order was not found among the current open orders and/or the status was not equal to: 'PARTIALLY_FILLED' or 'NEW', therefore nothing to cancel.`);
            }
        } else {
            txtLogger.writeToLogFile(`Currently there are no active open orders, therefore there is nothing to cancel.`);
        }
    }

    public async createOcoOrder(data: WsMessageSpotUserDataExecutionReportEventFormatted, clientOrderId: string, buyOrder: ActiveBuyOrder) {
        txtLogger.writeToLogFile(`The method createOcoOrder() is triggered`);

        const tradingPair: string = data.symbol;
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.writeToLogFile(`The amount of open orders for ${tradingPair} length is equal to: ${activeOrdersForTraidingPair.length}`);
            if (activeOrdersForTraidingPair.length >= 5) {
                txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
                txtLogger.writeToLogFile(`Binance does not allow more than 5 automaticly created orders`);
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
            // TODO: Do we need to do something here?
            txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
        let currentFreeCryptoBalance = Number(currentCryptoBalance.free);

        // todo aram doesn't this mean ALL of the cryptos in the wallet will be sold?
        // Let's say you wanna have 5000 DOT in your portfolio for long term investment, this would sell all of those?
        let ocoOrderAmount: number = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);
        const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;

        // Check when you sell that the oco amount * stopLimitPrice is equal or greather than 10 usdt. 
        let usdtAmountForStopLimitPrice: number = stopLimitPrice * ocoOrderAmount;

        txtLogger.writeToLogFile(`currentCryptoBalance`);
        txtLogger.writeToLogFile(JSON.stringify(currentCryptoBalance));
        txtLogger.writeToLogFile(`currentFreeCryptoBalance: ${currentFreeCryptoBalance}`);

        if ((ocoOrderAmount < minimumOcoOrderQuantity) || (usdtAmountForStopLimitPrice < 10)) {
            txtLogger.writeToLogFile(`Oco order quantity - ${ocoOrderAmount} - is lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);
            txtLogger.writeToLogFile(`Re-retrieving current free balance after a couple of seconds to ensure it's not a timing issue!`);

            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(3000);

            balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
            if (balance instanceof BinanceError) {
                // TODO: Do we need to do something here?
                txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
                return;
            }
            currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
            currentFreeCryptoBalance = Number(currentCryptoBalance.free);
            ocoOrderAmount = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);

            usdtAmountForStopLimitPrice = stopLimitPrice * ocoOrderAmount;

            if (ocoOrderAmount < minimumOcoOrderQuantity) {
                txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
                txtLogger.writeToLogFile(`Oco order quantity - ${ocoOrderAmount} - is STILL lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);

                if (usdtAmountForStopLimitPrice < 10) {
                    const totalStopLossAmount: number = ocoOrderAmount * usdtAmountForStopLimitPrice;
                    txtLogger.writeToLogFile(`The configured takeLossPercentage ${usdtAmountForStopLimitPrice} multiplied by the ${ocoOrderAmount} is equal to ${totalStopLossAmount}`);
                    txtLogger.writeToLogFile(`****** Creating a stoploss price which will lead cummulativly to a lower than 10 USDT price will be rejected by Binance ****** `);
                    txtLogger.writeToLogFile(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information.`);
                }    
                return;
            }
        }

        txtLogger.writeToLogFile(`Trying to create an OCO order`);
        txtLogger.writeToLogFile(`The oco order amount is equal to: ${ocoOrderAmount}`);
        txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        txtLogger.writeToLogFile(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}`);

        const ocoOrder = await this.order.createOcoSellOrder(
            this.binanceRest,
            data.symbol,
            ocoOrderAmount,
            profitPrice,
            stopLossPrice,
            stopLimitPrice
        );

        if (ocoOrder === undefined) {
            txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
            txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);

            const limitSellOrderAmount: number = ocoOrderAmount;
            const limitSellOrderPrice: number = exchangeLogic.roundOrderAmount((data.price * 0.98), stepSize);

            const limitSellOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITSELL, data.symbol, limitSellOrderAmount, limitSellOrderPrice) as OrderResponseFull;
            if (limitSellOrder === undefined) {
                txtLogger.writeToLogFile(`There was an error creating the limit sell order`, LogLevel.ERROR);
            } else {
                txtLogger.writeToLogFile(`Limit sell order created. Details:`);
                txtLogger.writeToLogFile(`Status: ${limitSellOrder.status}, orderId: ${limitSellOrder.orderId}, clientOrderId: ${limitSellOrder.clientOrderId}, price: ${limitSellOrder.price}`);
            }
            txtLogger.writeToLogFile(`***SAFETY MEASURE***: When oco fails the bot will be switched off!`);
            txtLogger.writeToLogFile(`Program is closed by 'process.exit`);

            process.exit();

            return;
        } else {
            // todo aram don't we want to splice the old buy order no matter if the oco order was succesful? Since the buy order was fulfilled? 
            // Or doesn't it matter since the process exits anyway above here when ocoOrder === undefined?
            const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
            if (index > -1) {
                this.activeBuyOrders.splice(index, 1);
            }
            txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
            txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`);
        }
    }

    public async crashDetected() {
        if (!this.pauseConditionActiveboolean) {
            return false;
        }

        const numberOfCandlesToRetrieve: number = config.production.pauseCondition.maxAmountOfCandlesToLookBack;
        const minimumDeclingPercentage: number = config.production.pauseCondition.minimumDeclingPercentage;
        const tradingPair: string = config.production.pauseCondition.tradingPair;
        txtLogger.writeToLogFile(`Checking whether a crash has happened to pause bot for. Trading pair: ${tradingPair}.`);

        const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${numberOfCandlesToRetrieve}`;
        const candleList = await this.candleHelper.retrieveCandles(url);
        const mostRecentCandle = candleList[candleList.length - 1];
        const mostRecentCandleLow = mostRecentCandle[3];
        for (var i = candleList.length - 2; i >= 0; i--) {
            const compareWithCandle = candleList[i];
            const compareWithCandleClose = compareWithCandle[4];
            const closePriceChangePercentage = CalculateHelper.calculatePercentageChange(compareWithCandleClose, mostRecentCandleLow);
            if (closePriceChangePercentage <= minimumDeclingPercentage) {
                txtLogger.writeToLogFile(`Crash detected. Price decline percentage: ${closePriceChangePercentage}.`);
                return true;
            }
        }
        txtLogger.writeToLogFile(`No crash found therefore no need to pause the bot.`);
        return false;
    }
}
