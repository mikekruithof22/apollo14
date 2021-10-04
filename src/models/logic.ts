export class BidObject {
    price: number;
    amount: number;
}

export class AmountAndPrice {
    price: number;
    amount: number;
    totalUsdtAmount: number;
}


export class ConfigOrderCondition {
    name: string;
    rsi: {
        minimumRisingPercentage: number;
        calculationLength: number;
    }
    candle: {
        minimumDeclingPercentage: number;
    }
    calcBullishDivergence: {
        numberOfMinimumIntervals: number;
        numberOfMaximumIntervals: number;
    }
    order: {
        takeProfitPercentage: number;
        takeLossPercentage: number;
        maxUsdtBuyAmount: number;
        maxPercentageOffBalance: number;
    }
}

export class OrderCondition extends ConfigOrderCondition {
    tradingPair: string; 
}