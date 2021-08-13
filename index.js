const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');
const configChecker = require('./helpers/config-sanity-check');
const txtLogger = require('./helpers/txt-logger');
const binance = require('./binance/binance');
const binanceOrder = require('./binance/order');
const binancenStream = require('./binance/stream');
const exchangeLogic = require('./binance/logic');

const LogLevel = require('./helpers/txt-logger').LogLevel;
const OrderType = require('./binance/order').OrderType;
const OrderStatus = require('./binance/order').OrderStatus;

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

    // STEP 3 - Retrieve RSI & calculate bullish divergence foreach order condition
    txtLogger.writeToLogFile(`Checking bullish divergence foreach order condition`);
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
        const tradingPair = order.tradingPair;
        const candleInterval = order.interval;

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
    const binanceRest = binance.generateBinanceRest();

    const currentOpenOrders = await binance.retrieveAllOpenOrders(binanceRest, tradingPair);
    txtLogger.writeToLogFile(`Current open orders lengt is equal to: ${currentOpenOrders.length}`);
    txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
    if (currentOpenOrders.length >= 1) {
        // TODO: hier cancelen en/of posities sluiten
        // if(currentOpenOrders.length >= 1) {
        //     currentOpenOrders.forEach(order => {
        //         if (cancelOrderWhenUSDTValueIsBelow)

        //     });
        // }
    }

    // STEP III. Check currrent free USDT trade balance
    const balance = await binance.getAccountBalances(binanceRest);

    const currentUSDTBalance = parseFloat(balance.find(b => b.asset === 'USDT'));
    currentFreeUSDTAmount = currentUSDTBalance.free;

    txtLogger.writeToLogFile(`Current free USDT trade amount is equal to: ${currentFreeUSDTAmount}`);

    if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
        txtLogger.writeToLogFile(`Program quit the orderingLogic() method because:`);
        txtLogger.writeToLogFile(`Current free USDT trade amount - ${currentFreeUSDTAmount} - is lower than the minimum configured ${minimumUSDTorderAmount}.`);
        return;
    }

    // STEP IV. Check free amount off current crypto and add it later to the 'orderPriceAndAmount.amount'
    const currentCryptoPairBalance = parseFloat(balance.find(b => b.asset === tradingPair.replace('USDT', ''))) || 0;
    currentCryptoPairAmount = typeof currentCryptoPairAmount === 'number'
        ? currentCryptoPairBalance.free
        : 0;

    const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
    txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

    // STEP V. Retrieve bid prices
    const currentOrderBook = await binance.getOrderBook(binanceRest, tradingPair);
    const currentOrderBookBids = exchangeLogic.bidsToObject(currentOrderBook.bids);

    // STEP VI. Determine how much you can spend at which price based on the order book
    const orderPriceAndAmount = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountOffUSDTToSpend);
    const orderPrice = orderPriceAndAmount.price;
    const orderAmount = orderPriceAndAmount.amount + currentCryptoPairAmount;
    txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately:`);
    txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);

    // STEP VII. Create the order 
    const buyOrder = await binanceOrder.createOrder(binanceRest, OrderType.LIMITBUY, tradingPair, orderAmount, orderPrice);

    // STEP VIII. MAKE SURE THE BUY ORDER IS FILLED OF IETS DERGELIJKS!
    txtLogger.writeToLogFile(`Buy order created. Details: `);
    txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}`);
    const orderStatusAfterCreation = buyOrder.status;
    if (orderStatusAfterCreation === OrderStatus.REJECTED || orderStatusAfterCreation === OrderStatus.EXPIRED) {
        txtLogger.writeToLogFile(`Program quit the orderingLogic() method because:`);
        txtLogger.writeToLogFile(`The just created buy order status is equal to: ${orderStatusAfterCreation}`);
        return;
    }

    let orderFilled = buyOrder.status === OrderStatus.FILLED;
    if (orderFilled === false) {
        txtLogger.writeToLogFile(`Order was not immediately filled after the creation`);
        txtLogger.writeToLogFile(`Retry amount: ${checkOrderStatusMaxRetryCount}. Retry time ${checkOrderStatusRetryTime}`);

        orderFilled = await exchangeLogic.determineOrderFilled(
            binanceRest,
            tradingPair,
            buyOrder.clientOrderId,
            checkOrderStatusMaxRetryCount,
            checkOrderStatusRetryTime,
            orderStatusAfterCreation
        );
        // TODO: wat is ie maar half gevuld is... Of op 95% na... 
    }


    // STEP IX. Create a stoploss and a sell order    
    if (orderFilled === true) {
        const profitPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeProfitPercentage);
        const stopLossPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeLossPercentage);
        const sellOrder = await binanceOrder.createOrder(binanceRest, OrderType.LIMITSELL, tradingPair, orderAmount, orderPrice);
        const stopLossLimitOrder = await binanceOrder.createOrder(binanceRest, OrderType.STOPLOSSLIMIT, tradingPair, orderAmount, orderPrice);


        // STEP X. Monitor the stoploss and sell order. Once one got filled, the other one should be canceled.
        /*  
            MAKE SURE THAT:
                A.) In case sellOrder triggers ===> the stopLossLimitOrder is canceled
                b.) In case stopLossLimitOrder triggers ===> the sellOrder is canceled

                TODO: hoe monitor ik dat dit gebeurt? 
                    Peramanent een while loop laten draaien, het met gevaar dat deze methode 
                    uren/dagen doorgaat.

                    Een stream opzetten of iets dergelijks?
                        - Per order krijg je dan een stream. Zie 'stream.js'
        */

        const iets = exchangeLogic.monitorSellAndStopLossOrder();
        //   

    }
}


runProgram();
