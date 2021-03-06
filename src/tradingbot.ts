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
import Mailer from './helpers/mailer';
import Order from './binance/order';
import { OrderConditionResult } from './models/calculate';
import calculate from './helpers/calculate';
import config from '../config';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private emailListForOrdersWhichWhereTooLongOpen: string[] = [];
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;
    // config
    private brokerApiUrl: string = config.brokerApiUrl;
    private candleInterval: string = config.generic.timeIntervals[0]; // For the time being only one interval, therefore [0].
    private numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    private maxAllowedActiveOrdersForTraidingPair: number = config.production.maxAllowedActiveOrdersForTraidingPair;
    private orderConditions: ConfigOrderCondition[] = config.orderConditions;
    private minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
    private largeCrashOrderActive: boolean = config.production.largeCrashOrder.active;
    private tradingPairs: string[] = config.tradingPairs;
    private baseCoin: string = config.baseCoin;
    private rsiCalculationLength: number = config.generic.order.rsiCalculationLength;
    private limitBuyOrderExpirationTime: number = config.generic.order.limitBuyOrderExpirationTimeInSeconds * 1000; // multiply with 1000 for milliseconds 
    private doNotOrderWhenRSIValueIsBelow: number = config.generic.order.doNotOrder.RSIValueIsBelow;
    private pauseConditionActiveboolean = config.production.pauseCondition.active;

    // devTest config
    private triggerBuyOrderLogic: boolean = config.test.devTest.triggerBuyOrderLogic;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();
        if (this.binanceRest === undefined) {
            txtLogger.writeToLogFile(`The method runProgram() quit because:`);
            txtLogger.writeToLogFile(`Generating binanceRest client failed.`, LogLevel.ERROR);
            process.exit();
        }
    }

    public async runProgram(botPauseActive: boolean) {

        // STEP 0 - check if orders are longer open than configured, if so email.
        await this.emailWhenOrderIsToLongOpenLogic();

        // STEP 1 If USDT is to low, you don't need to run the program, therefore quit.
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

        // STEP 2 - Checking crash order conditions and bullish divergences for each tradingpair & retrieving the 24 hour BTCUSDT statistics
        if (this.largeCrashOrderActive) {
            txtLogger.writeToLogFile(`Checking ${this.tradingPairs.length} trading pair(s) for crash condition.`);
        }
        if (!botPauseActive) {
            txtLogger.writeToLogFile(`Checking ${this.orderConditions.length * this.tradingPairs.length} order condition(s) for bullish divergences.`);
        }

        for await (let pair of this.tradingPairs) {
            const tradingPair: string = `${pair}${this.baseCoin}`;
            const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${this.numberOfCandlesToRetrieve}`;
            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: number[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection: number[] = await rsiHelper.calculateRsi(closePriceList, this.rsiCalculationLength);
            const mostRecentRsiValue = rsiCollection[rsiCollection.length - 1];

            for await (let order of this.orderConditions) {
                const orderConditionName: string = `${pair}-${this.baseCoin}-${order.name}`;

                if (this.triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                    txtLogger.writeToLogFile(`##### DEVTEST - Skipping bullish divergence calculation and trigger a limit buy order. #####`);
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
                    const detectedContent: string = orderConditionResult.isCrashOrder ? 'Crash condition' : 'Bullish divergence';
                    txtLogger.writeToLogFile(`***** ${detectedContent} detected for ${tradingPair} - Order condition name: ${orderConditionName} *****`);

                    txtLogger.writeToLogFile(`Checking if there are already orders open for this tradingPair. In case there are to many open orders a limit buy order will NOT be placed.`);

                    const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
                    if (currentOpenOrders && currentOpenOrders.length > 0) {
                        const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
                        txtLogger.writeToLogFile(`The amount of open orders is equal to: ${activeOrdersForTraidingPair.length}.`);

                        if (activeOrdersForTraidingPair.length > this.maxAllowedActiveOrdersForTraidingPair ||
                            activeOrdersForTraidingPair.length >= 5
                        ) {
                            txtLogger.writeToLogFile(`Limit buy order will NOT be created because of one of the following reasons:`);
                            txtLogger.writeToLogFile(`A. The amount of active orders for this tradingPair - ${activeOrdersForTraidingPair.length} - is larger than the maximum amount configured inside the config.json - ${this.maxAllowedActiveOrdersForTraidingPair}.`, LogLevel.WARN);
                            txtLogger.writeToLogFile(`B. Binance does not allow more than 5 trading bot created orders per trading pair.`);
                            break;
                        }
                    } else {
                        txtLogger.writeToLogFile(`The amount of open orders is equal to: 0.`);
                    }

                    if (orderConditionResult.isCrashOrder) {
                        if (this.largeCrashOrderActive) {
                            // STEP 3. 
                            //      OPTION I - A crash condition was detected , continue to the buyLimitOrderLogic() method.
                            txtLogger.writeToLogFile(`Candle information associated with the crash condition:`);
                            txtLogger.writeToLogFile(JSON.stringify(orderConditionResult, null, 4));

                            const ordercondition = config.production.largeCrashOrder.order as ConfigOrderConditionOrder;
                            await this.buyLimitOrderLogic(
                                ordercondition,
                                tradingPair,
                                `crashOrder-${tradingPair}`,
                            );
                        } else {
                            txtLogger.writeToLogFile(`Crash order will NOT be placed becasue it is turned off (config.production.largeCrashOrder.active === false).`);
                        }
                    } else {
                        txtLogger.writeToLogFile(`Candle details formatted on one line. In case it passes all 24 hour conditions it will be logged again on multiple lines.`);
                        txtLogger.writeToLogFile(JSON.stringify(orderConditionResult));

                        txtLogger.writeToLogFile(`The most recent rsi value is: ${orderConditionResult.endiRsiValue}. The minimum configured for this condition is: ${order.rsi.minimumRisingPercentage}.`);
                        if (mostRecentRsiValue < this.doNotOrderWhenRSIValueIsBelow) {
                            txtLogger.writeToLogFile(`Because the RSI is lower than minimum configured the program will not place an limit buy order.`);
                            break;
                        }
                        if (order.doNotOrder.btc24HourChange.active) {
                            const skip = await this.skipBasedOn24HourChangeStatistics('BTCUSDT', order.doNotOrder.btc24HourChange.percentage);
                            if (skip) { break; }
                        }

                        if (order.doNotOrder.coin24HourChange.active) {
                            const skip = await this.skipBasedOn24HourChangeStatistics(tradingPair, order.doNotOrder.coin24HourChange.percentage);
                            if (skip) { break; }
                        }

                        txtLogger.writeToLogFile(`Candle details formatted on multiple lines:`);
                        txtLogger.writeToLogFile(JSON.stringify(orderConditionResult, null, 4));

                        // STEP 3. 
                        //      OPTION II - A bullish divergence was found, continue to the buyLimitOrderLogic() method.
                        await this.buyLimitOrderLogic(
                            order.order,
                            tradingPair,
                            orderConditionName
                        );
                    }
                    // TODO: testmike, for now we will 'RETURN' out of the loop once we trigger the buy buyLimitOrderLogic
                    // This makes the program, for the time being way simpler! In the future we can let it continue.
                    return;
                }
            }
        }

        botPauseActive ?
            txtLogger.writeToLogFile(`No crash condition(s) found during this run.`) :
            txtLogger.writeToLogFile(`No bullish divergence(s) or crash condition(s) found during this run.`);
    }

    public async buyLimitOrderLogic(
        order: ConfigOrderConditionOrder,
        tradingPair: string,
        orderName: string
    ) {
        txtLogger.writeToLogFile(`The method buyLimitOrderLogic() will try to place a limit buy order.`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.takeProfitPercentage;
        const takeLossPercentage: number = order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.maxUsdtBuyAmount;
        const maxPercentageOfBalance: number = order.maxPercentageOfBalance;

        // STEP II. Check current amount of free USDT on the balance
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}.`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`The method buyLimitOrderLogic() quit because:`);
            txtLogger.writeToLogFile(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        // STEP III. Determine how much you can spend at the next buy order based on the order book.
        const amountOfUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOfBalance);
        txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOfUSDTToSpend}.`);

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
            txtLogger.writeToLogFile(`symbolResult was undefined.`, LogLevel.ERROR);
            return;
        }

        const lotSize: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'LOT_SIZE') as SymbolLotSizeFilter;
        const priceFilter: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'PRICE_FILTER') as SymbolPriceFilter;
        const stepSize: number = exchangeLogic.getdecimals(lotSize.stepSize as string);
        const tickSize: number = exchangeLogic.getdecimals(priceFilter.tickSize as string);
        const minimumOrderQuantity: number = exchangeLogic.determineMinQty(lotSize);

        txtLogger.writeToLogFile(`The step size in decimals - which will be used in order to calculate the amount - is: ${stepSize}.`);
        txtLogger.writeToLogFile(`The tick size in decimals - which will be used in order to calculate the the price - is: ${tickSize}.`);

        const percentPriceObj: SymbolPercentPriceFilter = symbolResult.filters.find(f => f.filterType === 'PERCENT_PRICE') as SymbolPercentPriceFilter;
        const multiplierDown: number = Number(percentPriceObj.multiplierDown);
        const allowedStopLossPercentageBinance: number = 100 - (multiplierDown * 100);

        if (takeLossPercentage > allowedStopLossPercentageBinance) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`The configured takeLossPercentage ${takeLossPercentage} is higher than Binance allows: ${allowedStopLossPercentageBinance}.`);
            txtLogger.writeToLogFile(`****** Creating a buy limit order is useless because later on an OCO sell order will be rejected by Binance. ****** `);
            txtLogger.writeToLogFile(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information.`, LogLevel.WARN);
            return;
        }

        // STEP IV. Calculate order amount and price based on order book
        const currentOrderBook = await this.binanceService.getOrderBook(this.binanceRest, tradingPair) as OrderBookResponse;
        const orderPriceAndAmount: AmountAndPrice = exchangeLogic.calcOrderAmountAndPrice(
            currentOrderBook.asks,
            amountOfUSDTToSpend,
            stepSize
        );

        const orderPrice: number = orderPriceAndAmount.price;
        const orderAmount: number = orderPriceAndAmount.amount;
        const totalUsdtAmount: number = orderPriceAndAmount.totalUsdtAmount;

        if ((totalUsdtAmount < 11) || (orderAmount < minimumOrderQuantity)) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because of one of the following options:`);
            txtLogger.writeToLogFile(`OPTION B - The total usdt amount ${totalUsdtAmount} is lower than the minimum allowed: 11 dollar.`);
            txtLogger.writeToLogFile(`OPTION B - The order amount ${orderAmount} is lower than the minimum order quantity ${minimumOrderQuantity} that Binance allows.`);
            txtLogger.writeToLogFile(`It is higly recommended to change the 'maxPercentageOfBalance' inside the config.json based on this information.`, LogLevel.WARN);
            return;
        }

        txtLogger.writeToLogFile(`Based on the order book the following order limit buy order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}. Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        // STEP V. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`There was an error creating the limit buy order.`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Buy order created. Details:`);
        txtLogger.writeToLogFile(`${JSON.stringify(buyOrder, null, 4)}`);

        if (config.generic.emailWhenBuyOrderCreated === true) {
            Mailer.Send(`Limit buy order created ${buyOrder.clientOrderId}`, `Limit buy order details: ${JSON.stringify(buyOrder, null, 4)}`);
        }

        if (buyOrder.status === OrderStatusEnum.PARTIALLY_FILLED ||
            buyOrder.status === OrderStatusEnum.NEW ||
            buyOrder.status === OrderStatusEnum.FILLED
        ) {
            const currentBuyOrder: ActiveBuyOrder = {
                price: Number(buyOrder.price),
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
                    txtLogger.writeToLogFile(`The method cancelLimitBuyOrderCheck() is going to check if the limit buy order - ${orderName} - has been filled within the allocated time: ${this.limitBuyOrderExpirationTime / 1000} seconds.`);
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
                txtLogger.writeToLogFile(`### Execution report for the FILLED limit buy order:`);
                txtLogger.writeToLogFile(`${JSON.stringify(data, null, 4)}`);

                if (buyOrder !== undefined) {
                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
                    this.activeBuyOrders[index].status = 'FILLED';

                    txtLogger.writeToLogFile(`Limit buy order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled.`);
                    await this.createOcoOrder(data, clientOrderId, buyOrder);
                } else {
                    txtLogger.writeToLogFile(`Limit buy order not found inside this.activeBuyOrders: ActiveBuyOrder[]. No worries when you sold a coin manually. Than this is as expected.`, LogLevel.WARN);
                }
            }
        }

        // POSSIBILITY II - Order cancel was successful, in case of partial fill create OCO order
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.CANCELED) {
            const clientOrderId: string = data.originalClientOrderId; // TODO: kijken of 'newClientOrderId' juist vervangen is door: 'originalClientOrderId'
            txtLogger.writeToLogFile(`Limit buy order with clientOrderId ${clientOrderId} is successfully cancelled.`);
            txtLogger.writeToLogFile(`### Execution report for limit buy order which was CANCELED:`);
            txtLogger.writeToLogFile(`${JSON.stringify(data, null, 4)}`);

            const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);

            if (buyOrder !== undefined && buyOrder.status === 'PARTIALLY_FILLED') {
                txtLogger.writeToLogFile(`The limit buy order was PARTIALLY_FILLED. Therefore, the next step will be trying to create an oco order.`);
                await this.createOcoOrder(data, clientOrderId, buyOrder);
            }
        }

        // // POSSIBILITY III - OCO order is finished - ALL_DONE
        if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
            const listClientOrderId = data.listClientOrderId;
            txtLogger.writeToLogFile(`Oco order with listClientOrderId: ${listClientOrderId} is filled.`);
            txtLogger.writeToLogFile(`### List status report for OCO order which is finished (ALL_DONE):`);
            txtLogger.writeToLogFile(`${JSON.stringify(data, null, 4)}`);
        }
    }

    public async cancelLimitBuyOrderCheck(tradingPair: string, clientOrderId: string, orderName: string) {
        // STEP 1 - check if the limit buy order is not filled yet (it may be partially filled)
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const limitBuyOrder: SpotOrder = currentOpenOrders.find(f => f.clientOrderId === clientOrderId);
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
                txtLogger.writeToLogFile(`Limit buy order was not found among the current open orders and/or the status was not equal to: 'PARTIALLY_FILLED' or 'NEW', therefore nothing to cancel.`, LogLevel.WARN);
            }
        } else {
            txtLogger.writeToLogFile(`Currently there are no active open orders, therefore there is nothing to cancel.`);
        }
    }

    public async createOcoOrder(data: WsMessageSpotUserDataExecutionReportEventFormatted, clientOrderId: string, buyOrder: ActiveBuyOrder) {
        txtLogger.writeToLogFile(`The method createOcoOrder() is triggered.`);
        txtLogger.writeToLogFile(`NOTE: the limit buy was filled for the following price: ${data.price}.`);

        txtLogger.writeToLogFile(`The clientOrderId which binance provides is equal to: ${clientOrderId}. The ActiveBuyOrder details:`);
        txtLogger.writeToLogFile(`${JSON.stringify(buyOrder, null, 4)}`);

        // STEP 1 - Check if there are more than 5 bot generated orders. If yes return, because Binance does not allow more than 5
        const tradingPair: string = data.symbol;
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.writeToLogFile(`The amount of open orders for ${tradingPair} length is equal to: ${activeOrdersForTraidingPair.length}.`);
            if (activeOrdersForTraidingPair.length >= 5) {
                txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
                txtLogger.writeToLogFile(`Binance does not allow more than 5 automaticly created orders.`);
                return;
            }
        }

        // STEP 2 - Retrieve balance, in case of a (potential) timing issue retrieve the balance again
        const coinName: string = data.symbol.replace('USDT', '');
        let balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
        let currentFreeCryptoBalance = Number(currentCryptoBalance.free);
        let currentFreeCryptoBalanceInUSDT: number = currentFreeCryptoBalance * data.price

        txtLogger.writeToLogFile(`Current crypto balance for ${coinName} (including the non-free part).`);
        txtLogger.writeToLogFile(JSON.stringify(currentCryptoBalance));
        txtLogger.writeToLogFile(`Current free crypto balance in USDT for ${coinName}: ${currentFreeCryptoBalance} * coinprice = ${currentFreeCryptoBalanceInUSDT}.`);

        if (currentFreeCryptoBalanceInUSDT < 10) {
            txtLogger.writeToLogFile(`The current free balance for ${coinName} is lower than 10 USDT. It is equal to: ${currentFreeCryptoBalance}.`);
            txtLogger.writeToLogFile(`Re-retrieving the balance after a couple of seconds to ensure it's not a timing issue!`);

            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(3000);

            balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
            if (balance instanceof BinanceError) {
                txtLogger.writeToLogFile(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
                return;
            }
            currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
            currentFreeCryptoBalance = Number(currentCryptoBalance.free);
            currentFreeCryptoBalanceInUSDT = currentFreeCryptoBalance * data.price

            if (currentFreeCryptoBalanceInUSDT < 10) {
                txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
                txtLogger.writeToLogFile(`Current free crypto balance in USDT for ${coinName}: ${currentFreeCryptoBalance} * coinprice = ${currentFreeCryptoBalanceInUSDT}.`);
                txtLogger.writeToLogFile(`USDT amount is STILL lower than 10 USDT. Therefore quit.`);
                return;
            }
        }

        // STEP 3 - Prepare all OCO order related data
        const stepSize: number = buyOrder.stepSize;
        const tickSize: number = buyOrder.tickSize;

        const profitPrice: number = exchangeLogic.calcProfitPrice(Number(data.price), buyOrder.takeProfitPercentage, tickSize);
        const stopLossPrice: number = exchangeLogic.calcStopLossPrice(Number(data.price), buyOrder.takeLossPercentage, tickSize);
        const stopLimitPrice: number = exchangeLogic.calcStopLimitPrice(stopLossPrice, tickSize);

        // TODO: testmike - ocoOrderAmount. NOTE: ALL of the crypto trading pairs inside the wallet will be sold!
        const ocoOrderAmount: number = exchangeLogic.roundDown(currentFreeCryptoBalance, stepSize);
        const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;

        const usdtAmountForProfitPrice: number = profitPrice * ocoOrderAmount;
        const usdtAmountForStopLimitPrice: number = stopLimitPrice * ocoOrderAmount;
        const usdtAmountForStopLossPrice: number = stopLossPrice * ocoOrderAmount;

        // STEP 4 - Execute several OCO related sanity checks
        if ((ocoOrderAmount < minimumOcoOrderQuantity) || (usdtAmountForProfitPrice < 11) || (usdtAmountForStopLimitPrice < 11) || (usdtAmountForStopLossPrice < 11)) {
            txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
            txtLogger.writeToLogFile(`One of the following values is lower than minimum of 10 usdt or the minimum order quanity is not met:`);
            txtLogger.writeToLogFile(`A. USDT amount for profit price: ${usdtAmountForProfitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLimitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLossPrice}.`)
            txtLogger.writeToLogFile(`B. Minimum oco order quanitity amount: ${minimumOcoOrderQuantity}, actual amount: ${ocoOrderAmount}.`);

            txtLogger.writeToLogFile(`****** Creating an oco order with values lower than 10 USDT price will be rejected by Binance. ******`);
            txtLogger.writeToLogFile(`It is higly recommended to change the 'takeLossPercentage' inside the config.json based on this information.`, LogLevel.WARN);
            return;
        }

        // STEP 5 - Try to create an OCO order
        txtLogger.writeToLogFile(`Trying to create an OCO order.`);
        txtLogger.writeToLogFile(`The oco order amount is equal to: ${ocoOrderAmount}`);
        txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}.`);
        txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}.`);
        txtLogger.writeToLogFile(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}.`);

        const ocoOrder = await this.order.createOcoSellOrder(
            this.binanceRest,
            data.symbol,
            ocoOrderAmount,
            profitPrice,
            stopLossPrice,
            stopLimitPrice
        );

        if (ocoOrder !== undefined) {
            // STEP 6 
            //      OPTION I -OCO order is succesfull
            const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
            if (index > -1) {
                this.activeBuyOrders.splice(index, 1);
            }
            txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
            txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder, null, 4)}`);
        } else {
            // STEP 6 
            //      OPTION II -OCO order is NOT succesfull, switch off the bot
            txtLogger.writeToLogFile(`The method createOcoOrder() quit because:`);
            txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);

            const limitSellOrderAmount: number = ocoOrderAmount;
            const limitSellOrderPrice: number = exchangeLogic.roundDown((data.price * 0.98), stepSize);

            const limitSellOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITSELL, data.symbol, limitSellOrderAmount, limitSellOrderPrice) as OrderResponseFull;
            if (limitSellOrder === undefined) {
                txtLogger.writeToLogFile(`There was an error creating the limit sell order.`, LogLevel.ERROR);
            } else {
                txtLogger.writeToLogFile(`Limit sell order created. Details:`);
                txtLogger.writeToLogFile(`Status: ${limitSellOrder.status}, orderId: ${limitSellOrder.orderId}, clientOrderId: ${limitSellOrder.clientOrderId}, price: ${limitSellOrder.price}.`);
            }
            txtLogger.writeToLogFile(`***SAFETY MEASURE***: When oco fails the bot will be switched off!`);
            txtLogger.writeToLogFile(`Program is closed by 'process.exit.`);
            Mailer.Send('OOC order failed => bot switched off', `***SAFETY MEASURE***: When oco fails the bot will be switched off!`);

            process.exit();
            return;
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

    private async skipBasedOn24HourChangeStatistics(tradingPair: string, change24HourPercentage: number): Promise<boolean> {
        let orderingAllowed: boolean;
        const coinStatistics = await this.binanceService.get24hrChangeStatististics(this.binanceRest, tradingPair);
        if (coinStatistics === undefined) {
            txtLogger.writeToLogFile(`Something went wrong while retrieving the 24 hour ${tradingPair} statistics. Therefore the 24 hour change cannot be determined.`, LogLevel.WARN);
            txtLogger.writeToLogFile(`CONSEQUENCE: the checks with regard to 24 hour statistics cannot be executed.`);
            orderingAllowed = false;
        } else {
            const coin24HourChange: number = coinStatistics.priceChangePercent;
            if (change24HourPercentage > coin24HourChange) {
                txtLogger.writeToLogFile(`Limit buy order will NOT be created because:`);
                txtLogger.writeToLogFile(`REASON: Last 24 hour ${tradingPair} has dropped or risen ${coin24HourChange}% which is less than ${change24HourPercentage}% which is configured inside the config.json.`);
                orderingAllowed = true;
            }
        }
        return orderingAllowed;
    }

    public async emailWhenOrderIsToLongOpenLogic(): Promise<void> {
        const emailWhenOrdersIsOpenAfterCandleAmount: number = config.generic.emailWhenOrdersIsOpenAfterCandleAmount
        txtLogger.writeToLogFile(`Checking if there are orders longer active than ${emailWhenOrdersIsOpenAfterCandleAmount}. If so you will receive an email notification.`);

        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest);

        this.emailListForOrdersWhichWhereTooLongOpen
        
        if (currentOpenOrders && currentOpenOrders.length > 0) {

            currentOpenOrders.forEach(order => {
                const emailAlreadySendDuringPreviousRun: boolean = this.emailListForOrdersWhichWhereTooLongOpen.find(id => id === order.clientOrderId) !== undefined;
                if (emailAlreadySendDuringPreviousRun === true) { return }

                const orderDate: Date = new Date(order.time);
                const currentDate = new Date();
                const minutesToAdd = 15 * emailWhenOrdersIsOpenAfterCandleAmount; // Multiply by 15 because the time interval is 15 right now
                const dateWhenLimitWasReached = new Date(orderDate.getTime() + minutesToAdd * 60000);

                if (currentDate > dateWhenLimitWasReached) {
                    Mailer.Send(`${order.clientOrderId} - ${order.type} order is open for too long`, `${order.type} order is open for too long. Details: ${JSON.stringify(order, null, 4)}`);
                    txtLogger.writeToLogFile(`EMAIL was sent with the following content:`);
                    txtLogger.writeToLogFile(`${order.clientOrderId} - ${order.type} order is open for too long. ${order.type} order is open for too long. Details: ${JSON.stringify(order)}`);
                    this.emailListForOrdersWhichWhereTooLongOpen.push(order.clientOrderId);
                }
            });
        }

        if (currentOpenOrders && currentOpenOrders === []) {
            // TODO: testmike, create a propper solution 
            // "Smerige oplossing", in case there are no active orders at all we can reset 'emailListForOrdersWhichWhereTooLongOpen: string[]';
            // possible you want to have a check here: if(data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE')
            this.emailListForOrdersWhichWhereTooLongOpen = [];
        }
    }
}
