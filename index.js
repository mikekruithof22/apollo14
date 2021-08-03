const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');

const excel = require('./services/exportService');

async function runInTerminal() {
    let excelFileContent = [];
    let numberOffApiCalls = 0;

    // STEP 01 - prepare config data
    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const testWithHistoricalData = config.testWithHistoricalData;
    const generateExcelFile = config.generateExcelFile;
    const tradingPair = config.tradingPair;
    const orderConditions = config.orderConditions;

    // STEP 02 - retrieve RSI & calculate bullish divergence
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
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
                orderConditionName
            );
            bullishDivergenceCandles.forEach(hit => {
                excelFileContent.push(hit);
            });
        }
    };

    // STEP 03 - generate Excel file
    let amountOfSuccessfulTrades;
    let amountOfUnsuccessfulTrades;
    let amounfOfUnknownTrades;

    console.log(`----- ${config.testWithHistoricalData === false ? 'REALTIME' : 'HISTORICAL'} bullishDivergenceCandles -----`);
    console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);
    if (testWithHistoricalData === true) {
        amountOfSuccessfulTrades = calculate.calcAmountOfSuccessfulTrades(excelFileContent, 'profitable');
        amountOfSuccessfulTrades = amountOfSuccessfulTrades ? amountOfSuccessfulTrades : 0;

        amountOfUnsuccessfulTrades = calculate.calcAmountOfSuccessfulTrades(excelFileContent, 'unsuccessful');
        amountOfUnsuccessfulTrades = amountOfUnsuccessfulTrades ? amountOfUnsuccessfulTrades : 0;

        amounfOfUnknownTrades = calculate.calcAmountOfSuccessfulTrades(excelFileContent, 'Unable');
        amounfOfUnknownTrades = amounfOfUnknownTrades ? amounfOfUnknownTrades : 0;

        console.log(`Of those trades ${amountOfSuccessfulTrades} would have been profitable`);
        console.log(`For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`);
    }


    if (generateExcelFile === true) {
        const metaDataContent = [
            {
                amount: `Amount of bullish divergence(s): ${excelFileContent.length}`,
                succesfull: testWithHistoricalData === false
                    ? `N/A`
                    : `${amountOfSuccessfulTrades}`,
                unsuccesfull: testWithHistoricalData === false
                    ? `N/A`
                    : `${amountOfUnsuccessfulTrades}`,
                unable: testWithHistoricalData === false
                    ? `N/A`
                    : `${amounfOfUnknownTrades}`,
                numberOffApiCalls: numberOffApiCalls,
                configuration: JSON.stringify(config)
            }
        ];

        console.log('--------------- excelFileContent  ---------------');
        console.log(excelFileContent);


        excel.exporDivergencesToExcel(excelFileContent, metaDataContent);
    }
}

runInTerminal();


