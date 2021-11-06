import { LightWeightCandle } from '../models/candle';
import { LogLevel } from '../models/log-level';
import { OrderConditionResult } from '../models/calculate';
import config from '../../config';
import stopLoss from './stop-loss';
import txtLogger from './txt-logger';

export default class CalculateHelper {

    public static calculateBullishDivergenceOrCrashOrder = (
        closePriceList: number[],
        candleList: LightWeightCandle[],
        rsiItems: number[],
        startCount: number,
        stopCount: number,
        rsiMinimumRisingPercentage: number,
        candleMinimumDeclingPercentage: number,
        orderConditionName: string,
        botPauseActive: boolean
    ): OrderConditionResult => {
        const mostRecentCandleIndex = closePriceList.length - 1;
        const mostRecentClose = closePriceList[mostRecentCandleIndex];
        const mostRecentRsiIndex = rsiItems.length - 1;
        const mostRecentRsiValue = rsiItems[mostRecentRsiIndex];
        const stopCandle = mostRecentCandleIndex - stopCount;
        let compareWithRsiIndex = mostRecentRsiIndex;

        for (var i = closePriceList.length - 2; i >= stopCandle; i--) {
            const compareWithClose = closePriceList[i];
            compareWithRsiIndex--;

            try {
                // STEP 1 - calculate priceListDelta
                const closePriceChange = CalculateHelper.calculatePercentageChange(compareWithClose, mostRecentClose);

                // STEP 2 - determine if there is a crash
                const crashConfig = config.production.largeCrashOrder;
                if (crashConfig.maxAmountOfCandlesToLookBack >= mostRecentCandleIndex - i
                    && closePriceChange <= crashConfig.minimumDeclingPercentage) {
                    return {
                        startWithCandle: candleList[i],
                        endingCandle: candleList[mostRecentCandleIndex],
                        totalCandles: mostRecentCandleIndex - i,
                        isCrashOrder: true
                    } as OrderConditionResult;
                }

                // This part is only for bullish Divergences
                if (mostRecentCandleIndex - i >= startCount &&
                    !botPauseActive) {
                    // STEP 3 - calculate RSI delta
                    const compareWithRsiValue = rsiItems[compareWithRsiIndex];
                    const rsiChange = CalculateHelper.calculatePercentageChange(compareWithRsiValue, mostRecentRsiValue);

                    // STEP 4 - determine if there is a bullish divergence. Only when pause is not active
                    if (rsiChange >= rsiMinimumRisingPercentage &&
                        closePriceChange <= candleMinimumDeclingPercentage) {
                        return {
                            startWithCandle: candleList[i],
                            startRsiValue: compareWithRsiValue,
                            endingCandle: candleList[mostRecentCandleIndex],
                            endiRsiValue: mostRecentRsiValue,
                            orderConditionName: orderConditionName,
                            totalCandles: mostRecentCandleIndex - i
                        } as OrderConditionResult;
                    }
                }
            } catch (e) {
                txtLogger.writeToLogFile(`calculateBullishDivergenceOrCrashOrder() failed. ${JSON.stringify(e)}`, LogLevel.ERROR);
            }
        }
    }

    public static calculateBullishHistoricalDivergences = (
        closePriceList,
        candleList,
        rsiItems,
        startCount,
        stopCount,
        rsiMinimumRisingPercentage,
        candleMinimumDeclingPercentage,
        candleAmountToLookIntoTheFuture,
        takeLossPercentage,
        takeProfitPercentage,
        orderConditionName,
        doNotOrderWhenRSIValueIsBelow
    ) => {

        let bullishDivergenceCandles = [];

        for (var i = startCount; i < closePriceList.length; i++) {
            const currentCandle = closePriceList[closePriceList.length - i];
            const currentCandleIndex = closePriceList.length - i;
            const currentRsiValue = rsiItems[rsiItems.length - i];

            for (var j = startCount; j < stopCount; j++) {
                const compareWithCandle = closePriceList[closePriceList.length - (j + i)];
                const compareWithCandleIndex = closePriceList.length - (j + i);
                const compareWithRsiValue = rsiItems[rsiItems.length - (j + i)];

                const closePriceDifference = currentCandle - compareWithCandle;
                const rsiDifference = currentRsiValue - compareWithRsiValue;

                if (
                    !isNaN(closePriceDifference) &&
                    !isNaN(rsiDifference) &&
                    j <= stopCount
                ) {
                    // STEP 1 - calculate RSI delta
                    const rsiChange = CalculateHelper.calculatePercentageChange(compareWithRsiValue, currentRsiValue);

                    // STEP 2 - calculate priceListDelta
                    const closePriceChange = CalculateHelper.calculatePercentageChange(compareWithCandle, currentCandle);

                    const endingRsiValue: number = currentRsiValue;

                    // STEP 3 - determine if there is a bullish divergence
                    if (
                        rsiChange >= rsiMinimumRisingPercentage &&
                        closePriceChange <= candleMinimumDeclingPercentage &&
                        endingRsiValue >= doNotOrderWhenRSIValueIsBelow
                    ) {
                        const firstIndex = currentCandleIndex + 1;
                        const lastIndex = firstIndex + candleAmountToLookIntoTheFuture;
                        const nextCandlesAfterHit = candleList.slice(firstIndex, lastIndex);

                        let obj = {
                            idFirstCandle: candleList[compareWithCandleIndex].openTime,
                            idSecondCandle: candleList[currentCandleIndex].openTime,
                            startWithCandle: candleList[compareWithCandleIndex],
                            startRsiValue: compareWithRsiValue,
                            endingCandle: candleList[currentCandleIndex],
                            endiRsiValue: currentRsiValue,
                            orderConditionName: orderConditionName,
                            totalCandles: currentCandleIndex - compareWithCandleIndex,
                            nextCandlesAfterHit: nextCandlesAfterHit,
                            startCandle: candleList[currentCandleIndex]
                        }

                        bullishDivergenceCandles.push(obj);
                        obj = undefined;
                        break;

                    }
                } else {
                    break;
                }
            }
        }
        // remove duplicate starting candles
        const uniquebullishStartingDivergenceCandles = Array.from(new Set(bullishDivergenceCandles.map(a => a.idFirstCandle)))
            .map(id => {
                return bullishDivergenceCandles.find(a => a.idFirstCandle === id)
            });
        // remove duplicate ending candles
        const uniquebullishEndingDivergenceCandles = Array.from(new Set(uniquebullishStartingDivergenceCandles.map(a => a.idSecondCandle)))
            .map(id => {
                return uniquebullishStartingDivergenceCandles.find(a => a.idSecondCandle === id)
            });

        const candleInfo = uniquebullishEndingDivergenceCandles.reverse();
        const finalCandles = CalculateHelper.addBalanceCalcProperties(candleInfo, takeLossPercentage, takeProfitPercentage);
        return finalCandles;
    }

