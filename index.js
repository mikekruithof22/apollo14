const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');

const excel = require('./services/exportService');

async function runInTerminal() {
    let logFileBullishDivergenceContent;

    // STEP 01 - prepare configuration data
    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve + config.calcBullishDivergence.numberOfMaximumIntervals;
    const testWithHistoricData = config.testWithHistoricData;

    const rsiMinimumRisingPercentage = config.rsi.minimumRisingPercentage;
    const rsiCalculationLength = config.rsi.calculationLength;

    const generateExcelFile = config.generateExcelFile;
    const tradingPair = config.candle.tradingPair;
    const candleInterval = config.candle.interval;
    const candleMinimumDeclingPercentage = config.candle.minimumDeclingPercentage;

    const startCount = config.calcBullishDivergence.numberOfMinimumIntervals;
    const stopCount = config.calcBullishDivergence.numberOfMaximumIntervals;

    const url = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
    console.log('----------- Retrieve Candles from Binance URL ------------');
    console.log(url);

    // STEP 02 - retrieve candles
    const candleList = await candleHelper.retrieveCandles(url);
    const candleObjectList = candleHelper.generateSmallObjectsFromData(candleList);

    const closePriceList = candleHelper.generateClosePricesList(candleList);
    // console.log('---------------closePriceList ---------------');
    // console.log(closePriceList);
    // console.log('---------------candleObjectList ---------------');
    // console.log(candleObjectList);

    // STEP 03 - retrieve RSI
    const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);
    // console.log('---------------rsiCollection ---------------');
    // console.log(rsiCollection);

    // STEP 03 - calculate bullish divergence

    if (testWithHistoricData === true) {
        const historicalBullishDivergenceCandles = calculate.calculateBullishHistoricalDivergences(
            closePriceList,
            candleObjectList,
            rsiCollection,
            startCount,
            stopCount,
            rsiMinimumRisingPercentage,
            candleMinimumDeclingPercentage
        );
        logFileBullishDivergenceContent = historicalBullishDivergenceCandles;
    } else { // REAL TIME 
        const bullishDivergenceCandles = calculate.calculateBullishDivergence(
            closePriceList,
            candleObjectList,
            rsiCollection,
            startCount,
            stopCount,
            rsiMinimumRisingPercentage,
            candleMinimumDeclingPercentage
        );
        logFileBullishDivergenceContent = bullishDivergenceCandles;
    }


    // STEP 04 - generate Excel file
    const amountOfSuccessfulTrades = calculate.calcAmountOfSuccessfulTrades(logFileBullishDivergenceContent, 'profitable');
    const amounfOfUnknownTrades = calculate.calcAmountOfSuccessfulTrades(logFileBullishDivergenceContent, 'Unable');
    console.log(`----- ${config.testWithHistoricData === false ? 'REALTIME' : 'HISTORICAL'} bullishDivergenceCandles -----`);
    console.log(`Amount of bullish divergence(s): ${logFileBullishDivergenceContent.length}`);
    console.log(`Of those trades ${amountOfSuccessfulTrades} would have been profitable`);
    console.log(`For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`);

    if (generateExcelFile === true) {
        const metaDataContent = [
            {
                amount: `Amount of bullish divergence(s): ${logFileBullishDivergenceContent.length}`,
                succesfull: `Profitable trades: ${amountOfSuccessfulTrades}.`,
                unable: `For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`, 
                uri: url,
                configuration: JSON.stringify(config)
            }
        ];


        excel.exporDivergencesToExcel(logFileBullishDivergenceContent, metaDataContent);
    }
}

runInTerminal();


