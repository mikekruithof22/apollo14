export class ActiveBuyOrder {
    clientOrderId: string;
    orderName: string;
    takeProfitPercentage: number;
    takeLossPercentage: number;
    minimumOrderQuantity: number;
    stepSize: number;
    tickSize: number;
}
export class ActiveOcoOrder {
    listClientOrderId: string;
}

export class OrderConfigObject {
        name: string;
        tradingPair: string;
        interval: string;
        rsi: {
            minimumRisingPercentage: number;
            calculationLength: number;
        };
        candle: {
            minimumDeclingPercentage: number;
        };
        calcBullishDivergence: {
            numberOfMinimumIntervals: number;
            numberOfMaximumIntervals: number;
        };
        order: {
            takeProfitPercentage: number;
            takeLossPercentage: number;
            maxUsdtBuyAmount: number;
            maxPercentageOffBalance: number;
            checkOrderStatusMaxRetryCount: number;
            checkOrderStatusRetryTime: number;
    }
}