    public static addBalanceCalcProperties = (candleInfo, takeLossPercentage, takeProfitPercentage) => {
        let balance = 1000;

        let bullishDivergenceCandles = [];
        const leverageActive: boolean = config.test.leverage.active;
        const leverageAmount: number = config.test.leverage.amount;

        for (var i = 0; i < candleInfo.length; i++) {

            const stopLossResult = stopLoss.stopLossCalculation(candleInfo[i].startCandle, candleInfo[i].nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage);
            const stopLossMessage = stopLossResult.message;

            if (leverageActive === true) {
                balance = balance * (1 + stopLossResult.profitOrLossPercentage * leverageAmount);
            } else {
                balance = balance * (1 + stopLossResult.profitOrLossPercentage);
            }
            let obj = {
                id: candleInfo[i].id,
                startWithCandle: candleInfo[i].startWithCandle,
                startRsiValue: candleInfo[i].startRsiValue,
                endingCandle: candleInfo[i].endingCandle,
                endiRsiValue: candleInfo[i].endiRsiValue,
                balance: isNaN(balance) ? 1000 : balance,
                stopLossMsg: stopLossMessage,
                orderConditionName: candleInfo[i].orderConditionName,
                totalCandles: candleInfo[i].totalCandles
            }

            bullishDivergenceCandles.push(obj);
            obj = undefined;
        }
        return bullishDivergenceCandles;
    }

    public static calculatePercentageChange = (a: number, b: number) => {
        let percent;
        if (b !== 0) {
            if (a !== 0) {
                percent = (b - a) / a * 100;
            } else {
                percent = b * 100;
            }
        } else {
            percent = - a * 100;
        }
        return percent;
    }


    public static calcAmountOfSuccessfulTrades = (bullishDivergenceCandles, searchFor) => {
        const count = bullishDivergenceCandles.filter(function (value) {
            return value.stopLossMsg.includes(searchFor) === true
        }).length;

        return count;
    }

    public static calcTradeOutcomes = (excelFileContent, numberOffApiCalls) => {
        let amountOfSuccessfulTrades = CalculateHelper.calcAmountOfSuccessfulTrades(excelFileContent, 'Profitable');
        amountOfSuccessfulTrades = amountOfSuccessfulTrades ? amountOfSuccessfulTrades : 0;

        let amountOfUnsuccessfulTrades = CalculateHelper.calcAmountOfSuccessfulTrades(excelFileContent, 'Unprofitable');
        amountOfUnsuccessfulTrades = amountOfUnsuccessfulTrades ? amountOfUnsuccessfulTrades : 0;

        let amounfOfUnknownTrades = CalculateHelper.calcAmountOfSuccessfulTrades(excelFileContent, 'Unable to calculate');
        amounfOfUnknownTrades = amounfOfUnknownTrades ? amounfOfUnknownTrades : 0;

        let amounfOfUnknownSameCandleTrades = CalculateHelper.calcAmountOfSuccessfulTrades(excelFileContent, 'same candle');
        amounfOfUnknownSameCandleTrades = amounfOfUnknownSameCandleTrades ? amounfOfUnknownSameCandleTrades : 0;

        console.log(`Of those trades ${amountOfSuccessfulTrades} would have been profitable`);
        console.log(`For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`);

        const metaDataContent = [{
            amount: `${excelFileContent.length}`,
            succesfull: `${amountOfSuccessfulTrades}`,
            unsuccesfull: `${amountOfUnsuccessfulTrades}`,
            unableSameCandle: `${amounfOfUnknownSameCandleTrades}`,
            unableUnknown: `${amounfOfUnknownTrades}`,
            numberOffApiCalls: numberOffApiCalls,
            configuration: JSON.stringify(config)
        }];

        return metaDataContent;
    }
}
