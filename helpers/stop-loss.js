const config = require('../config.json');

const stopLossCalculation = (startCandle, nextCandlesAfterHit) => {
    let message;
    const takeLossPercentage = config.stopLossOrder.takeLossPercentage;
    const takeProfitPercentage = config.stopLossOrder.takeProfitPercentage;

    for (var i = 0; i < nextCandlesAfterHit.length; i++) {
        // In case of loss, check the "lowest"
        const lossPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].low);
        // In case of profit, check the "highest",
        const profitPercentage = calculatePercentageChange(startCandle.close, nextCandlesAfterHit[i].high);

        // console.log('---------------stopLossCalculation ---------------');
        // console.log('lossPercentage');
        // console.log(lossPercentage);
        // console.log('takeLossPercentage');
        // console.log(takeLossPercentage);
        // console.log('profitPercentage');
        // console.log(profitPercentage);
        // console.log('takeProfitPercentage');
        // console.log(takeProfitPercentage);

        if (lossPercentage >= takeLossPercentage && profitPercentage >= takeProfitPercentage) {
            message = `Profit limit and sell limit occured inside the same candle --> Cannot tell if it is a profit or loss`;
            break;
        } else if (profitPercentage >= takeProfitPercentage) {
            message = `Trade was profitable. We sold for: ${nextCandlesAfterHit[i].high}. Candle closeDate: ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else if (lossPercentage >= takeLossPercentage) {
            message = `Trade was NOT profitable. We sold for: ${nextCandlesAfterHit[i].low}. Candle closeDate: ${nextCandlesAfterHit[i].closeTime}`;
            break;
        } else {
            message = `Unable to calculate if there would have been a profit or loss`;
        }

    }
    return message;
}

const findHighestCandle = (nextCandlesAfterHit) => {
    const candleWithHighstPrice = nextCandlesAfterHit.reduce(function(prev, current) {
        return (prev.high > current.high) ? prev : current
    });

    const message = `Highest 'high' price after hit ${candleWithHighstPrice.high} on ${candleWithHighstPrice.openTime}`;
    return message;
}

const findLowestCandle = (nextCandlesAfterHit) => {
    const candleWithLowestPrice = nextCandlesAfterHit.reduce(function(prev, current) {
        return (prev.low > current.low) ? prev : current
    });

    const message = `Lowest 'low' price after hit ${candleWithLowestPrice.low} on ${candleWithLowestPrice.openTime} `;
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
