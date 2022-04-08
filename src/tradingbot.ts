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
import Mailer from './helpers/mailer';
import { OrderConditionResult } from './models/calculate';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance-service/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private emailListForOrdersWhichWhereTooLongOpen: string[] = []; // todo aram can be taken out of private, and retrieved ad hoc
    private activeBuyOrders: ActiveBuyOrder[] = []; // todo aram possibly move up to main
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;
    public botCurrentlyPaused: boolean = false;

    // config
    private brokerApiUrl: string = config.brokerApiUrl;
    private candleInterval: string = config.generic.timeIntervals[0]; // For the time being only one interval, therefore [0].
    private numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    private maxAllowedActiveOrdersForTraidingPair: number = config.production.maxAllowedActiveOrdersForTraidingPair;
    private orderStrategies: ConfigOrderCondition[] = config.orderConditions;
    private minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
    private largeCrashOrderActive: boolean = config.production.largeCrashOrder.active;
    private coins: string[] = config.tradingPairs;
    private baseCoin: string = config.baseCoin;
    private rsiCalculationLength: number = config.generic.order.rsiCalculationLength;
    private limitBuyOrderExpirationTime: number = config.generic.order.limitBuyOrderExpirationTimeInSeconds * 1000; // multiply with 1000 for milliseconds 
    private doNotOrderWhenRSIValueIsBelow: number = config.generic.order.doNotOrder.RSIValueIsBelow;
    private pauseOnCrash = config.production.pauseCondition.active;

    // devTest config
    private triggerBuyOrderLogic: boolean = config.test.devTest.triggerBuyOrderLogic;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();

        txtLogger.log(`New TradingBot created`);
    }

    public async runProgram(botPauseActive: boolean) { 
        if (this.binanceRest === undefined) {
            txtLogger.log(`The method runProgram() quit because generating binanceRest client failed.`, LogLevel.ERROR);
            return;
        }

        // todo aram this can actually be called from main async, as the rest of the program has no dependencies on this code
        // Check if orders are open longer than allowed in Config
        await this.handleExpiredOrder(); // aram checked

        // Check if USDT is too low, if so bot can't do anything so quit
        const notEnoughUsdt = await this.minimumUsdtCheck();
        if (notEnoughUsdt) { return; }

        for await (let coin of this.coins) {
            //#region vars
            const tradingPair: string = `${coin}${this.baseCoin}`;
            const url: string = `${this.brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${this.candleInterval}&limit=${this.numberOfCandlesToRetrieve}`;
            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: number[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection: number[] = await rsiHelper.calculateRsi(closePriceList, this.rsiCalculationLength);
            const mostRecentRsiValue = rsiCollection[rsiCollection.length - 1];
            //#endregion
            
            // if max orders have been reached, the bot can't do anything so skip
            const maxOrdersReached = this.maxOrderReachedCheck(tradingPair);
            if (maxOrdersReached) { break; }

            // possible place crash order
            const crashOrderPlaced = this.handleCrashOrderLogic(tradingPair);
            if (crashOrderPlaced) { break; }

            // todo aram maybe add the crashorder stuff here, and break out of the coin loop if the crash order is met (since we don't care about the coin if it's crashing)
            for await (let strategy of this.orderStrategies) {
                const orderConditionName: string = `${coin}-${this.baseCoin}-${strategy.name}`; // todo aram in the new config situation this is done in the config parser

                const shouldSkip = this.skipStrategyConditionsCheck(orderConditionName, tradingPair, mostRecentRsiValue, strategy);
                if (shouldSkip) { break; }

                // todo aram to be moved to main if possible (probably after new config model is implemented)
                await this.forceBuyOrder();

                // todo aram, figure out why botCurrentlyPaused is required here, if it's paused it shouldn't calculate the divergence or do anything else i guess
                const bullishDivergence: OrderConditionResult = calculate.calculateBullishDivergenceOrCrashOrder(strategy, closePriceList, candleObjectList, rsiCollection, orderConditionName, this.botCurrentlyPaused);

                if (bullishDivergence !== undefined) {
                    txtLogger.log(`***** Bullish divergence detected for ${tradingPair} - Order condition name: ${orderConditionName} *****`);
                    txtLogger.log(`Candle details formatted on multiple lines:`);
                    txtLogger.log(JSON.stringify(bullishDivergence, null, 4));

                    // STEP 3. 
                    //      OPTION II - A bullish divergence was found, continue to the buyLimitOrderLogic() method.
                    await this.buyLimitOrderLogic(
                        strategy.order,
                        tradingPair,
                        orderConditionName
                    );
                    
                    return;
                }
            }
        }
    }

    public async buyLimitOrderLogic(
        order: ConfigOrderConditionOrder,
        tradingPair: string,
        orderName: string
    ) {
        txtLogger.log(`The method buyLimitOrderLogic() will try to place a limit buy order.`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.takeProfitPercentage;
        const takeLossPercentage: number = order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.maxUsdtBuyAmount;
        const maxPercentageOfBalance: number = order.maxPercentageOfBalance;

        // STEP II. Check current amount of free USDT on the balance
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.log(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}.`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.log(`The method buyLimitOrderLogic() quit because:`);
            txtLogger.log(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return;
        }

        // STEP III. Determine how much you can spend at the next buy order based on the order book.
        const amountOfUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOfBalance);
        txtLogger.log(`The allocated USDT amount for this order is equal to: ${amountOfUSDTToSpend}.`);

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
            txtLogger.log(`symbolResult was undefined.`, LogLevel.ERROR);
            return;
        }

        const lotSize: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'LOT_SIZE') as SymbolLotSizeFilter;
        const priceFilter: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'PRICE_FILTER') as SymbolPriceFilter;
        const stepSize: number = exchangeLogic.getdecimals(lotSize.stepSize as string);
        const tickSize: number = exchangeLogic.getdecimals(priceFilter.tickSize as string);
        const minimumOrderQuantity: number = exchangeLogic.determineMinQty(lotSize);

        txtLogger.log(`The step size in decimals - which will be used in order to calculate the amount - is: ${stepSize}.`);
        txtLogger.log(`The tick size in decimals - which will be used in order to calculate the the price - is: ${tickSize}.`);

        const percentPriceObj: SymbolPercentPriceFilter = symbolResult.filters.find(f => f.filterType === 'PERCENT_PRICE') as SymbolPercentPriceFilter;
        const multiplierDown: number = Number(percentPriceObj.multiplierDown);
        const allowedStopLossPercentageBinance: number = 100 - (multiplierDown * 100);

        if (takeLossPercentage > allowedStopLossPercentageBinance) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`The configured takeLossPercentage ${takeLossPercentage} is higher than Binance allows: ${allowedStopLossPercentageBinance}.`);
            txtLogger.log(`****** Creating a buy limit order is useless because later on an OCO sell order will be rejected by Binance. ****** `);
            txtLogger.log(`It is higly recommended to change the takeLossPercentage inside the config.json based on this information.`, LogLevel.WARN);
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
            txtLogger.log(`Buy ordering logic is cancelled because of one of the following options:`);
            txtLogger.log(`OPTION B - The total usdt amount ${totalUsdtAmount} is lower than the minimum allowed: 11 dollar.`);
            txtLogger.log(`OPTION B - The order amount ${orderAmount} is lower than the minimum order quantity ${minimumOrderQuantity} that Binance allows.`);
            txtLogger.log(`It is higly recommended to change the 'maxPercentageOfBalance' inside the config.json based on this information.`, LogLevel.WARN);
            return;
        }

        txtLogger.log(`Based on the order book the following order limit buy order will be (very likely) filled immediately:`);
        txtLogger.log(`Price: ${orderPrice}. Amount: ${orderAmount}. Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        // STEP V. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.log(`Buy ordering logic is cancelled because:`);
            txtLogger.log(`There was an error creating the limit buy order.`, LogLevel.ERROR);
            return;
        }
        txtLogger.log(`Buy order created. Details:`);
        txtLogger.log(`${JSON.stringify(buyOrder, null, 4)}`);

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
                    txtLogger.log(`The method cancelLimitBuyOrderCheck() is going to check if the limit buy order - ${orderName} - has been filled within the allocated time: ${this.limitBuyOrderExpirationTime / 1000} seconds.`);
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
                txtLogger.log(`### Execution report for the FILLED limit buy order:`);
                txtLogger.log(`${JSON.stringify(data, null, 4)}`);

                if (buyOrder !== undefined) {
                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
                    this.activeBuyOrders[index].status = 'FILLED';

                    txtLogger.log(`Limit buy order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled.`);
                    await this.createOcoOrder(data, clientOrderId, buyOrder);
                } else {
                    txtLogger.log(`Limit buy order not found inside this.activeBuyOrders: ActiveBuyOrder[]. No worries when you sold a coin manually. Than this is as expected.`, LogLevel.WARN);
                }
            }
        }

        // POSSIBILITY II - Order cancel was successful, in case of partial fill create OCO order
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.CANCELED) {
            const clientOrderId: string = data.originalClientOrderId;
            txtLogger.log(`Limit buy order with clientOrderId ${clientOrderId} is successfully cancelled.`);
            txtLogger.log(`### Execution report for limit buy order which was CANCELED:`);
            txtLogger.log(`${JSON.stringify(data, null, 4)}`);

            const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);

            if (buyOrder !== undefined && buyOrder.status === 'PARTIALLY_FILLED') {
                txtLogger.log(`The limit buy order was PARTIALLY_FILLED. Therefore, the next step will be trying to create an oco order.`);
                await this.createOcoOrder(data, clientOrderId, buyOrder);
            }
        }

        // // POSSIBILITY III - OCO order is finished - ALL_DONE
        if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
            const listClientOrderId = data.listClientOrderId;
            txtLogger.log(`Oco order with listClientOrderId: ${listClientOrderId} is filled.`);
            txtLogger.log(`### List status report for OCO order which is finished (ALL_DONE):`);
            txtLogger.log(`${JSON.stringify(data, null, 4)}`);
        }
    }

    public async cancelLimitBuyOrderCheck(tradingPair: string, clientOrderId: string, orderName: string) {
        // STEP 1 - check if the limit buy order is not filled yet (it may be partially filled)
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
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
                txtLogger.log(`Limit buy order was not found among the current open orders and/or the status was not equal to: 'PARTIALLY_FILLED' or 'NEW', therefore nothing to cancel.`, LogLevel.WARN);
            }
        } else {
            txtLogger.log(`Currently there are no active open orders, therefore there is nothing to cancel.`);
        }
    }

    public async createOcoOrder(data: WsMessageSpotUserDataExecutionReportEventFormatted, clientOrderId: string, buyOrder: ActiveBuyOrder) {
        txtLogger.log(`The method createOcoOrder() is triggered.`);
        txtLogger.log(`NOTE: the limit buy was filled for the following price: ${data.price}.`);

        txtLogger.log(`The clientOrderId which binance provides is equal to: ${clientOrderId}. The ActiveBuyOrder details:`);
        txtLogger.log(`${JSON.stringify(buyOrder, null, 4)}`);

        // STEP 1 - Check if there are more than 5 bot generated orders. If yes return, because Binance does not allow more than 5
        const tradingPair: string = data.symbol;
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.log(`The amount of open orders for ${tradingPair} length is equal to: ${activeOrdersForTraidingPair.length}.`);
            if (activeOrdersForTraidingPair.length >= 5) {
                txtLogger.log(`The method createOcoOrder() quit because:`);
                txtLogger.log(`Binance does not allow more than 5 automaticly created orders.`);
                return;
            }
        }

        // STEP 2 - Retrieve balance, in case of a (potential) timing issue retrieve the balance again
        const coinName: string = data.symbol.replace('USDT', '');
        let balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            return;
        }
        let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
        let currentFreeCryptoBalance = Number(currentCryptoBalance.free);
        let currentFreeCryptoBalanceInUSDT: number = currentFreeCryptoBalance * data.price

        txtLogger.log(`Current crypto balance for ${coinName} (including the non-free part).`);
        txtLogger.log(JSON.stringify(currentCryptoBalance));
        txtLogger.log(`Current free crypto balance in USDT for ${coinName}: ${currentFreeCryptoBalance} * coinprice = ${currentFreeCryptoBalanceInUSDT}.`);

        if (currentFreeCryptoBalanceInUSDT < 10) {
            txtLogger.log(`The current free balance for ${coinName} is lower than 10 USDT. It is equal to: ${currentFreeCryptoBalance}.`);
            txtLogger.log(`Re-retrieving the balance after a couple of seconds to ensure it's not a timing issue!`);

            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(3000);

            balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
            if (balance instanceof BinanceError) {
                txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
                return;
            }
            currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
            currentFreeCryptoBalance = Number(currentCryptoBalance.free);
            currentFreeCryptoBalanceInUSDT = currentFreeCryptoBalance * data.price

            if (currentFreeCryptoBalanceInUSDT < 10) {
                txtLogger.log(`The method createOcoOrder() quit because:`);
                txtLogger.log(`Current free crypto balance in USDT for ${coinName}: ${currentFreeCryptoBalance} * coinprice = ${currentFreeCryptoBalanceInUSDT}.`);
                txtLogger.log(`USDT amount is STILL lower than 10 USDT. Therefore quit.`);
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
            txtLogger.log(`The method createOcoOrder() quit because:`);
            txtLogger.log(`One of the following values is lower than minimum of 10 usdt or the minimum order quanity is not met:`);
            txtLogger.log(`A. USDT amount for profit price: ${usdtAmountForProfitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLimitPrice}, usdt amount for stop limit price: ${usdtAmountForStopLossPrice}.`)
            txtLogger.log(`B. Minimum oco order quanitity amount: ${minimumOcoOrderQuantity}, actual amount: ${ocoOrderAmount}.`);

            txtLogger.log(`****** Creating an oco order with values lower than 10 USDT price will be rejected by Binance. ******`);
            txtLogger.log(`It is higly recommended to change the 'takeLossPercentage' inside the config.json based on this information.`, LogLevel.WARN);
            return;
        }

        // STEP 5 - Try to create an OCO order
        txtLogger.log(`Trying to create an OCO order.`);
        txtLogger.log(`The oco order amount is equal to: ${ocoOrderAmount}`);
        txtLogger.log(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}.`);
        txtLogger.log(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}.`);
        txtLogger.log(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}.`);

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
            txtLogger.log(`Oco Order was successfully created. Details:`);
            txtLogger.log(`${JSON.stringify(ocoOrder, null, 4)}`);
        } else {
            // STEP 6 
            //      OPTION II -OCO order is NOT succesfull, switch off the bot
            txtLogger.log(`The method createOcoOrder() quit because:`);
            txtLogger.log(`Oco order creation failed.`, LogLevel.ERROR);

            const limitSellOrderAmount: number = ocoOrderAmount;
            const limitSellOrderPrice: number = exchangeLogic.roundDown((data.price * 0.98), stepSize);

            const limitSellOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITSELL, data.symbol, limitSellOrderAmount, limitSellOrderPrice) as OrderResponseFull;
            if (limitSellOrder === undefined) {
                txtLogger.log(`There was an error creating the limit sell order.`, LogLevel.ERROR);
            } else {
                txtLogger.log(`Limit sell order created. Details:`);
                txtLogger.log(`Status: ${limitSellOrder.status}, orderId: ${limitSellOrder.orderId}, clientOrderId: ${limitSellOrder.clientOrderId}, price: ${limitSellOrder.price}.`);
            }
            txtLogger.log(`***SAFETY MEASURE***: When oco fails the bot will be switched off!`);
            txtLogger.log(`Program is closed by 'process.exit.`);
            Mailer.Send('OOC order failed => bot switched off', `***SAFETY MEASURE***: When oco fails the bot will be switched off!`);

            process.exit();
            return;
        }
    }

     // todo aram make distinction for btc crash and coin specific crash?
    public async checkForCrash() {
        if (!this.pauseOnCrash) {
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

    private async forceBuyOrder() {
        // const orderConditionName = 'FORCED ORDER ${config.testing.ForceBuyOrder.Tradingpair} bla bla' 
        if (this.triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
            txtLogger.log(`##### DEVTEST - Skipping bullish divergence calculation and trigger a limit buy order. #####`);
            // await this.buyLimitOrderLogic(
            //     strategy.order,
            //     tradingPair,
            //     orderConditionName,
            // );
        }
    }

    private async skipStrategyConditionsCheck(orderConditionName: string, tradingPair: string, mostRecentRsiValue: number, strategy: ConfigOrderCondition): Promise<boolean> {
            txtLogger.log(`Checking do not order conditions for orderStrategy=${orderConditionName}:`);
            if (mostRecentRsiValue < this.doNotOrderWhenRSIValueIsBelow) {
                txtLogger.log(`The most recent rsi value is: ${mostRecentRsiValue}. The minimum configured for this condition is: ${strategy.rsi.minimumRisingPercentage}.`);
                txtLogger.log(`Because the RSI is lower than minimum configured the program will not place an limit buy order.`);
                return true;
            }

            // todo aram maybe it's worth finding out why we have both this check and the pausebot logic in main
            if (strategy.doNotOrder.btc24HourChange.active) { // todo aram don't know how much i care, but BTCUSDT is magic string
                const skip = await this.skipBasedOn24HourChangeStatistics('BTCUSDT', strategy.doNotOrder.btc24HourChange.percentage);
                if (skip) { return true; }
            }

            if (strategy.doNotOrder.coin24HourChange.active) {
                const skip = await this.skipBasedOn24HourChangeStatistics(tradingPair, strategy.doNotOrder.coin24HourChange.percentage);
                if (skip) { return true; }
            }
    }

    private async skipBasedOn24HourChangeStatistics(tradingPair: string, change24HourPercentage: number): Promise<boolean> {
        let orderingAllowed: boolean;
        const coinStatistics = await this.binanceService.get24hrChangeStatististics(this.binanceRest, tradingPair);
        if (coinStatistics === undefined) {
            txtLogger.log(`Something went wrong while retrieving the 24 hour ${tradingPair} statistics. Therefore the 24 hour change cannot be determined.`, LogLevel.WARN);
            txtLogger.log(`CONSEQUENCE: the checks with regard to 24 hour statistics cannot be executed.`);
            orderingAllowed = false;
        } else {
            const coin24HourChange: number = coinStatistics.priceChangePercent;
            if (change24HourPercentage > coin24HourChange) {
                txtLogger.log(`Limit buy order will NOT be created because:`);
                txtLogger.log(`REASON: Last 24 hour ${tradingPair} has dropped or risen ${coin24HourChange}% which is less than ${change24HourPercentage}% which is configured inside the config.json.`);
                orderingAllowed = true;
            }
        }
        return orderingAllowed;
    }

    private async minimumUsdtCheck(): Promise<boolean> {
        const balance = await this.binanceService.getAccountBalancesWithRetry(this.binanceRest);
        if (balance instanceof BinanceError) {
            txtLogger.log(`getAccountBalances() returned an error after retry: ${JSON.stringify(balance)}`, LogLevel.ERROR);
            
            // in this case we can't check if the balance is too low, return false and just let the bot run and fail if there's not enough
            return false;
        }

        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.log(`Free USDT balance amount: ${currentFreeUSDTAmount}.`);

        if (currentFreeUSDTAmount < this.minimumUSDTorderAmount) {
            txtLogger.log(`The method runProgram() quit because:`);
            txtLogger.log(`The free USDT balance amount is lower than the configured minimum amount: ${this.minimumUSDTorderAmount}.`);
            return true;
        }
    }

    private async maxOrderReachedCheck(tradingPair: string): Promise<boolean> {
        // todo aram check if the max open order is per trading pair or in total, i remember it to be total, in which case it needs to break out the whole programme not just coin
        txtLogger.log(`Checking if there are already orders open for this tradingPair. In case there are too many open orders a limit buy order will NOT be placed.`);

        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrdersForTraidingPair(this.binanceRest, tradingPair);
        if (currentOpenOrders && currentOpenOrders.length > 0) {
            const activeOrdersForTraidingPair: SpotOrder[] = currentOpenOrders.filter(s => s.symbol === tradingPair);
            txtLogger.log(`The amount of open orders for traiding pair ${tradingPair} is: ${activeOrdersForTraidingPair.length}.`);

            if (activeOrdersForTraidingPair.length > this.maxAllowedActiveOrdersForTraidingPair ||
                activeOrdersForTraidingPair.length >= 5) // 5 is the max amount determined by binance
            {
                txtLogger.log(`Limit buy order will NOT be created because of one of the following reasons:`);
                txtLogger.log(`A. The amount of active orders for this tradingPair - ${activeOrdersForTraidingPair.length} - is larger than the maximum amount configured inside the config.json - ${this.maxAllowedActiveOrdersForTraidingPair}.`, LogLevel.WARN);
                txtLogger.log(`B. Binance does not allow more than 5 trading bot created orders per trading pair.`);
                return true;
            }
        } else {
            txtLogger.log(`The amount of open orders is equal to: 0.`);
        }

        return false;
    }

    private async handleCrashOrderLogic(tradingPair: string): Promise<boolean> {
        // todo aram need to rewrite this method with the new crashOrder config hierarchy
        // if (this.largeCrashOrderActive) {
        //     if (this.largeCrashOrderActive) {
        //         txtLogger.log(`Checking ${this.coins.length} trading pair for crash condition.`);
        //     }
        //     // STEP 3. 
        //     //      OPTION I - A crash condition was detected , continue to the buyLimitOrderLogic() method.
        //     txtLogger.log(`Candle information associated with the crash condition:`);
        //     //txtLogger.log(JSON.stringify(orderConditionResult, null, 4));

        //     const ordercondition = config.production.largeCrashOrder.order as ConfigOrderConditionOrder;
        //     await this.buyLimitOrderLogic(
        //         ordercondition,
        //         tradingPair,
        //         `crashOrder-${tradingPair}`,
        //     );
        // }

        // todo aram for now hard coded return false, make it return true if order is actually placed
        return false;
    }

    public async handleExpiredOrder(): Promise<void> {
        // todo aram what about cancelling these orders instead of just email about it?
        // for this i would need to add a toggle in the config: whether the bot should cancel the order and/or email
        const emailWhenOrdersIsOpenAfterCandleAmount: number = config.generic.emailWhenOrdersIsOpenAfterCandleAmount
        txtLogger.log(`Checking if there are orders longer active than ${emailWhenOrdersIsOpenAfterCandleAmount}. If so you will receive an email notification.`);

        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest);

        this.emailListForOrdersWhichWhereTooLongOpen
        
        if (currentOpenOrders && currentOpenOrders.length > 0) {

            currentOpenOrders.forEach(order => {
                const emailAlreadySendDuringPreviousRun: boolean = this.emailListForOrdersWhichWhereTooLongOpen.find(id => id === order.clientOrderId) !== undefined;
                if (emailAlreadySendDuringPreviousRun === true) { return }

                const orderDate: Date = new Date(order.time);
                const currentDate = new Date();
                // todo aram get rid of hardcoded time interval
                const allowedTime = 15 * emailWhenOrdersIsOpenAfterCandleAmount; // Multiply by 15 because the time interval is 15 right now
                const expirationDateTime = new Date(orderDate.getTime() + allowedTime * 60000);

                if (currentDate > expirationDateTime) {
                    Mailer.Send(`${order.clientOrderId} - ${order.type} order is open for too long`, `${order.type} order is open for too long. Details: ${JSON.stringify(order, null, 4)}`);
                    this.emailListForOrdersWhichWhereTooLongOpen.push(order.clientOrderId);
                }
            });
        }

        // todo aram find out what's going on here and refactor
        if (currentOpenOrders && currentOpenOrders === []) {
            // TODO: testmike, create a propper solution 
            // "Smerige oplossing", in case there are no active orders at all we can reset 'emailListForOrdersWhichWhereTooLongOpen: string[]';
            // possible you want to have a check here: if(data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE')
            this.emailListForOrdersWhichWhereTooLongOpen = [];
        }
    }
}
