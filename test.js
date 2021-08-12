const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');
const excel = require('./services/exportService');
const configChecker = require('./helpers/config-sanity-check');

async function runTestInTerminal() {
    let excelFileContent = [];
    let numberOffApiCalls = 0;

    // STEP 1 - Sanity check the config.json
    const configCheck = configChecker.checkConfigData(config, true);
    if (configCheck.closeProgram === true) {
        return;
    }

    // STEP 2 - Prepare configuration data 
    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const candleAmountToLookIntoTheFuture = config.test.candleAmountToLookIntoTheFuture;
    const generateExcelFile = config.generateExcelFile;
    const orderConditions = config.orderConditions;

    // STEP 3 - Retrieve RSI & calculate bullish divergence foreach order condition
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
        const tradingPair = order.tradingPair;
        const candleInterval = order.interval;

        const rsiMinimumRisingPercentage = order.rsi.minimumRisingPercentage;
        const rsiCalculationLength = order.rsi.calculationLength;

        const candleMinimumDeclingPercentage = order.candle.minimumDeclingPercentage;
        const startCount = order.calcBullishDivergence.numberOfMinimumIntervals;
        const stopCount = order.calcBullishDivergence.numberOfMaximumIntervals;

        const takeProfitPercentage = order.order.takeProfitPercentage;
        const takeLossPercentage = order.order.takeLossPercentage;

        const url = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
        numberOffApiCalls = numberOffApiCalls + 1;

        console.log('---------- Retrieve Candles from Binance URL ----------');
        console.log(url);

        const candleList = await candleHelper.retrieveCandles(url);
        const candleObjectList = candleHelper.generateSmallObjectsFromData(candleList);
        const closePriceList = candleHelper.generateClosePricesList(candleList);

        const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

        const historicalBullishDivergenceCandles = calculate.calculateBullishHistoricalDivergences(
            closePriceList,
            candleObjectList,
            rsiCollection,
            startCount,
            stopCount,
            rsiMinimumRisingPercentage,
            candleMinimumDeclingPercentage,
            candleAmountToLookIntoTheFuture,
            takeLossPercentage,
            takeProfitPercentage,
            orderConditionName,
            tradingPair
        );
        historicalBullishDivergenceCandles.forEach(hit => {
            if (hit !== []) {
                excelFileContent.push(hit);
            }
        });

    };

    // STEP 4 - Generate/update Excel file 
    if (generateExcelFile === true && excelFileContent.length >= 1) {
        console.log(`---------- bullishDivergenceCandles ----------`);
        console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);
        const metaDataContent = calculate.calcTradeOutcomes(excelFileContent, numberOffApiCalls);
        excel.exportHistoricalTest(excelFileContent, metaDataContent);
    }
}

runTestInTerminal();
