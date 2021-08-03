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
    orderConditionName
) => {
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
            showCalculationLoging(compareWithRsiValue, mostRecentRsiValue, compareWithCandle, mostRecentCandle, i, rsiChange, closePriceChange);

            // STEP 3 - determine if there is a bullish divergence
            if (
                rsiChange >= rsiMinimumRisingPercentage &&
                closePriceChange <= candleMinimumDeclingPercentage &&
                candleList !== undefined
            ) {
                if (config.logBullishDivergenceCalculation === true) {
                    console.log('JACKPOT! - <<<<< BullishDivergence - BullishDivergence - BullishDivergence >>>>> - JACKPOT!');
                }

                let obj = {
                    message: 'Found a bullish divergence which meets the configured criteria',
                    startWithCandle: candleList[compareWithCandleIndex],
                    startRsiValue: compareWithRsiValue,
                    endingCandle: candleList[mostRecenCandleIndex],
                    endiRsiValue: mostRecentRsiValue,
                    orderConditionName: orderConditionName,
                    totalCandles: mostRecenCandleIndex - compareWithCandleIndex
                }
                bullishDivergenceCandles.push(obj);
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
    let bullishDivergenceCandles = [];

    // console.log('--------------- calculateBullishHistoricalDivergences---------------');
    // console.log('startCount '  + startCount);
    // console.log('stopCount '  + stopCount);

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
                showCalculationLoging(compareWithRsiValue, currentRsiValue, compareWithCandle, currentCandle, i + j);

                // STEP 3 - determine if there is a bullish divergence
                if (
                    rsiChange >= rsiMinimumRisingPercentage &&
                    closePriceChange <= candleMinimumDeclingPercentage
                ) {
                    if (config.logBullishDivergenceCalculation === true) {
                        console.log('JACKPOT! - <<<<< BullishDivergence - BullishDivergence - BullishDivergence >>>>> - JACKPOT!');
                    }
                    const firstIndex = currentCandleIndex + 1;
                    const lastIndex = firstIndex + candleAmountToLookIntoTheFuture;
                    const nextCandlesAfterHit = candleList.slice(firstIndex, lastIndex);
                    const stopLossMessage = stopLoss.stopLossCalculation(candleList[currentCandleIndex], nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage);

                    const highestNextCandleAfterHit = stopLoss.findHighestCandle(nextCandlesAfterHit);
                    const lowestCandleAfterHit = stopLoss.findLowestCandle(nextCandlesAfterHit);
                    // const nextCandleWithHighestSlope = calculatSlopeAfterBullishDivergence(candleList[i + j], nextCandlesAfterHit);


                    let obj = {
                        id: candleList[compareWithCandleIndex].openTime,
                        message: 'Found a bullish divergence which meets the configured criteria',
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

/*
    Once you got a Bullish Divergence get the close price from the last candle.
    Next compare it with the largest 'highest' from the following X-amount of candles
*/
const calculatSlopeAfterBullishDivergence = (startCandle, nextCandlesAfterHit) => {
    let result = [];
    for (var i = 0; i < nextCandlesAfterHit.length; i++) {
        let obj = {
            openTime: nextCandlesAfterHit[i].openTime,
            closeTime: nextCandlesAfterHit[i].closeTime,
            high: nextCandlesAfterHit[i].high,
            slope: calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].high)
        }
        result.push(obj);
        obj = {};
    }
    const highestResult = result.reduce((acc, result) => acc = acc && acc.slope > result.slope ? acc : result, undefined);
    return highestResult;
}

const showCalculationLoging = (compareWithRsiValue, mostRecentRsiValue, compareWithCandle, mostRecentCandle, i, rsiChange, closePriceChange) => {
    if (config.logBullishDivergenceCalculation === true) {
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
}

module.exports = {
    calculateBullishDivergence,
    calculatePercentageChange,
    showCalculationLoging,
    calculateBullishHistoricalDivergences,
    calcAmountOfSuccessfulTrades
};
