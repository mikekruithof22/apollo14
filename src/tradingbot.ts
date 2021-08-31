import { AllCoinsInformationResponse, MainClient, OrderBookResponse, OrderResponseFull, OrderResponseResult, SpotOrder, WebsocketClient } from 'binance';
import { ClosePrice, LightWeightCandle } from './models/candle';

import BinanceService from './binance/binance';
import { BullishDivergenceResult } from './models/calculate';
import CandleHelper from './helpers/candle';
import Order from './binance/order';
import WebSocketService from './binance/websocket';
import binance from './binance/binance';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';
import websocket from './binance/websocket';

// import { binanceOrder } from './binance/order';









const LogLevel = require('./helpers/txt-logger').LogLevel;
const OrderType = require('./binance/order').OrderType;
const OrderStatus = require('./binance/order').OrderStatus;

export default class Tradingbot {
    private activeBuyOrders = [];
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
        txtLogger.writeToLogFile(`Checking bullish divergence foreach order condition`);
        for await (let order of orderConditions) {
            const orderConditionName: string  = order.name;
            const tradingPair: string  = order.tradingPair;
            const candleInterval: string  = order.interval;

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

            txtLogger.writeToLogFile(`Checking the following order ${orderConditionName}`);
            txtLogger.writeToLogFile(`Retrieve candles from Binance url`);
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

                txtLogger.writeToLogFile(`Bullish divergence detected ${orderConditionName}. Therefore, continue to the buyOrderingLogic() method`);
                txtLogger.writeToLogFile(`${JSON.stringify(bullishDivergenceCandle)}`);
                // STEP 5. 
                //      OPTIE I - A bullish divergence was found, continue to the ordering logic method.
                this.buyOrderingLogic(
                    order,
                    minimumUSDTorderAmount,
                    binanceRest
                );
            } else {
                txtLogger.writeToLogFile(`No bullish divergence detected for ${orderConditionName}.`);
            }
        };

        if (foundAtLeastOneBullishDivergence === false) {
            // STEP 5. 
            //      OPTIE II  - Close the program & websocket because no bullish divergence(s) where found this time.
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`No bullish divergence(s) where found this time`);

            setTimeout(() => {
                this.wsService.closeStreamForKey(websocketClient, this.wsService.websocketKey);
            }, 5000);

            txtLogger.writeToLogFile(`Closing WebSocket and exiting program`);
            return;
        }
    }

    public async buyOrderingLogic(
        order,
        minimumUSDTorderAmount,
        binanceRest
    ) {
        txtLogger.writeToLogFile(`Starting ordering logic method`);

        // STEP I. Prepare config.json order data 
        const tradingPair = order.tradingPair;
        const takeProfitPercentage = order.order.takeProfitPercentage;
        const takeLossPercentage = order.order.takeLossPercentage;
        const maxUsdtBuyAmount = order.order.maxUsdtBuyAmount;
        const maxPercentageOffBalance = order.order.maxPercentageOffBalance;

        // STEP II. Cancel all open buy orders.
        const currentOpenOrders = await this.binanceService.retrieveAllOpenOrders(binanceRest, tradingPair);
        txtLogger.writeToLogFile(`Current open orders lengt is equal to: ${(currentOpenOrders as SpotOrder[]).length}`);
        txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
        if ((currentOpenOrders as SpotOrder[]).length >= 1) {
            for await (let order of (currentOpenOrders as SpotOrder[])) {
                if (order.side === 'BUY') {
                    const timestamp = new Date().getTime();
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
        txtLogger.writeToLogFile(`Current free USDT trade amount is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Current free USDT trade amount is: ${currentFreeUSDTAmount}. Configured amount: ${minimumUSDTorderAmount}.`);
            return;
        }

        // STEP IV. Retrieve bid prices.
        const currentOrderBook = await this.binanceService.getOrderBook(binanceRest, tradingPair);
        const currentOrderBookBids = exchangeLogic.bidsToObject((currentOrderBook as OrderBookResponse).bids);

        // STEP V. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
        txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

        const orderPriceAndAmount = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountOffUSDTToSpend);
        const orderPrice = orderPriceAndAmount.price;
        let orderAmount = orderPriceAndAmount.amount;

        txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);

        // STEP VI. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(binanceRest, OrderType.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`There was an error creating the buy order`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Buy order created. Details:`);
        txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}, 
                            price: ${buyOrder.price}, takeProfitPercentage: ${takeProfitPercentage}, takeLossPercentage: ${takeLossPercentage}`);

        if (
            buyOrder.status !== OrderStatus.REJECTED ||
            buyOrder.status !== OrderStatus.EXPIRED ||
            buyOrder.status !== OrderStatus.CANCELED
        ) {
            const currentBuyOrder = {
                clientOrderId: buyOrder.clientOrderId,
                takeProfitPercentage: takeProfitPercentage,
                takeLossPercentage: takeLossPercentage,
            }
            this.activeBuyOrders.push(currentBuyOrder);
        }
    }

    public async listenToAccountOrderChanges(websocketClient, binanceRest) {
        // const listenKey = await binanceRestTest.getSpotUserDataListenKey();
        this.wsService.listenToAccountOderChanges(websocketClient);
        txtLogger.writeToLogFile(`Listening to Account Order Changes`);

        websocketClient.on('formattedUserDataMessage', async (order) => {
            txtLogger.writeToLogFile(`formattedUserDataMessage eventreceived: ${JSON.stringify(order)}`);

            if (order.eventType === 'executionReport') {
                const clientOrderId = order.newClientOrderId;

                if (order.orderStatus === OrderStatus.FILLED) {
                    // POSSIBILITY I - When a buy order is FILLED an oco order should be created.
                    if (order.orderType === 'LIMIT' && order.side === 'BUY') {
                        txtLogger.writeToLogFile(`Buy order with clientOrderId: ${clientOrderId} is filled`);

                        const buyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);
                        const profitPrice = exchangeLogic.calcProfitPrice(parseFloat(order.price), buyOrder.takeProfitPercentage,);
                        const stopLossPrice = exchangeLogic.calcStopLossPrice(parseFloat(order.price), buyOrder.takeLossPercentage);

                        const balance = await this.binanceService.getAccountBalances(binanceRest);
                        const currentCryptoHoldingsOnBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === order.symbol);

                        const freeBalance = currentCryptoHoldingsOnBalance.free.toString();
                        const currentFreeCryptoAmount = parseFloat(freeBalance);
                        txtLogger.writeToLogFile(`The amount off free to spend crypto is equal to: ${currentFreeCryptoAmount}`);

                        const orderAmount = order.quantity + currentFreeCryptoAmount;

                        txtLogger.writeToLogFile(`Creating OCO order. Symbol: ${order.symbol} orderAmount: ${orderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice}`);

                        const ocoOrder = await this.order.createOcoOrder(
                            binanceRest,
                            order.symbol,
                            orderAmount,
                            profitPrice,
                            stopLossPrice
                        );
                        if (ocoOrder === undefined) {
                            txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);
                        } else {
                            this.activeBuyOrders = this.activeBuyOrders.filter(order => order.clientOrderId != clientOrderId);
                            this.activeOcoOrders.push(ocoOrder.listClientOrderId);
                        }
                        txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
                        txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`);
                    }

                    if (order.orderType === 'OCO') {
                        const listClientOrderId = order.listClientOrderId;
                        this.activeOcoOrders = this.activeOcoOrders.filter(id => id !== listClientOrderId);
                        if (this.activeBuyOrders === [] && this.activeOcoOrders === []) {
                            // CLOSE WEBSOCKET when only there are no longer active buy and oco orders.
                            txtLogger.writeToLogFile(`Closing the WebSocket because there are no longer active buy or oco orders.`);
                            this.wsService.closeStreamForKey(websocketClient, this.wsService.websocketKey);
                        }

                    }
                }

                // POSSIBILITY III - OCO order is finished - ALL_DONE
                if (order.eventType === 'listStatus') {
                    const listClientOrderId = order.listClientOrderId;
                    if (order.listOrderStatus === 'ALL_DONE') {
                        txtLogger.writeToLogFile(`Oco order with listClientOrderId: ${listClientOrderId} is filled. Details:`);
                        txtLogger.writeToLogFile(`${JSON.stringify(order)}`);


                        if (this.activeBuyOrders === [] && this.activeOcoOrders === []) {
                            // CLOSE WEBSOCKET when only there are no longer active buy and oco orders.
                            txtLogger.writeToLogFile(`Closing the WebSocket because there are no longer active buy and or orders.`);
                            this.wsService.closeStreamForKey(websocketClient, this.wsService.websocketKey);
                        }
                    }
                }
            }
        });
    }
}

