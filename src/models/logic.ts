// todo aram rename class to orderModels or something more logical
export class AmountAndPrice {
    price: number;
    amount: number;
    totalUsdtAmount: number;
}


export class ConfigOrderCondition { // todo aram pretty sure in my new config model situation, this can be taken from the OrderStrategy model
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
        btc24HourChange: {
            active: boolean;
            percentage: number;
        },
        coin24HourChange: {
            active: boolean;
            percentage: number;
        }
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