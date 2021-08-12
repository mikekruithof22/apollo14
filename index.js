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
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const orderConditions = config.orderConditions;

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
            orderingLogic(order);
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

async function orderingLogic(order) {
    txtLogger.writeToLogFile(`Starting ordering logic method`);

    // STEP I. Prepare config.json order data 
    const orderConditionName = order.name;
    const tradingPair = order.tradingPair;
    const takeProfitPercentage = order.order.takeProfitPercentage;
    const takeLossPercentage = order.order.takeLossPercentage;

    // STEP II. bla bla bla bla bla bla bla bla bla bl
    const binanceRest = binance.generateBinanceRest();
    /* 
        TODO: hier de logic van 'test-order.js' neerzetten zodat Ronald ver kan gaan. 
    */
   

}


runProgram();
