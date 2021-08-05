const config = require('../config.json');

const stopLossCalculation = (startCandle, nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage) => {
    let message;

    for (var i = 0; i < nextCandlesAfterHit.length; i++) {
        // In case of loss, check the "lowest"
        const lossPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].low);
        // In case of profit, check the "highest",
        const profitPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].high);

        if (lossPercentage >= takeLossPercentage && profitPercentage >= takeProfitPercentage) {
            message = `Unknown - Profit limit and sell limit occured inside the same candle`;
            break;
        } else if (profitPercentage >= takeProfitPercentage) {
            message = `Profitable - Sold for: ${nextCandlesAfterHit[i].high} at ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else if (lossPercentage >= takeLossPercentage) {
            message = `Unprofitable - Sold for: ${nextCandlesAfterHit[i].low} at ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else {
            message = `Unknown - Unable to calculate`;
        }

    }
    return message;
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

module.exports = {
    stopLossCalculation,
    findHighestCandle,
    findLowestCandle
};