/*
    TODO: RONALD: waarschijnlijk kun je onderstaande logica/gedachte veel makelijker afvangen. 
    in de websocket.js file. 

    a. Leg VeThor orders vanwege het lage order bedrag: 
        b. zorg dat je een automatisch VeThor object heb als parameter voor: 

        c. leg heel kleine orders in minimaal 10 usdt omdat binance niet kleiner accepteert, 
        zodat je lekker makkelijk en goedkoop kunt testen 
        (desnoods een stuk per keer, hooguit een paar cent per oder)


         MAKE SURE THAT:
            A.) In case sellOrder triggers ===> the stopLossLimitOrder is canceled
            b.) In case stopLossLimitOrder triggers ===> the sellOrder is canceled
            ================
            TODO: hoe monitor ik dat dit gebeurt? 
                Peramanent een while loop laten draaien, het met gevaar dat deze methode 
                uren/dagen doorgaat.

                Een stream opzetten of iets dergelijks?
                    - Per order krijg je dan een stream. Zie 'stream.js'

                    ==> waarschijnlijk wil je die stream returnen!, mogelijk met een optie om over te gaan
                    om alles te verkopen. Bijvoorbeeld nadat je te lang heb gewacht. Candles configuren in de config.json?

            ===================    
        // TODO: wat is ie maar half gevuld is... Of op 95% na... 
        // Ter info: de methode() determineOrderFilled heeft maar een x aantal rondes..
        // na die rondes is nog niet per definitie alles gevuld. 
*/

/* 
     // TODO: Check If closing stream for key is correct here
                    txtLogger.writeToLogFile(`closing Stream For Key wsKey=${order.wsKey}`);
                    console.log(`closing Stream For Key wsKey=${order.wsKey}`);
                    websocket.closeStreamForKey(wsClient, order.wsKey, false);

                    // If al orders are filled, stop the bot
                    // TODO: Check if this every() function works correct
                    if (orderDetails.every(o => o.buyOrderStatus === OrderStatus.FILLED && o.ocoOrderStatus === OrderStatus.FILLED)) {
                        txtLogger.writeToLogFile(`All orders are filled. Kill Stream and EXIT`);
                        console.log(`All orders are filled. Kill Stream and EXIT`);

                        // TODO: correct exiting of bot if all streams with keys are already killed, still use closeWebSocket?
                        exchangeLogic.closeWebSocketAndExit(websocketClient);
                        txtLogger.writeToLogFile(`Closing WebSocket and exiting program`);
                    }

*/
const bot = new Tradingbot();
bot.runProgram();
