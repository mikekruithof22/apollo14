import { ConfigOrderCondition, OrderCondition } from "../models/logic";

export default class OrderConditionsHelper {

    public generateConditions = (
        orderConditions: ConfigOrderCondition[],
        tradingPairs: string[]
    ): OrderCondition[] => {
        let result: OrderCondition[] = [];
        
        orderConditions.forEach(condition => {
            tradingPairs.forEach(pair => {
                let object: OrderCondition = {
                    name: condition.name,
                    tradingPair: pair,
                    interval: condition.interval,
                    rsi: {
                        minimumRisingPercentage: condition.rsi.minimumRisingPercentage,
                        calculationLength: condition.rsi.calculationLength
                    },
                    candle: {
                        minimumDeclingPercentage: condition.candle.minimumDeclingPercentage
                    },
                    calcBullishDivergence: {
                        numberOfMinimumIntervals: condition.calcBullishDivergence.numberOfMinimumIntervals,
                        numberOfMaximumIntervals: condition.calcBullishDivergence.numberOfMaximumIntervals
                    },
                    order: {
                        takeProfitPercentage: condition.order.takeProfitPercentage,
                        takeLossPercentage: condition.order.takeLossPercentage,
                        maxUsdtBuyAmount: condition.order.maxUsdtBuyAmount,
                        maxPercentageOffBalance: condition.order.maxPercentageOffBalance,
                    }
                }
                result.push(object);
            })
        });
        return result;
    }
}

