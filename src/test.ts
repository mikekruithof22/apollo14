import { BalanceObject } from './models/calculate';
import CandleHelper from './helpers/candle';
import ConfigSanityCheck from './helpers/config-sanity-check';
import ExportService from './services/exportService';
import { LightWeightCandle } from './models/candle';
import calculate from './helpers/calculate';
import config from '../config';
import fetch from 'node-fetch';
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
        const incorrectConfigData: boolean = ConfigSanityCheck.checkConfigData();
        if (incorrectConfigData) {
            return;
        }
        console.log(`Checking for bullish divergences, one moment please...`);

        // STEP 2 - Prepare configuration data 
        const brokerApiUrl: string = config.brokerApiUrl;
        const numberOfCandlesToRetrieve: number = config.test.numberOfCandlesToRetrieve; + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
        const candleAmountToLookIntoTheFuture: number = config.test.candleAmountToLookIntoTheFuture;
        const generateExcelFile: boolean = config.test.generateExcelFile;

        const orderConditions: any[] = config.orderConditions;
        const candleInterval: string = config.generic.timeIntervals[0]; // For the time being only one interval, therefore [0].
        const tradingPairs: string[] = config.tradingPairs;
        const baseCoin: string = config.baseCoin;
        const rsiCalculationLength: number = config.generic.order.rsiCalculationLength;
        const doNotOrderWhenRSIValueIsBelow: number = config.generic.order.doNotOrder.RSIValueIsBelow;

        // STEP 3 - Retrieve RSI & calculate bullish divergence foreach trading pair
        for await (let tradingPair of tradingPairs) {
            const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}${baseCoin}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: number[] = this.candleHelper.generateClosePricesList(candleList);
            const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

            for await (let order of orderConditions) {
                const orderConditionName: string = `${tradingPair}-${baseCoin}-${order.name}`;
                const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
                const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
                const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
                const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

                const takeProfitPercentage: number = order.order.takeProfitPercentage;
                const takeLossPercentage: number = order.order.takeLossPercentage;

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
                    doNotOrderWhenRSIValueIsBelow
                );
                historicalBullishDivergenceCandles.forEach(hit => {
                    if (hit !== undefined) {
                        excelFileContent.push(hit);
                    }
                });
            };

        }

        console.log(`---------- bullishDivergenceCandles ----------`);
        console.log(`There are ${orderConditions.length * tradingPairs.length} order condition(s)`);
        console.log(`Amount of bullish divergence(s): ${excelFileContent.length}`);

        // STEP 4 - Generate/update Excel file 
        if (generateExcelFile === true && excelFileContent.length >= 1) {
            const metaDataContent = calculate.calcTradeOutcomes(excelFileContent, numberOffApiCalls);
            this.exportService.exportHistoricalTest(excelFileContent, metaDataContent);

        }
    }

    public async getTop100BinanceCoins() {
        console.log(`Retrieving top 100 coins from Binance by trading volume, one moment please...`);

        const result = await fetch('https://api.coingecko.com/api/v3/exchanges/binance')
            .then(res => { return res.json() })
            .then(data => {
                return data;
            }).catch(error => console.log(error));
        const tickers = result.tickers;
        for (var i = 0; i < tickers.length; i++) {
            console.log('# Ticker - target');
            console.log(`   ${tickers[i].base} ${tickers[i].target}`);
        }

        console.log('### NOTE: in case you want to generate Excel files make sure to change the following value inside the config.json');
        console.log('test.retrieveTop100CoinsInsteadOftest = true');  
    }
}

const test = new Test();
if (config.test.retrieveTop100CoinsInsteadOftest) {
    test.getTop100BinanceCoins();
} else {
    test.runTestInTerminal();
}
