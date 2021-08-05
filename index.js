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
    const isProduction = config.production.active;

    const realTimeTest = config.test.realTimeTest;
    const testWithHistoricalData = config.test.testWithHistoricalData;
    const generateExcelFile = config.generateExcelFile;
    const orderConditions = config.orderConditions;

    // STEP 2 - When in 'production' mode execute several checks here
    if (realTimeTest === true || isProduction === true) {
        const binanceRest = binance.generateBinanceRest();

        // stap 1 - controlleer het banksaldo en order status, onder bepaalde omstandigheden afsluiten!


        // stap 2 - indien stap 1 succesvol doorlopen dan... 

    }


    // STEP 3 - Retrieve RSI & calculate bullish divergence
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
                orderConditionName,
                tradingPair
            );
            historicalBullishDivergenceCandles.forEach(hit => {
                if (hit !== []) {
                    excelFileContent.push(hit);
                }
            });
        } else { // REAL TIME 
            const returnAfterOneItem = realTimeTest || isProduction;
            const bullishDivergenceCandles = calculate.calculateBullishDivergence(
                closePriceList,
                candleObjectList,
                rsiCollection,
                startCount,
                stopCount,
                rsiMinimumRisingPercentage,
                candleMinimumDeclingPercentage,
                orderConditionName,
                returnAfterOneItem
            );

            for await (let hit of bullishDivergenceCandles) {
                if (hit !== []) {
                    // STEP 3 - Create (test) orders          
                    if (production === true) {
                        // STEP 3.A - Realtime orders on production



                        

                    } else if (realTimeTest === true) {
                         // STEP 3.B - Realtime TEST orders

                        // TODO: kan deze weg omdat ie bij een eerdere stap wordt aangemaakt? 
                        const binanceRest = binance.generateBinanceRest(); 
                        const testOrder = await binance.generateTestOrder(binanceRest, tradingPair);

                        let obj = {
                            testOrder: testOrder,
                            candle: hit
                        }
                        excelFileContent.push(obj);
                        obj = {};
                    } else {
                        excelFileContent.push(hit);
                    }
                }
            }
        }
    };


    console.log('----------- excelFileContent ------------');
    console.log(excelFileContent);
         
    // STEP 4 - Generate/update Excel file 
    if (generateExcelFile === true && excelFileContent.length >= 1) {
        console.log(`----- ${testWithHistoricalData === false ? 'REALTIME' : 'HISTORICAL'} bullishDivergenceCandles -----`);
        console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);
        if (testWithHistoricalData === true) {
            const metaDataContent = calculate.calcTradeOutcomes(excelFileContent, testWithHistoricalData, numberOffApiCalls);
            excel.exportHistoricalTest(excelFileContent, metaDataContent);
        }

        if (realTimeTest === true) {
            excel.exportRealTimeTest(excelFileContent);
        }
    }
}

runInTerminal();
