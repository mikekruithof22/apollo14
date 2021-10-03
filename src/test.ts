import { ClosePrice, ClosePriceCollection, LightWeightCandle, LightWeightCandleCollection, RsiCollection } from './models/candle';

import { BalanceObject } from './models/calculate';
import CandleHelper from './helpers/candle';
import { ConfigOrderCondition } from './models/logic';
import ConfigSanityCheck from './helpers/config-sanity-check';
import ExportService from './services/exportService';
import OrderConditionsHelper from './helpers/order-condition-generator';
import calculate from './helpers/calculate';
import config from '../config';
import rsiHelper from './helpers/rsi';

export default class Test {
    private candleHelper: CandleHelper;
    private exportService: ExportService;
    private orderConditionsHelper: OrderConditionsHelper;
    constructor() {
        this.candleHelper = new CandleHelper();
        this.exportService = new ExportService();
        this.orderConditionsHelper = new OrderConditionsHelper();
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
        const numberOfCandlesToRetrieve: number = config.test.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
        const candleAmountToLookIntoTheFuture: number = config.test.candleAmountToLookIntoTheFuture;
        const generateExcelFile: boolean = config.test.generateExcelFile;
        const orderConditions: ConfigOrderCondition[] = config.orderConditions as ConfigOrderCondition[];

        const tradingPairs: string[] = config.tradingPairs;
        let orderConditionsIncludingTradingPairs = this.orderConditionsHelper.generateConditions(orderConditions, tradingPairs);

        let lightWeightCandleCollection: LightWeightCandleCollection[] = [];
        let closePriceCollection: ClosePriceCollection[] = [];
        let rsiCollection: RsiCollection[] = [];

        // STEP 3 - Retrieve RSI & calculate bullish divergence foreach order condition
        for await (let order of orderConditionsIncludingTradingPairs) {
            const orderConditionName: string = `${order.tradingPair} ${order.name}`;
            const tradingPair: string = order.tradingPair;
            const candleInterval: string = order.interval;

            const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
            const rsiCalculationLength: number = order.rsi.calculationLength;

            const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
            const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
            const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

            let candleObjectList: LightWeightCandle[];
            let closePriceList: ClosePrice[];
            let rsiValues: any[];

            const candlesAlreadyInMemory: boolean =
                lightWeightCandleCollection.find(c => c.tradingPair === tradingPair) !== undefined &&
                closePriceCollection.find(c => c.tradingPair === tradingPair) !== undefined &&
                rsiCollection.find(c => c.tradingPair === tradingPair) !== undefined &&
                lightWeightCandleCollection.find(c => c.interval === candleInterval) !== undefined;

            if (candlesAlreadyInMemory === false) {
                const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
                numberOffApiCalls = numberOffApiCalls + 1;
                console.log('---------- Retrieve Candles from Binance URL ----------');
                console.log(url);
                const candleList = await this.candleHelper.retrieveCandles(url);
                candleObjectList = this.candleHelper.generateSmallObjectsFromData(candleList);
                closePriceList = this.candleHelper.generateClosePricesList(candleList);
                rsiValues = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

                let objLightWeightCandleCollection: LightWeightCandleCollection = {
                    tradingPair: tradingPair,
                    interval: candleInterval,
                    lightWeightCandles: candleObjectList
                }
                let objclosePriceCollection: ClosePriceCollection = {
                    tradingPair: tradingPair,
                    interval: candleInterval,
                    closePrices: closePriceList
                }
                let objRsiCollection: RsiCollection = {
                    tradingPair: tradingPair,
                    interval: candleInterval,
                    rsiCollection: rsiValues
                }
                lightWeightCandleCollection.push(objLightWeightCandleCollection);
                closePriceCollection.push(objclosePriceCollection);
                rsiCollection.push(objRsiCollection);
            } else {
                candleObjectList = lightWeightCandleCollection.find(b => b.tradingPair === tradingPair).lightWeightCandles;
                closePriceList = closePriceCollection.find(b => b.tradingPair === tradingPair).closePrices;
                rsiValues = rsiCollection.find(b => b.tradingPair === tradingPair).rsiCollection;
            }

            const takeProfitPercentage: number = order.order.takeProfitPercentage;
            const takeLossPercentage: number = order.order.takeLossPercentage;

            const historicalBullishDivergenceCandles = calculate.calculateBullishHistoricalDivergences(
                closePriceList,
                candleObjectList,
                rsiValues,
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
