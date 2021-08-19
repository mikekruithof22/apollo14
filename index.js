const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');
const configChecker = require('./helpers/config-sanity-check');
const txtLogger = require('./helpers/txt-logger');
const binance = require('./binance/binance');
const binanceOrder = require('./binance/order');
const websocket = require('./binance/websocket');
const exchangeLogic = require('./binance/logic');

const LogLevel = require('./helpers/txt-logger').LogLevel;
const OrderType = require('./binance/order').OrderType;
const OrderStatus = require('./binance/order').OrderStatus;

let orderDetails = [
    {
        symbol,
        clientOrderId,
        buyOrderStatus,
        ocoOrderStatus
    }
];

let binanceRest;

async function runProgram() {
    let foundAtLeastOneBullishDivergence = false;

    // STEP 1 - Sanity check the config.json
    txtLogger.writeToLogFile(`--------------- Program started---------------`);

    const configCheck = configChecker.checkConfigData(config, true);
    if (configCheck.closeProgram === true) {
        txtLogger.writeToLogFile(`Program quit because:`);
        txtLogger.writeToLogFile(configCheck.message, LogLevel.ERROR);
        return;
    }

    // STEP 2 - Prepare configuration data
    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.production.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const orderConditions = config.orderConditions;
    const minimumUSDTorderAmount = config.production.minimumUSDTorderAmount;
    const cancelOrderWhenUSDTValueIsBelow = config.production.cancelOrderWhenUSDTValueIsBelow;
    const triggerOrderingLogic = config.production.devTest.triggerOrderingLogic;

    // STEP 3 - Start Stream and start listening to Account Order Changes
    listenToAccountOrderChanges();

    // STEP 4 - Retrieve RSI & calculate bullish divergence foreach order condition
    txtLogger.writeToLogFile(`Checking bullish divergence foreach order condition`);
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
        const tradingPair = order.tradingPair;
        const candleInterval = order.interval;

        if (triggerOrderingLogic === true) { // ONLY use for testing!
            txtLogger.writeToLogFile(`Skiping the retrieve candle from server part. Test instead immediately`);
            orderingLogic(
                order,
                minimumUSDTorderAmount,
                cancelOrderWhenUSDTValueIsBelow
            );
            return;
        }

        const rsiMinimumRisingPercentage = order.rsi.minimumRisingPercentage;
        const rsiCalculationLength = order.rsi.calculationLength;

        const candleMinimumDeclingPercentage = order.candle.minimumDeclingPercentage;
        const startCount = order.calcBullishDivergence.numberOfMinimumIntervals;
        const stopCount = order.calcBullishDivergence.numberOfMaximumIntervals;

        const url = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;

        txtLogger.writeToLogFile(`Checking the following order ${orderConditionName}`);
        txtLogger.writeToLogFile(`Retrieve candles from Binance url`);
        txtLogger.writeToLogFile(url);

        const candleList = await candleHelper.retrieveCandles(url);
        const candleObjectList = candleHelper.generateSmallObjectsFromData(candleList);
        const closePriceList = candleHelper.generateClosePricesList(candleList);

        const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

        const bullishDivergenceCandle = calculate.calculateBullishDivergence(
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

            txtLogger.writeToLogFile(`Bullish divergence detected ${orderConditionName}.`);
            txtLogger.writeToLogFile(`${JSON.stringify(bullishDivergenceCandle)}`);
            orderingLogic(
                order,
                minimumUSDTorderAmount,
                cancelOrderWhenUSDTValueIsBelow
            );
        } else {
            txtLogger.writeToLogFile(`No bullish divergence detected for ${orderConditionName}.`);
        }
    };

    if (foundAtLeastOneBullishDivergence === false) {
        txtLogger.writeToLogFile(`Program quit because:`);
        txtLogger.writeToLogFile(`No bullish divergence(s) where found this time`);

        closeWebSocketAndExit();
        return;
    }
}

