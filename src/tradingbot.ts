import { ActiveBuyOrder, OrderConfigObject } from './models/trading-bot';
import { AllCoinsInformationResponse, ExchangeInfo, MainClient, OrderBookResponse, OrderResponseFull, SpotOrder, SymbolExchangeInfo, SymbolFilter, SymbolLotSizeFilter, SymbolPriceFilter, WebsocketClient, WsUserDataEvents } from 'binance';
import { ClosePrice, LightWeightCandle } from './models/candle';
import { OrderStatusEnum, OrderTypeEnum } from './models/order';

import { AmountAndPrice } from './models/logic';
import BinanceService from './binance/binance';
import { BullishDivergenceResult } from './models/calculate';
import CandleHelper from './helpers/candle';
import { LogLevel } from './models/log-level';
import Order from './binance/order';
import WebSocketService from './binance/websocket';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private activeOcoOrders = [];
    private wsService: WebSocketService;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;

    constructor() {
        this.wsService = new WebSocketService();
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
    }

    /*
        TODO: hier nog over nadenken!
            1. Bijvoorbeeld 5 order condities, bij 5 ingelegde oco orders de stream sluiten? 
            2. Wat te doen als de bij order niet in een keer afgaat? 
                a. cancelen na x aantal seconden & opnieuw? 
                    i. daarna cancellen? 
            3. Kritisch nalopen wanneer de stream moet sluiten.  
                    Variabelen:
                        i. Aantal order condities 
                        ii. Aantal ingelegde oco orders 
            4. Wil je een check hebben of je reeds bestaande streams wilt afsluiten zodra je start? 
            (geen idee of de boel automatisch stopt, zodra het programma afsluit)

            5. TestMike todo dingen uit de code doorgaan. 
    */
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
        const orderConditions = config.orderConditions;
        const minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
        const triggerBuyOrderLogic: boolean = config.production.devTest.triggerBuyOrderLogic;

        // STEP 3 - Start Stream and start listening to Account Order Changes.
        txtLogger.writeToLogFile(`Generating Websocket`);

        const websocketClient: WebsocketClient = this.wsService.generateWebsocketClient();
        if (websocketClient === undefined) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`Generating WebsocketClient failed.`, LogLevel.ERROR);
            return;
        }

        const binanceRest: MainClient = this.binanceService.generateBinanceRest();
        txtLogger.writeToLogFile(`Generating Binance rest client`);
        if (binanceRest === undefined) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`Generating binanceRest failed.`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Starting to listen to account order changes`);
        this.listenToAccountOrderChanges(websocketClient, binanceRest);

        // STEP 4 - Retrieve RSI & calculate bullish divergence foreach order condition.
        txtLogger.writeToLogFile(`Checking bullish divergence for each of the ${orderConditions.length} order condition(s)`);

        for await (let order of orderConditions) {
            const orderConditionName: string = order.name;
            const tradingPair: string = order.tradingPair;
            const candleInterval: string = order.interval;

            if (triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                txtLogger.writeToLogFile(`Skiping the retrieve candle from server part. Test instead immediately`);
                this.buyOrderingLogic(
                    order,
                    minimumUSDTorderAmount,
                    binanceRest
                );
                return;
            }

            const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
            const rsiCalculationLength: number = order.rsi.calculationLength;

            const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
            const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
            const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

            const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;

            txtLogger.writeToLogFile(`Eveluating order condition for: ${orderConditionName}`);
            txtLogger.writeToLogFile(`Retrieving candles from Binance url`);
            txtLogger.writeToLogFile(url);

            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: ClosePrice[] = this.candleHelper.generateClosePricesList(candleList);

            const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

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
                foundAtLeastOneBullishDivergence = true;

                txtLogger.writeToLogFile(`Bullish divergence detected for: ${orderConditionName}. Next step will be the buyOrderingLogic() method`);
                txtLogger.writeToLogFile(`${JSON.stringify(bullishDivergenceCandle)}`);
                // STEP 5. 
                //      OPTIE I - A bullish divergence was found, continue to the ordering logic method.
                this.buyOrderingLogic(
                    order,
                    minimumUSDTorderAmount,
                    binanceRest
                );
            } else {
                txtLogger.writeToLogFile(`No bullish divergence detected for: ${orderConditionName}.`);
            }
        };

        if (foundAtLeastOneBullishDivergence === false) {
            // STEP 5. 
            //      OPTIE II  - Close the program & websocket because no bullish divergence(s) where found this time.
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`No bullish divergence(s) where found during this run.`);

            setTimeout(() => {
                this.wsService.closeStreamForKey(websocketClient, this.wsService.websocketKey);
            }, 5000);

            txtLogger.writeToLogFile(`Closing WebSocket and exiting program`);
            return;
        }
    }

    public async buyOrderingLogic(
        order: OrderConfigObject,
        minimumUSDTorderAmount: number,
        binanceRest: MainClient
    ) {
        txtLogger.writeToLogFile(`Starting ordering logic method`);

        // STEP I. Prepare config.json order data 
        const tradingPair: string = order.tradingPair;
        const orderName: string = order.name;
        const takeProfitPercentage: number = order.order.takeProfitPercentage;
        const takeLossPercentage: number = order.order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.order.maxUsdtBuyAmount;
        const maxPercentageOffBalance: number = order.order.maxPercentageOffBalance;

        // STEP II. Cancel all open buy orders.
        const currentOpenOrders = await this.binanceService.retrieveAllOpenOrders(binanceRest, tradingPair);
        txtLogger.writeToLogFile(`Current open orders lengt is equal to: ${(currentOpenOrders as SpotOrder[]).length}`);
        txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
        if ((currentOpenOrders as SpotOrder[]).length >= 1) {
            for await (let order of (currentOpenOrders as SpotOrder[])) {
                if (order.side === 'BUY') {
                    const openBuyOrder = await this.binanceService.cancelOrder(binanceRest, tradingPair, order.orderId);
                    txtLogger.writeToLogFile(`Canceled open BUY - clientOrderId: ${order.clientOrderId} - with the following details:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(openBuyOrder)}`);
                }
            }
        }

        // STEP III. Check current amount off free USDT on the balance.
        const balance = await this.binanceService.getAccountBalances(binanceRest);
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Current free USDT amount on the balance is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Current free USDT trade amount is: ${currentFreeUSDTAmount}. That is lower than the configured amount: ${minimumUSDTorderAmount}.`);
            return;
        }

        // STEP IV. Retrieve bid prices.
        const currentOrderBook = await this.binanceService.getOrderBook(binanceRest, tradingPair);
        const currentOrderBookBids = exchangeLogic.bidsToObject((currentOrderBook as OrderBookResponse).bids);

        // STEP V. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
        txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

        const symbol: string = `symbol=${tradingPair}`; // workaround, npm package sucks
        const exchangeInfo = await this.binanceService.getExchangeInfo(binanceRest, symbol) as ExchangeInfo;

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

        txtLogger.writeToLogFile(`Trying to create a limit buy order`);
        txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        const orderPriceAndAmount: AmountAndPrice = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountOffUSDTToSpend, stepSize);
        const orderPrice: number = orderPriceAndAmount.price;
        const orderAmount: number = orderPriceAndAmount.amount;
        const totalUsdtAmount: number = orderPriceAndAmount.totalUsdtAmount;

        if (orderAmount < minimumOrderQuantity) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Order quantity is lower than - ${orderAmount} - the minimum order quanity: ${minimumOrderQuantity}`);
            return;
        }

        txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);
        txtLogger.writeToLogFile(`Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        // STEP VI. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`There was an error creating the buy order`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Buy order created. Details:`);
        txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}, 
                            price: ${buyOrder.price}, takeProfitPercentage: ${takeProfitPercentage}, takeLossPercentage: ${takeLossPercentage}`);

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
                tickSize: tickSize
            }
            this.activeBuyOrders.push(currentBuyOrder);
        }
    }

    public async listenToAccountOrderChanges(websocketClient: WebsocketClient, binanceRest: MainClient) {
        this.wsService.listenToAccountOderChanges(websocketClient);
        txtLogger.writeToLogFile(`Listening to Account Order Changes`);

        websocketClient.on('formattedUserDataMessage', async (data: WsUserDataEvents) => {
            txtLogger.writeToLogFile(`formattedUserDataMessage eventreceived: ${JSON.stringify(data)}`);

            if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.FILLED) {
                const clientOrderId: string = data.newClientOrderId;

                // POSSIBILITY I - When a buy order is FILLED an oco order should be created.
                if (data.orderType === 'LIMIT' && data.side === 'BUY' && data.orderStatus === OrderStatusEnum.FILLED) {
                    const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);
                    txtLogger.writeToLogFile(`Limit by order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled`);

                    const stepSize: number = buyOrder.stepSize;
                    const tickSize: number = buyOrder.tickSize;

                    const profitPrice: number = exchangeLogic.calcProfitPrice(Number(data.price), buyOrder.takeProfitPercentage, tickSize);
                    const stopLossPrice: number = exchangeLogic.calcStopLossPrice(Number(data.price), buyOrder.takeLossPercentage, tickSize);
                    const stopLimitPrice: number = Number((stopLossPrice * 0.97).toFixed(tickSize)); // TODO: testmike, naar aparte methode?
                    const ocoOrderAmount: number = parseFloat(data.quantity.toFixed(stepSize)); // TODO: testmike, naar aparte methode?
                    const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;

                    if (ocoOrderAmount < minimumOcoOrderQuantity) {
                        txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
                        txtLogger.writeToLogFile(`Oco order quantity is lower than - ${ocoOrderAmount} - the minimum order quanity: ${minimumOcoOrderQuantity}`);
                        return;
                    }
                    txtLogger.writeToLogFile(`Trying to create an OCO order`);
                    txtLogger.writeToLogFile(`The oco order amount is equal to: ${ocoOrderAmount}`);
                    txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
                    txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

                    txtLogger.writeToLogFile(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}`);

                    const ocoOrder = await this.order.createOcoSellOrder(
                        binanceRest,
                        data.symbol,
                        ocoOrderAmount,
                        profitPrice,
                        stopLossPrice,
                        stopLimitPrice
                    );

                    if (ocoOrder === undefined) {
                        txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
                        txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);
                        return;
                    } else {
                        this.activeBuyOrders = this.activeBuyOrders.filter(order => order.clientOrderId != clientOrderId);
                        this.activeOcoOrders.push(ocoOrder.listClientOrderId);

                        txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
                        txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`);
                    }
                }
            }

            // POSSIBILITY II - OCO order is finished - ALL_DONE
            if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
                const listClientOrderId = data.listClientOrderId;
                txtLogger.writeToLogFile(`Oco order with listClientOrderId: ${listClientOrderId} is filled. Details:`);
                txtLogger.writeToLogFile(`${JSON.stringify(data)}`);

                this.activeOcoOrders = this.activeOcoOrders.filter(id => id !== listClientOrderId);

                // POSSIBILITY III - CLOSE WEBSOCKET when only there are NO longer active buy and oco orders.
                if (this.activeBuyOrders === [] && this.activeOcoOrders === []) {
                    txtLogger.writeToLogFile(`Closing the WebSocket because there are no longer active buy and or orders.`);
                    this.wsService.closeStreamForKey(websocketClient, this.wsService.websocketKey);
                }
            }
        });
    }
}