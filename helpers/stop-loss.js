const config = require('../config.json');

const stopLossCalculation = (startCandle, nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage) => {
    let message;

    for (var i = 0; i < nextCandlesAfterHit.length; i++) {
        // In case of loss, check the "lowest"
        const lossPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].low);
        // In case of profit, check the "highest",
        const profitPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].high);

        if (lossPercentage >= takeLossPercentage && profitPercentage >= takeProfitPercentage) {
            message = `Profit limit and sell limit occured inside the same candle --> Unable tell if it is a profit or loss`;
            break;
        } else if (profitPercentage >= takeProfitPercentage) {
            message = `Trade was profitable. We sold for: ${nextCandlesAfterHit[i].high}. Candle closeDate: ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else if (lossPercentage >= takeLossPercentage) {
            message = `Trade was unsuccessful. We sold for: ${nextCandlesAfterHit[i].low}. Candle closeDate: ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else {
            message = `Unable to calculate if there would have been a profit or loss`;
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

        message = `${candleWithHighstPrice.high} on ${candleWithHighstPrice.openTime}`;
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

        message = `${candleWithLowestPrice.low} on ${candleWithLowestPrice.openTime} `;
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
