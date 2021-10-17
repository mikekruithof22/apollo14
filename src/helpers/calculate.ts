import { BullishDivergenceResult } from '../models/calculate';
import config from '../../config';
import stopLoss from './stop-loss';

export default class CalculateHelper {

    public static calculateBullishDivergence = (
        closePriceList,
        candleList,
        rsiItems,
        startCount,
        stopCount,
        rsiMinimumRisingPercentage,
        candleMinimumDeclingPercentage,
        orderConditionName
    ): BullishDivergenceResult => {
        for (var i = startCount; i < closePriceList.length; i++) {
            const mostRecentCandle = closePriceList[closePriceList.length - 1];
            const mostRecenCandleIndex = closePriceList.length - 1;
            const mostRecentRsiValue = rsiItems[rsiItems.length - 1];

            const compareWithCandle = closePriceList[closePriceList.length - i];
            const compareWithCandleIndex = closePriceList.length - i;
            const compareWithRsiValue = rsiItems[rsiItems.length - i];

            const closePriceDifference = mostRecentCandle - compareWithCandle;
            const rsiDifference = mostRecentRsiValue - compareWithRsiValue;

            if (
                !isNaN(closePriceDifference) &&
                !isNaN(rsiDifference) &&
                i <= stopCount
            ) {
                // STEP 1 - calculate RSI delta
                const rsiChange = CalculateHelper.calculatePercentageChange(compareWithRsiValue, mostRecentRsiValue);

                // STEP 2 - calculate priceListDelta
                const closePriceChange = CalculateHelper.calculatePercentageChange(compareWithCandle, mostRecentCandle);

                // STEP 3 - determine if there is a bullish divergence
                if (
                    rsiChange >= rsiMinimumRisingPercentage &&
                    closePriceChange <= candleMinimumDeclingPercentage &&
                    candleList !== undefined
                ) {
                    return {
                        startWithCandle: candleList[compareWithCandleIndex],
                        startRsiValue: compareWithRsiValue,
                        endingCandle: candleList[mostRecenCandleIndex],
                        endiRsiValue: mostRecentRsiValue,
                        orderConditionName: orderConditionName,
                        totalCandles: mostRecenCandleIndex - compareWithCandleIndex
                    }
                }
            } else {
                break;
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
        const consoleLogSteps = config.test.consoleLogSteps;

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
                        if (consoleLogSteps === true) {
                            console.log('JACKPOT! - <<<<< BullishDivergence - BullishDivergence - BullishDivergence >>>>> - JACKPOT!');
                        }
                        const firstIndex = currentCandleIndex + 1;
                        const lastIndex = firstIndex + candleAmountToLookIntoTheFuture;
                        const nextCandlesAfterHit = candleList.slice(firstIndex, lastIndex);

                        let obj = {
                            id: candleList[currentCandleIndex].openTime,
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

        const uniquebullishDivergenceCandles = Array.from(new Set(bullishDivergenceCandles.map(a => a.id)))
            .map(id => {
                return bullishDivergenceCandles.find(a => a.id === id)
            });
        const candleInfo = uniquebullishDivergenceCandles.reverse();
        const finalCandles = CalculateHelper.addBalanceCalcProperties(candleInfo, takeLossPercentage, takeProfitPercentage);
        return finalCandles;
    }

    public static addBalanceCalcProperties = (candleInfo, takeLossPercentage, takeProfitPercentage) => {
        let balance = 1000;

        let bullishDivergenceCandles = [];

        for (var i = 0; i < candleInfo.length; i++) {

            const stopLossResult = stopLoss.stopLossCalculation(candleInfo[i].startCandle, candleInfo[i].nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage);
            const stopLossMessage = stopLossResult.message;
            balance = balance * (1 + stopLossResult.profitOrLossPercentage);
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

    public static calculatePercentageChange = (a, b) => {
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
// module.exports = {
//     calculateBullishDivergence,
//     calculatePercentageChange,
//     showCalculationLoging,
//     calculateBullishHistoricalDivergences,
//     calcAmountOfSuccessfulTrades,
//     calcTradeOutcomes
// };