async function orderingLogic(
    order,
    minimumUSDTorderAmount,
    cancelOrderWhenUSDTValueIsBelow
) {
    txtLogger.writeToLogFile(`Starting ordering logic method`);

    // STEP I. Prepare config.json order data 
    const tradingPair = order.tradingPair;
    const takeProfitPercentage = order.order.takeProfitPercentage;
    const takeLossPercentage = order.order.takeLossPercentage;
    const maxUsdtBuyAmount = order.order.maxUsdtBuyAmount;
    const maxPercentageOffBalance = order.order.maxPercentageOffBalance;
    const checkOrderStatusMaxRetryCount = order.order.checkOrderStatusMaxRetryCount;
    const checkOrderStatusRetryTime = order.order.checkOrderStatusRetryTime;

    // STEP II. Check open orders & cancel or close orders if necessary
    binanceRest = binance.generateBinanceRest();

    const currentOpenOrders = await binance.retrieveAllOpenOrders(binanceRest, tradingPair);
    txtLogger.writeToLogFile(`Current open orders lengt is equal to: ${currentOpenOrders.length}`);
    txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
    if (currentOpenOrders.length >= 1) { // TODO: ronald, deze if nog nooit werkend gezien. Mogelijk handelt de stream dit al af? 
        for await (let order of currentOpenOrders) {
            if (order.side === 'BUY') { // TODO: testmike, wil je ook niet stopLoss en verkoop orders cancelen?
                const timestamp = new Date().getTime();
                const oldOrderDetails = await binance.cancelOrder(binanceRest, tradingPair, order.orderId, timestamp);
                txtLogger.writeToLogFile(`Canceled open BUY order for: ${oldOrderDetails.origClientOrderId}`);
            }
        }
    }

    // STEP III. Check current free USDT trade balance
    const balance = await binance.getAccountBalances(binanceRest);
    const currentUSDTBalance = balance.find(b => b.coin === 'USDT');
    currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free);
    txtLogger.writeToLogFile(`Current free USDT trade amount is equal to: ${currentFreeUSDTAmount}`);

    if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
        txtLogger.writeToLogFile(`Program quit the orderingLogic() method because:`);
        txtLogger.writeToLogFile(`Current free USDT trade amount is: ${currentFreeUSDTAmount}. Configured amount: ${minimumUSDTorderAmount}.`);
        return;
    }

    // STEP IV. Check free amount off current crypto TODO: testmike, hoelang wil je oude orders laten staan? 
    const cryptoTicker = tradingPair.replace('USDT', '');
    const currentCryptoPairBalance = parseFloat(balance.find(b => b.coin === cryptoTicker)) || 0;
    const currentFreeCryptoAmount = parseFloat(currentUSDTBalance.free);

    const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
    txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);
    txtLogger.writeToLogFile(`The amount of crypto ${cryptoTicker} already at the balance is equal to: ${currentFreeCryptoAmount.free}`);

    // STEP V. Retrieve bid prices
    const currentOrderBook = await binance.getOrderBook(binanceRest, tradingPair);
    const currentOrderBookBids = exchangeLogic.bidsToObject(currentOrderBook.bids);

    // STEP VI. Determine how much you can spend at which price based on the order book
    const orderPriceAndAmount = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountOffUSDTToSpend);
    const orderPrice = orderPriceAndAmount.price;
    let orderAmount = orderPriceAndAmount.amount;
    // TODO: tmp testmike code, naar beneden afronden. OP TERMIJN ERUIT GOOIEN DIT
    orderAmount = Math.floor(orderAmount);
    txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately:`);
    txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);

    // STEP VII. Create the order 
    const buyOrder = await binanceOrder.createOrder(binanceRest, OrderType.LIMITBUY, tradingPair, orderAmount, orderPrice);
    if (buyOrder === undefined) {
        txtLogger.writeToLogFile(`Program quit because there was an error creating the buy order`);
        return;
    }

    // add OrderDetail to OrderDetails
    var orderDetail = {
        symbol: buyOrder.symbol,
        clientOrderId: buyOrder.clientOrderId,
        buyOrderStatus: buyOrder.status,
        ocoOrderStatus: undefines
    }
    orderDetails.push(orderDetail);

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

    // STEP VIII. MAKE SURE THE BUY ORDER IS FILLED OF IETS DERGELIJKS!
    txtLogger.writeToLogFile(`Buy order created. Details: `);
    txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}`);
    const orderStatusAfterCreation = buyOrder.status;
    txtLogger.writeToLogFile(`The newly created buy order status is equal to: ${orderStatusAfterCreation}`);
    if (orderStatusAfterCreation === OrderStatus.REJECTED || orderStatusAfterCreation === OrderStatus.EXPIRED) {
        txtLogger.writeToLogFile(`Program quit the orderingLogic() method because:`);
        return;
    }

    let orderFilled = buyOrder.status === OrderStatus.FILLED;
    if (orderFilled === false) {
        txtLogger.writeToLogFile(`Order was not immediately filled after the creation`);

        // orderFilled = await exchangeLogic.determineOrderFilled(
        //     binanceRest,
        //     tradingPair,
        //     buyOrder.clientOrderId,
        //     checkOrderStatusMaxRetryCount,
        //     checkOrderStatusRetryTime,
        //     orderStatusAfterCreation
        // );
    }

    // STEP IX. Create OCO order (
    // TODO: RONALD, FYI: OCO = stoploss and sell order in een)
    // if (orderFilled === true) {
    //     const profitPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeProfitPercentage);
    //     const stopLossPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeLossPercentage);
    //     const ocoOrder = await binanceOrder.createOcoOrder(binanceRest, tradingPair, orderAmount, profitPrice, stopLossPrice);
    //     if (ocoOrder === undefined) {
    //         txtLogger.writeToLogFile(`Program quit because there was an error creating the OCO order`);
    //         return;
    //     }
    //     txtLogger.writeToLogFile(`Oco order Order was successfully created`);
    //     textLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`)

    //     // STEP X. Perhaps doe something when the OCO order is filled? Waarschijnlijk niet nodig. 
    //     // const iets = exchangeLogic.monitorSellAndStopLossOrder(); 
    // }
}

