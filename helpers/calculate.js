const config = require('../config.json');
const stopLoss = require('./stop-loss');

const calculateBullishDivergence = (
    closePriceList,
    candleList,
    rsiItems,
    startCount,
    stopCount,
    rsiMinimumRisingPercentage,
    candleMinimumDeclingPercentage,
    takeLossPercentage,
    takeProfitPercentage,
    orderConditionName,
    enableCreateOrders

) => {
    const consoleLogSteps = config.test.consoleLogSteps;

    let bullishDivergenceCandles = [];

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
            const rsiChange = calculatePercentageChange(compareWithRsiValue, mostRecentRsiValue);

            // STEP 2 - calculate priceListDelta
            const closePriceChange = calculatePercentageChange(compareWithCandle, mostRecentCandle);
            if (consoleLogSteps === true) {
                showCalculationLoging(compareWithRsiValue, mostRecentRsiValue, compareWithCandle, mostRecentCandle, i, rsiChange, closePriceChange);
            }
            // STEP 3 - determine if there is a bullish divergence
            if (
                rsiChange >= rsiMinimumRisingPercentage &&
                closePriceChange <= candleMinimumDeclingPercentage &&
                candleList !== undefined
            ) {
                if (consoleLogSteps === true) {
                    console.log('JACKPOT! - <<<<< BullishDivergence - BullishDivergence - BullishDivergence >>>>> - JACKPOT!');
                }

                let obj = {
                    startWithCandle: candleList[compareWithCandleIndex],
                    startRsiValue: compareWithRsiValue,
                    endingCandle: candleList[mostRecenCandleIndex],
                    endiRsiValue: mostRecentRsiValue,
                    orderConditionName: orderConditionName,
                    totalCandles: mostRecenCandleIndex - compareWithCandleIndex
                }
                bullishDivergenceCandles.push(obj);

                // In case 'enableCreateOrders' is equal to 'true' immediately return
                // so that you can create an order as fast as possible.
                if (enableCreateOrders === true) {
                    break;
                }
            }
        } else {
            break;
        }
    }
    return bullishDivergenceCandles;
}

const calculateBullishHistoricalDivergences = (
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
    orderConditionName
) => {
    const consoleLogSteps = config.test.consoleLogSteps;

    let bullishDivergenceCandles = [];

    for (var i = startCount; i < closePriceList.length; i++) {
        const currentCandle = closePriceList[closePriceList.length - i];
        const currentCandleIndex = closePriceList.length - i;
        const currentRsiValue = rsiItems[rsiItems.length - i];

        for (var j = startCount; j < stopCount; j++) {
            // for (var j = startCount; j < stopCount; j++) {
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
                const rsiChange = calculatePercentageChange(compareWithRsiValue, currentRsiValue);

                // STEP 2 - calculate priceListDelta
                const closePriceChange = calculatePercentageChange(compareWithCandle, currentCandle);
                if (consoleLogSteps === true) {
                    showCalculationLoging(compareWithRsiValue, currentRsiValue, compareWithCandle, currentCandle, i + j);
                }

                // STEP 3 - determine if there is a bullish divergence
                if (
                    rsiChange >= rsiMinimumRisingPercentage &&
                    closePriceChange <= candleMinimumDeclingPercentage
                ) {
                    if (consoleLogSteps === true) {
                        console.log('JACKPOT! - <<<<< BullishDivergence - BullishDivergence - BullishDivergence >>>>> - JACKPOT!');
                    }
                    const firstIndex = currentCandleIndex + 1;
                    const lastIndex = firstIndex + candleAmountToLookIntoTheFuture;
                    const nextCandlesAfterHit = candleList.slice(firstIndex, lastIndex);
                    const stopLossMessage = stopLoss.stopLossCalculation(candleList[currentCandleIndex], nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage);

                    const highestNextCandleAfterHit = stopLoss.findHighestCandle(nextCandlesAfterHit);
                    const lowestCandleAfterHit = stopLoss.findLowestCandle(nextCandlesAfterHit);

                    let obj = {
                        id: candleList[compareWithCandleIndex].openTime,
                        startWithCandle: candleList[compareWithCandleIndex],
                        startRsiValue: compareWithRsiValue,
                        endingCandle: candleList[currentCandleIndex],
                        endiRsiValue: currentRsiValue,
                        highestNextCandle: highestNextCandleAfterHit,
                        lowestCandle: lowestCandleAfterHit,
                        stopLossMsg: stopLossMessage,
                        orderConditionName: orderConditionName,
                        totalCandles: currentCandleIndex - compareWithCandleIndex
                    }

                    bullishDivergenceCandles.push(obj);
                    obj = {};
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
    return uniquebullishDivergenceCandles;
}

const calculatePercentageChange = (a, b) => {
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


const calcAmountOfSuccessfulTrades = (bullishDivergenceCandles, searchFor) => {
    const count = bullishDivergenceCandles.filter(function (value) {
        return value.stopLossMsg.includes(searchFor) === true
    }).length;

    return count;
}

const calcTradeOutcomes = (excelFileContent, testWithHistoricalData, numberOffApiCalls) => {
    let amountOfSuccessfulTrades = calcAmountOfSuccessfulTrades(excelFileContent, 'profitable');
    amountOfSuccessfulTrades = amountOfSuccessfulTrades ? amountOfSuccessfulTrades : 0;

    let amountOfUnsuccessfulTrades = calcAmountOfSuccessfulTrades(excelFileContent, 'unsuccessful');
    amountOfUnsuccessfulTrades = amountOfUnsuccessfulTrades ? amountOfUnsuccessfulTrades : 0;

    let amounfOfUnknownTrades = calcAmountOfSuccessfulTrades(excelFileContent, 'Unable');
    amounfOfUnknownTrades = amounfOfUnknownTrades ? amounfOfUnknownTrades : 0;

    console.log(`Of those trades ${amountOfSuccessfulTrades} would have been profitable`);
    console.log(`For ${amounfOfUnknownTrades} was it not possible to say if it would have been profitable`);

    const metaDataContent = [{
        amount: `${excelFileContent.length}`,
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
    }];

    return metaDataContent;
}

const showCalculationLoging = (compareWithRsiValue, mostRecentRsiValue, compareWithCandle, mostRecentCandle, i, rsiChange, closePriceChange) => {
    console.log('');
    console.log('**************************');
    console.log('--------------- START---------------');
    console.log('Amount off candles looking back:');
    console.log(i);
    console.log('Configured minimal RSI slope: ' + config.rsi.minimumRisingPercentage);
    console.log('Configured minimal CANDLE slope: ' + config.candle.minimumDeclingPercentage);

    console.log('--------------- RSI INFO ---------------');
    console.log('Compare with data point: ' + compareWithRsiValue);
    console.log('Most recent data point: ' + mostRecentRsiValue);
    console.log('Percentage change: ' + Math.round(rsiChange * 100) / 100 + '%');

    console.log('--------------- CANDLE INFO ---------------');
    console.log('Compare with close price: ' + compareWithCandle);
    console.log('Most recent close price: ' + mostRecentCandle);
    console.log('Percentage change: ' + Math.round(closePriceChange * 100) / 100 + '%');
}

module.exports = {
    calculateBullishDivergence,
    calculatePercentageChange,
    showCalculationLoging,
    calculateBullishHistoricalDivergences,
    calcAmountOfSuccessfulTrades,
    calcTradeOutcomes
};
