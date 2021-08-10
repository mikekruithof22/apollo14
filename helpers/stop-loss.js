const config = require('../config.json');

const stopLossCalculation = (startCandle, nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage) => {
    let message;
    let sellResult = 0;

    const takeLossPercentageInPercentage = takeLossPercentage / 100;
    const takeLossPrice = (1 - takeLossPercentageInPercentage) * startCandle.close;

    const takeProfitPercentageInPercentage = takeProfitPercentage / 100;
    let takeProfitPrice = (1 + takeProfitPercentageInPercentage) * startCandle.close;
    takeProfitPrice = takeProfitPrice.toFixed(5)

    for (var i = 0; i < nextCandlesAfterHit.length; i++) {
        let comparisonCandle = Object.assign({}, nextCandlesAfterHit[i]);
        if (comparisonCandle.low <= takeLossPrice && comparisonCandle.high >= takeProfitPrice) {
            message = `Unknown - Profit limit and sell limit occured inside the same candle.`;
            break;
        } else if (comparisonCandle.high >= takeProfitPrice) {
            message = `Profitable - After ${i} candles sold for: ${takeProfitPrice} at ${nextCandlesAfterHit[i].openTime}`;
            sellResult = takeProfitPercentageInPercentage;
            break;
        } else if (comparisonCandle.low <= takeLossPrice) {
            message = `Unprofitable -  After ${i} candles sold for: ${takeLossPrice} at ${nextCandlesAfterHit[i].openTime}`;
            sellResult = - takeLossPercentageInPercentage;
            break;
        } else {
            message = `UNKOWN - UNABLE TO CALCULATE!`;
        }
    }
    return {
        message: message,
        profitOrLossPercentage: sellResult
    };
}

const findHighestCandle = (nextCandlesAfterHit) => {
    let message;
    if (nextCandlesAfterHit.length === 0) {
        message = `No candle after hit found. Something might be wrong.`;
    } else {
        const candleWithHighstPrice = nextCandlesAfterHit.reduce(function (prev, current) {
            return (prev.high > current.high) ? prev : current
        });

        message = `${candleWithHighstPrice.high} at ${candleWithHighstPrice.openTime}`;
    }
    return message;
}

const findLowestCandle = (nextCandlesAfterHit) => {
    let message;
    if (nextCandlesAfterHit.length === 0) {
        message = `No candle after hit found. Something might be wrong.`;
    } else {
        const candleWithLowestPrice = nextCandlesAfterHit.reduce(function (prev, current) {
            return (prev.low > current.low) ? prev : current
        });

        message = `${candleWithLowestPrice.low} at ${candleWithLowestPrice.openTime} `;
    }

    return message;
}

module.exports = {
    stopLossCalculation,
    findHighestCandle,
    findLowestCandle
};
