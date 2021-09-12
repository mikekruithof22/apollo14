export default class Stoploss {
    public static stopLossCalculation = (startCandle, nextCandlesAfterHit, takeLossPercentage, takeProfitPercentage) => {
        let message: string;
        let sellResult: number = 0;

        const takeLossPercentageInPercentage: number = takeLossPercentage / 100;
        const takeLossPrice: number = (1 - takeLossPercentageInPercentage) * startCandle.close;

        const takeProfitPercentageInPercentage: number = takeProfitPercentage / 100;
        let takeProfitPrice: number = (1 + takeProfitPercentageInPercentage) * startCandle.close;
        takeProfitPrice = Number(takeProfitPrice.toFixed(5));

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

    public static findHighestCandle = (nextCandlesAfterHit): string => {
        let message: string;
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

    public static findLowestCandle = (nextCandlesAfterHit): string => {
        let message: string;
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
}
