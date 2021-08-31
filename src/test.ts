import { BalanceObject, HistoricalBullishDivergenceResult } from './models/calculate';
import { ClosePrice, LightWeightCandle } from './models/candle';

import CandleHelper from './helpers/candle';
import ConfigSanityCheck from './helpers/config-sanity-check';
import ExportService from './services/exportService';
import calculate from './helpers/calculate';
import config from '../config';
import rsiHelper from './helpers/rsi';

export default class Test {
    private candleHelper: CandleHelper;
    private exportService: ExportService;
    constructor() {
        this.candleHelper = new CandleHelper();
        this.exportService = new ExportService();
    }

    public async runTestInTerminal() {
        let excelFileContent: BalanceObject[] = [];
        let numberOffApiCalls: number = 0;

        // STEP 1 - Sanity check the config.json
        const configCheck = ConfigSanityCheck.checkConfigData(config, true);
        if (configCheck.closeProgram === true) {
            return;
        }

        // STEP 2 - Prepare configuration data 
        const brokerApiUrl: string = config.brokerApiUrl;
        const numberOfCandlesToRetrieve: number  = config.test.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
        const candleAmountToLookIntoTheFuture: number = config.test.candleAmountToLookIntoTheFuture;
        const generateExcelFile: boolean = config.test.generateExcelFile;
        const orderConditions: any = config.orderConditions;

        // STEP 3 - Retrieve RSI & calculate bullish divergence foreach order condition
        for await (let order of orderConditions) {
            const orderConditionName: string  = order.name;
            const tradingPair: string  = order.tradingPair;
            const candleInterval: number  = order.interval;

            const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
            const rsiCalculationLength: number = order.rsi.calculationLength;

            const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
            const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
            const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

            const takeProfitPercentage: number = order.order.takeProfitPercentage;
            const takeLossPercentage: number = order.order.takeLossPercentage;

            const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
            numberOffApiCalls = numberOffApiCalls + 1;

            console.log('---------- Retrieve Candles from Binance URL ----------');
            console.log(url);

            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: ClosePrice[]  = this.candleHelper.generateClosePricesList(candleList);

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
                orderConditionName
            );
            historicalBullishDivergenceCandles.forEach(hit => {
                if (hit !== undefined) {
                    excelFileContent.push(hit);
                }
            });

        };

        // STEP 4 - Generate/update Excel file 
        if (generateExcelFile === true && excelFileContent.length >= 1) {
            console.log(`---------- bullishDivergenceCandles ----------`);
            console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);
            const metaDataContent = calculate.calcTradeOutcomes(excelFileContent, numberOffApiCalls);
            this.exportService.exportHistoricalTest(excelFileContent, metaDataContent);
        }
    }
}

const test = new Test()
test.runTestInTerminal();
