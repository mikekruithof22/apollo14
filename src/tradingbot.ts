import { AllCoinsInformationResponse, CancelSpotOrderResult, ExchangeInfo, MainClient, OrderBookResponse, OrderResponseFull, SpotOrder, SymbolExchangeInfo, SymbolFilter, SymbolLotSizeFilter, SymbolPriceFilter, WsMessageSpotUserDataExecutionReportEventFormatted, WsUserDataEvents } from 'binance';
import { AmountAndPrice, ConfigOrderCondition } from './models/logic';
import { ClosePrice, LightWeightCandle } from './models/candle';
import { OrderStatusEnum, OrderTypeEnum } from './models/order';

import { ActiveBuyOrder } from './models/trading-bot';
import BinanceService from './binance/binance';
import { BullishDivergenceResult } from './models/calculate';
import CandleHelper from './helpers/candle';
import { LogLevel } from './models/log-level';
import Order from './binance/order';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private activeOcoOrdersIds: string[] = [];
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();
    }

    public async runProgram() {
        let foundAtLeastOneBullishDivergence: boolean = false;

        // STEP 1 - Sanity check the config.json.
        txtLogger.writeToLogFile(`---------- Program started ---------- `);

        const configCheck = configChecker.checkConfigData(config, true);
        if (configCheck.closeProgram === true) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(configCheck.message, LogLevel.ERROR);
            return;
        }

        // STEP 2 - Prepare configuration data.
        const brokerApiUrl: string = config.brokerApiUrl;
        const numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
        const orderConditions: any[] = config.orderConditions;
        const minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
        const candleInterval: string = config.timeIntervals[0]; // For the time being only one interval, therefore [0].
        const tradingPairs: string[] = config.tradingPairs;
        const rsiCalculationLength: number = config.genericOrder.rsiCalculationLength;
        const doNotOrderWhenRSIValueIsBelow: number = config.genericOrder.doNotOrder.RSIValueIsBelow;
        const limitBuyOrderExpirationTime: number = config.genericOrder.limitBuyOrderExpirationTimeInSeconds * 1000; // multiply with 1000 for milliseconds 

        // devTest variables
        const triggerBuyOrderLogic: boolean = config.production.devTest.triggerBuyOrderLogic;
        const triggerCancelLogic: boolean = config.production.devTest.triggerCancelLogic;

        if (this.binanceRest === undefined) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`Generating binanceRest client failed.`, LogLevel.ERROR);
            return;
        }

        // STEP 3 If USDT is to low, you don't need to run the program, therefore quit.
        const balance = await this.binanceService.getAccountBalances(this.binanceRest);
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`The free USDT balance amount is lower than the configured minimum amount: ${minimumUSDTorderAmount}.`);
            return;
        }

        // STEP 4 - Retrieve RSI & calculate bullish divergence foreach trading pair
        txtLogger.writeToLogFile(`There are ${orderConditions.length * tradingPairs.length} order condition(s)`);

        for await (let tradingPair of tradingPairs) {

            const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
            txtLogger.writeToLogFile(`Retrieving candles from Binance: ${url}`);

            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: ClosePrice[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);
            const mostRecentRsiValue = rsiCollection[rsiCollection.length - 1];

            for await (let order of orderConditions) {
                const orderConditionName: string = `${tradingPair}-${order.name}`;
                txtLogger.writeToLogFile(`Evaluating order condition: ${orderConditionName}`);

                if (triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                    txtLogger.writeToLogFile(`DEVTEST - Skipping bullish divergence calculation and trigger a limit buy order`);
                    await this.buyOrderingLogic(
                        order,
                        minimumUSDTorderAmount,
                        tradingPair,
                        orderConditionName,
                        limitBuyOrderExpirationTime,
                        triggerCancelLogic
                    );
                    return;
                }

                const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
                const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
                const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
                const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

                const bullishDivergenceCandle: BullishDivergenceResult = calculate.calculateBullishDivergence(
                    closePriceList,
                    candleObjectList,
                    rsiCollection,
                    startCount,
                    stopCount,
                    rsiMinimumRisingPercentage,
                    candleMinimumDeclingPercentage,
                    orderConditionName
                );

                if (bullishDivergenceCandle !== undefined) {
                    txtLogger.writeToLogFile(`***** Bullish divergence detected for: ${orderConditionName} *****`);
                    txtLogger.writeToLogFile(`Details:`);
                    txtLogger.writeToLogFile(JSON.stringify(bullishDivergenceCandle, null, 4))

                    txtLogger.writeToLogFile(`The most recent rsi value is: ${bullishDivergenceCandle.endiRsiValue}. The minimun configured is: ${doNotOrderWhenRSIValueIsBelow}`);

                    if (mostRecentRsiValue >= doNotOrderWhenRSIValueIsBelow) {
                        foundAtLeastOneBullishDivergence = true;

                        // STEP 5. 
                        //      OPTIE I - A bullish divergence was found, continue to the ordering logic method.
                        await this.buyOrderingLogic(
                            order,
                            minimumUSDTorderAmount,
                            tradingPair,
                            orderConditionName,
                            limitBuyOrderExpirationTime,
                            triggerCancelLogic
                        );
                        return;
                        // TODO: testmike, for now we will 'RETURN' out of the loop once we trigger the buy buyOrderingLogic
                        // This makes the program, for the time being way simpler! In the future we can let it continue.
                    } else {
                        txtLogger.writeToLogFile(`Because the RSI is lower than minimum configured the program will not place an limit buy order`);
                    }
                } else {
                    txtLogger.writeToLogFile(`No-bullish-divergence-detected for: ${orderConditionName}.`);
                }
            };
        }

        if (foundAtLeastOneBullishDivergence === false) {
            // STEP 5. 
            //      OPTIE II  - Close the program & websocket because no bullish divergence(s) where found this time.
            txtLogger.writeToLogFile(`Program ended because:`);
            txtLogger.writeToLogFile(`No bullish divergence(s) where found during this run.`);
            return;
        }
    }

    public async buyOrderingLogic(
        order: ConfigOrderCondition,
        minimumUSDTorderAmount: number,
        tradingPair: string,
        orderName: string,
        limitBuyOrderExpirationTime: number,
        triggerCancelLogic: boolean
    ) {
        txtLogger.writeToLogFile(`The method buyOrderingLogic() will try to place a limit buy order`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.order.takeProfitPercentage;
        const takeLossPercentage: number = order.order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.order.maxUsdtBuyAmount;
        const maxPercentageOffBalance: number = order.order.maxPercentageOffBalance;

        /* STEP ?. Cancel all open buy orders.
        const currentOpenOrders = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        txtLogger.writeToLogFile(`Current open orders length is equal to: ${(currentOpenOrders as SpotOrder[]).length}`);
        txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
        if ((currentOpenOrders as SpotOrder[]).length >= 1) {
            for await (let order of (currentOpenOrders as SpotOrder[])) {
                if (order.side === 'BUY') {
                    const openBuyOrder = await this.binanceService.cancelOrder(this.binanceRest, tradingPair, order.orderId);
                    txtLogger.writeToLogFile(`Canceled open BUY - clientOrderId: ${order.clientOrderId} - with the following details:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(openBuyOrder)}`);

                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === order.clientOrderId);
                    if (index > -1) {
                        this.activeBuyOrders.splice(index, 1);
                    }
                }
            }
        }
        */

        // STEP II. Check current amount off free USDT on the balance.
        const balance = await this.binanceService.getAccountBalances(this.binanceRest);
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Free USDT balance amount is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`The free USDT balance amount is lower than the configured minimum amount: ${minimumUSDTorderAmount}.`);
            return;
        }

        // STEP III. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
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

        if (orderAmount < minimumOrderQuantity) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Order quantity is lower than - ${orderAmount} - the minimum allowed order quanity: ${minimumOrderQuantity}`);
            return;
        }

        txtLogger.writeToLogFile(`Based on the order book the following order limit buy order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);
        txtLogger.writeToLogFile(`Total USDT value of the order is equal to: ${totalUsdtAmount}`);

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

        if (triggerCancelLogic === true) { // TESTING PURPOSE ONLY!
            txtLogger.writeToLogFile(`DEVTEST - Cancel the limit buy order immediately`);
            this.cancelLimitBuyOrderCheck(tradingPair, buyOrder.clientOrderId, orderName);
        }

        if (buyOrder.status !== OrderStatusEnum.FILLED) {
            // STEP VI. Activate cancelLimitBuyOrderCheck() because after X seconds you want to cancel the limit buy order if it is not filled.
            setTimeout(() => {
                txtLogger.writeToLogFile(`The method cancelLimitBuyOrderCheck() is going to check if the limit buy order - ${orderName} - has been filled within the allocated time: ${limitBuyOrderExpirationTime / 1000} seconds`);
                this.cancelLimitBuyOrderCheck(tradingPair, buyOrder.clientOrderId, orderName);
            }, limitBuyOrderExpirationTime);
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
            this.activeOcoOrdersIds = this.activeOcoOrdersIds.filter(id => id !== listClientOrderId);
        }
    }

    public async cancelLimitBuyOrderCheck(tradingPair: string, clientOrderId: string, orderName: string) {
        // STEP 1 - check if the limit buy order is not filled yet (it may be partially filled)
        const currentOpenOrders: SpotOrder[] = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        if (currentOpenOrders.length > 0) {
            const limitBuyOrder: SpotOrder = currentOpenOrders.find(f => f.clientOrderId === clientOrderId);
            txtLogger.writeToLogFile(`Checking if it is necessary to cancel the limit buy order with the following details:`);
            txtLogger.writeToLogFile(`orderName: ${orderName}, clientOrderId: ${clientOrderId} `);

            // STEP 2 - If the limit buy order is still open cancel it ('NEW' or 'PARTIALLY_FILLED')
            if (
                limitBuyOrder !== undefined &&
                (limitBuyOrder.status === 'NEW' || limitBuyOrder.status === 'PARTIALLY_FILLED')
            ) {
                txtLogger.writeToLogFile(`The limit buy order status is equal to: - ${limitBuyOrder.status}`);
                txtLogger.writeToLogFile(`${JSON.stringify(limitBuyOrder)}`);
                txtLogger.writeToLogFile(`Trying to cancel the limit buy order .`);
                const cancelSpotOrderResult: CancelSpotOrderResult = await this.binanceService.cancelOrder(this.binanceRest, tradingPair, limitBuyOrder.orderId);
                txtLogger.writeToLogFile(`The cancel spot order results looks as follows:`);
                txtLogger.writeToLogFile(`${JSON.stringify(cancelSpotOrderResult)}`);
            } else {
                txtLogger.writeToLogFile(`Limit buy order was not found among the current open orders and/or the status was not equal to: 'PARTIALLY_FILLED' or 'NEW', therefore nothing to cancel.`);
            }
        } else {
            txtLogger.writeToLogFile(`Currently there are no active open orders, therefore there is nothing to cancel.`);
        }
    }

    public async createOcoOrder(data: WsMessageSpotUserDataExecutionReportEventFormatted, clientOrderId: string, buyOrder: ActiveBuyOrder) {
        txtLogger.writeToLogFile(`The method createOcoOrder() is triggered`);

        const stepSize: number = buyOrder.stepSize;
        const tickSize: number = buyOrder.tickSize;

        const profitPrice: number = exchangeLogic.calcProfitPrice(Number(data.price), buyOrder.takeProfitPercentage, tickSize);
        const stopLossPrice: number = exchangeLogic.calcStopLossPrice(Number(data.price), buyOrder.takeLossPercentage, tickSize);
        const stopLimitPrice: number = exchangeLogic.callStopLimitPrice(stopLossPrice, tickSize);

        const coinName: string = data.symbol.replace('USDT', '');
        let balance = await this.binanceService.getAccountBalances(this.binanceRest);
        let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
        let currentFreeCryptoBalance = Number(currentCryptoBalance.free);

        // todo aram doesn't this mean ALL of the cryptos in the wallet will be sold?
        // Let's say you wanna have 5000 DOT in your portfolio for long term investment, this would sell all of those?
        let ocoOrderAmount: number = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);
        const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;

        txtLogger.writeToLogFile(`currentCryptoBalance`);
        txtLogger.writeToLogFile(JSON.stringify(currentCryptoBalance));
        txtLogger.writeToLogFile(`currentFreeCryptoBalance`);
        txtLogger.writeToLogFile(JSON.stringify(currentFreeCryptoBalance));

        if (ocoOrderAmount < minimumOcoOrderQuantity) {
            txtLogger.writeToLogFile(`Oco order quantity - ${ocoOrderAmount} - is lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);
            txtLogger.writeToLogFile(`Re-retrieving current free balance after a couple of seconds to ensure it's not a timing issue!`);

            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(3000);

            balance = await this.binanceService.getAccountBalances(this.binanceRest);
            currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
            currentFreeCryptoBalance = Number(currentCryptoBalance.free);
            ocoOrderAmount = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);

            if (ocoOrderAmount < minimumOcoOrderQuantity) {
                txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
                txtLogger.writeToLogFile(`Oco order quantity - ${ocoOrderAmount} - is STILL lower than the minimum order quanity: ${minimumOcoOrderQuantity}`);
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
            txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
            txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);

            const limitSellOrderAmount: number = ocoOrderAmount;
            const limitSellOrderPrice: number = data.price * 0.95;

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
            // if that's true the activeOcoOrdersIds stuff is kind of obsolete as well
            const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
            if (index > -1) {
                this.activeBuyOrders.splice(index, 1);
            }
            this.activeOcoOrdersIds.push(ocoOrder.listClientOrderId);

            txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
            txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`);
        }
    }
}