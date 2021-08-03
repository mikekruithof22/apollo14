const config = require('./config.json');
const rsiHelper = require('./helpers/rsi');
const candleHelper = require('./helpers/candle');
const calculate = require('./helpers/calculate');

const excel = require('./services/exportService');

async function runInTerminal() {
    let logFileBullishDivergenceContent = [];
    let numberOffApiCalls = 0;

    // STEP 01 - prepare config data
    const brokerApiUrl = config.brokerApiUrl;
    const numberOfCandlesToRetrieve = config.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
    const testWithHistoricData = config.testWithHistoricData;
    const generateExcelFile = config.generateExcelFile;
    const tradingPair = config.tradingPair;
    const orderConditions = config.orderConditions;

    // STEP 02 - retrieve RSI & calculate bullish divergence
    for await (let order of orderConditions) {
        const orderConditionName = order.name;
        const candleInterval = order.interval;
        /* TODO: testmike, deze aan de praat krijgen uit de config. 
            "usePointsGainInsteadOffRisingPercentage": true,
             "minAbsolutePointsGain": 20,
        */

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
        // console.log(`Current order condition number : ${order.length}`);

        if (testWithHistoricData === true) {
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
                logFileBullishDivergenceContent.push(hit);
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
                logFileBullishDivergenceContent.push(hit);
            });
        }
    };

    /*
        TODO: werkt soort van, althans per order name soort...
        dit verder uitzoeken.

        Als je tijd over hebt hier mee verder gaan

                 const sortedLogFileBullishDivergenceContent = logFileBullishDivergenceContent.sort((a, b) => new Date(b.startWithCandle.openTime) - new Date(a.startWithCandle.openTime));

                https://www.codegrepper.com/search.php?q=sort%20date%20array%20javascript
    */

    // STEP 03 - generate Excel file
    let amountOfSuccessfulTrades;
    let amounfOfUnknownTrades;

    console.log(`----- ${config.testWithHistoricData === false ? 'REALTIME' : 'HISTORICAL'} bullishDivergenceCandles -----`);
    console.log(`Amount of bullish divergence(s): ${logFileBullishDivergenceContent.length}`);
    if (testWithHistoricData === true) {
        amountOfSuccessfulTrades = calculate.calcAmountOfSuccessfulTrades(logFileBullishDivergenceContent, 'profitable');
        amountOfSuccessfulTrades = amountOfSuccessfulTrades ? amountOfSuccessfulTrades : 0

        amounfOfUnknownTrades = calculate.calcAmountOfSuccessfulTrades(logFileBullishDivergenceContent, 'Unable');
        amounfOfUnknownTrades = amounfOfUnknownTrades ? amounfOfUnknownTrades : 0;

        console.log(`Of those trades ${amountOfSuccessfulTrades} would have been profitable`);
        console.log(`For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`);
    }


    if (generateExcelFile === true) {
        const metaDataContent = [
            {
                amount: `Amount of bullish divergence(s): ${logFileBullishDivergenceContent.length}`,
                succesfull: testWithHistoricData === false
                    ? `Realtime data ==> property cannot be filled`
                    : `Profitable trades: ${amountOfSuccessfulTrades}.`,
                unable: testWithHistoricData === false
                    ? `Realtime data ==> property cannot be filled`
                    : `For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`,
                numberOffApiCalls: numberOffApiCalls,
                configuration: JSON.stringify(config)
            }
        ];

        console.log('--------------- logFileBullishDivergenceContent  ---------------');
        console.log(logFileBullishDivergenceContent);


        excel.exporDivergencesToExcel(logFileBullishDivergenceContent, metaDataContent);
    }
}

runInTerminal();


