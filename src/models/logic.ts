export class AmountAndPrice {
    price: number;
    amount: number;
    totalUsdtAmount: number;
}


export class ConfigOrderCondition {
    name: string;
    rsi: {
        minimumRisingPercentage: number;
    }
    candle: {
        minimumDeclingPercentage: number;
    }
    calcBullishDivergence: {
        numberOfMinimumIntervals: number;
        numberOfMaximumIntervals: number;
    }
    order: ConfigOrderConditionOrder;
    doNotOrder: {
        active: boolean;
        btc24HourDeclineIsLowerThen: number;
    }
}

export class ConfigOrderConditionOrder {
    takeProfitPercentage: number;
    takeLossPercentage: number;
    maxUsdtBuyAmount: number;
    maxPercentageOfBalance: number;
}

export class OrderCondition extends ConfigOrderCondition {
    tradingPair: string;
}