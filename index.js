const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');
const excel = require('./services/exportService');
const configChecker = require('./helpers/config-sanity-check');
const binance = require('./binance/binance');

async function runInTerminal() {
    let excelFileContent = [];
    let numberOffApiCalls = 0;

    // STEP 1 - Prepare configuration data and execute a sanity check
    const configCheck = configChecker.checkConfigData(config);

    if (configCheck.closeProgram === true) {
        console.log(configCheck.message);
        return;
    }

    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const enableCreateOrders = config.enableCreateOrders;
    const testWithHistoricalData = config.test.testWithHistoricalData;
    const generateExcelFile = config.test.generateExcelFile;
    const orderConditions = config.orderConditions;

    // STEP 2 - Retrieve RSI & calculate bullish divergence
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
        const tradingPair = order.tradingPair;
        const candleInterval = order.interval;

        const rsiMinimumRisingPercentage = order.rsi.minimumRisingPercentage;
        const rsiCalculationLength = order.rsi.calculationLength;

        const candleMinimumDeclingPercentage = order.candle.minimumDeclingPercentage;
        const startCount = order.calcBullishDivergence.numberOfMinimumIntervals;
        const stopCount = order.calcBullishDivergence.numberOfMaximumIntervals;

        const takeProfitPercentage = order.stopLossOrder.takeProfitPercentage;
        const takeLossPercentage = order.stopLossOrder.takeLossPercentage;
        const candleAmountToLookIntoTheFuture = order.stopLossOrder.candleAmountToLookIntoTheFuture;

        const url = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
        numberOffApiCalls = numberOffApiCalls + 1;

        console.log('----------- Retrieve Candles from Binance URL ------------');
        console.log(url);

        const candleList = await candleHelper.retrieveCandles(url);
        const candleObjectList = candleHelper.generateSmallObjectsFromData(candleList);
        const closePriceList = candleHelper.generateClosePricesList(candleList);

        const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);
        // console.log('---------------rsiCollection ---------------');
        // console.log(rsiCollection);


        if (testWithHistoricalData === true) {
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
                orderConditionName
            );
            historicalBullishDivergenceCandles.forEach(hit => {
                excelFileContent.push(hit);
            });
        } else { // REAL TIME 
            const bullishDivergenceCandles = calculate.calculateBullishDivergence(
                closePriceList,
                candleObjectList,
                rsiCollection,
                startCount,
                stopCount,
                rsiMinimumRisingPercentage,
                candleMinimumDeclingPercentage,
                takeLossPercentage,
                takeProfitPercentage,
                orderConditionName,
                enableCreateOrders
            );
            bullishDivergenceCandles.forEach(hit => {
                excelFileContent.push(hit);
            });
        }
    };

    /*
        TODO: hier verder gaan en via Binance een order inschieten.
            - hoe willen we die loggen? Een entry in een Excel file? Of willen we dat in een txt bestand?
                (Eerste optie heeft mijn voorkeur)


    */
    if (enableCreateOrders) {
        // binance.runBinance();
    }


    // STEP 3 - Generate Excel file AND/OR create a order in case of production

    console.log(`----- ${config.testWithHistoricalData === false ? 'REALTIME' : 'HISTORICAL'} bullishDivergenceCandles -----`);
    console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);

    let tradeInfo;
    if (testWithHistoricalData === true) {
        tradeInfo = calculate.calcTradeOutcomes(excelFileContent);
    }

    if (generateExcelFile === true) {
        const metaDataContent = [
            {
                amount: `${excelFileContent.length}`,
                succesfull: testWithHistoricalData === false
                    ? `N/A`
                    : `${tradeInfo.amountOfSuccessfulTrades}`,
                unsuccesfull: testWithHistoricalData === false
                    ? `N/A`
                    : `${tradeInfo.amountOfUnsuccessfulTrades}`,
                unable: testWithHistoricalData === false
                    ? `N/A`
                    : `${tradeInfo.amounfOfUnknownTrades}`,
                numberOffApiCalls: numberOffApiCalls,
                configuration: JSON.stringify(config)
            }
        ];
        excel.exporDivergencesToExcel(excelFileContent, metaDataContent);
    }
}

runInTerminal();