async function listenToAccountOrderChanges() {
    txtLogger.writeToLogFile(`generating WebsocketClient`);
    const websocketClient = websocket.generateWebsocketClient();
    // const listenKey = await binanceRestTest.getSpotUserDataListenKey();
    const orderChanges = websocket.listenToAccountOderChanges(websocketClient);
    txtLogger.writeToLogFile(`listening to Account Order Changes`);
    console.log(orderChanges);

    websocketClient.on('formattedUserDataMessage', (data) => {
        txtLogger.writeToLogFile('formattedUserDataMessage eventreceived:', JSON.stringify(data));
        console.log('formattedUserDataMessage eventreceived:', JSON.stringify(data));

        if (data.eventType === 'executionReport') {
            newClientOrderId = data.newClientOrderId;

            if (data.orderStatus === OrderStatus.FILLED) {
                txtLogger.writeToLogFile(`order with newClientOrderId=${newClientOrderId} OrderType=${data.orderType} side=${data.side} is filled`);
                console.log(`order with newClientOrderId=${newClientOrderId} OrderType=${data.orderType} side=${data.side} is filled`);

                // Buy order filled
                if (data.orderType === OrderType.LIMIT && data.side === 'BUY') {
                    updateOrderDetails(newClientOrderId, data.orderType, data.orderStatus)

                    // Create OCO order
                    createOcoOrder(data.symbol, data.quantity, newClientOrderId)
                }

                // Oco order filled
                if (data.orderType === OrderType.OCO) {
                    // TODO: Check if clientOrderId is correct
                    updateOrderDetails(newClientOrderId, data.orderType, data.orderStatus)

                    // TODO: Check If closing stream for key is correct here
                    txtLogger.writeToLogFile(`closing Stream For Key wsKey=${data.wsKey}`);
                    console.log(`closing Stream For Key wsKey=${data.wsKey}`);
                    websocket.closeStreamForKey(wsClient, data.wsKey, false);

                    // If al orders are filled, stop the bot
                    // TODO: Check if this every() function works correct
                    if (orderDetails.every(o => o.buyOrderStatus === OrderStatus.FILLED && o.ocoOrderStatus === OrderStatus.FILLED)) {
                        txtLogger.writeToLogFile(`All orders are filled. Kill Stream and EXIT`);
                        console.log(`All orders are filled. Kill Stream and EXIT`);

                        // TODO: correct exiting of bot if all streams with keys are already killed, still use closeWebSocket?
                        closeWebSocketAndExit();
                    }
                }
            }
        }

        // Only for OCO
        // TODO: What to do here?
        if (data.eventType === 'listStatus') {
            listClientOrderId = data.listClientOrderId;
            if (data.listOrderStatus === 'ALL_DONE') {
                txtLogger.writeToLogFile(`order with newClientOrderId=${newClientOrderId} is ${data.listOrderStatus}`);
                console.log(`order with listClientOrderId=${listClientOrderId} is ${data.listOrderStatus}`);

                // TODO: update OrderDetails here?
            }
        }
    });
}

async function createOcoOrder(tradingPair, orderAmount, newClientOrderId) {
    const profitPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeProfitPercentage);
    const stopLossPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeLossPercentage);
    txtLogger.writeToLogFile(`Creating OCO order. tradingPair=${tradingPair} orderAmount=${orderAmount} profitPrice=${profitPrice} stopLossPrice=${stopLossPrice}`);
    // TODO: These ClientOrderId's for the OCO order are all based on the newClientOrderId from the BUY order, check if this is correct
    // listClientOrderId,
    // limitClientOrderId,
    // stopClientOrderId

    const ocoOrder = await binanceOrder.createOcoOrder(binanceRest, tradingPair, orderAmount, profitPrice, stopLossPrice, newClientOrderId, newClientOrderId, newClientOrderId);
    if (ocoOrder === undefined) {
        txtLogger.writeToLogFile(`Program quit because there was an error creating the OCO order`);
        return;
    }
    txtLogger.writeToLogFile(`Oco Order was successfully created`);
    textLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`)
}

async function updateOrderDetails(newClientOrderId, orderType, orderStatus) {
    txtLogger.writeToLogFile(`Updating OrderDetails newClientOrderId=${newClientOrderId} orderType=${orderType} orderStatus=${orderStatus}`);
    console.log(`Updating OrderDetails newClientOrderId=${newClientOrderId} orderType=${orderType} orderStatus=${orderStatus}`);

    // TODO: Getting index and updating this way is correct? 
    var index = orderDetails.findIndex(o => o.clientOrderId == newClientOrderId);

    if (orderType === OrderType.LIMIT) {
        orderDetails[index].buyOrderStatus = orderStatus;
    } else if (orderType === OrderType.OCO) {
        orderDetails[index].ocoOrderStatus = orderStatus;
    }
    txtLogger.writeToLogFile(`OrderDetails=${JSON.stringify(orderDetails)}`);
    console.log(`OrderDetails=${JSON.stringify(orderDetails)}`);
}

async function closeWebSocketAndExit() {
    txtLogger.writeToLogFile(`Closing WebSocket and exiting program`);
    console.log(`Closing WebSocket and exiting program`);
    // TODO: This is correct?
    websocket.closeWebSocket(websocketClient);
    process.exit();
}

runProgram();
