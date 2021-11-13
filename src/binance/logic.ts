import { OrderBookRow, SymbolLotSizeFilter, SymbolPriceFilter } from "binance";

import { AmountAndPrice } from "../models/logic";

export default class Logic {

    public static calcAmountToSpend = (
        currentFreeUSDTAmount: number,
        maxUsdtBuyAmount: number,
        maxPercentageOfBalance: number
    ): number => {
        const currentAllowedOrderAmount: number = currentFreeUSDTAmount * (maxPercentageOfBalance / 100);
        const amountToSpend: number = currentAllowedOrderAmount > maxUsdtBuyAmount
            ? maxUsdtBuyAmount
            : currentAllowedOrderAmount;
        return amountToSpend;
    }

    public static calcOrderAmountAndPrice = (
        orderBookRows: OrderBookRow[],
        amountToSpend: number,
        stepSize: number
    ): AmountAndPrice => {
        let amount: number = 0;
        let price: number = 0;

        for (var i = 0; i < orderBookRows.length; i++) {
            let askPrice: number = parseFloat(orderBookRows[i][0] as string);
            let askAmount: number = parseFloat(orderBookRows[i][1] as string);
            amount = amount + askAmount;
            let cost = amount * askPrice;
            if (cost >= amountToSpend) {
                price = askPrice;
                break;
            }
        }

        let finalAmount = amountToSpend / price;
        finalAmount = Logic.roundDown(finalAmount, stepSize);
        if (stepSize === 1) { 
            // Because stepsize is 1, you need to round down. For example: 24.86453 will become
            // 24. If we don't do this Binane will reject. ==> Some crypto remainder will be left.
            finalAmount = Math.floor(finalAmount);
        }

        return {
            price: price,
            amount: finalAmount,
            totalUsdtAmount: price * finalAmount
        }
    }

    public static determineStepSize = (lotSize: SymbolLotSizeFilter): number => {
        // Lotsize.stepSize: '0.01000000' ==> means two behind the comma. Therefore stepSize will be: 2.
        let stepSize: string = lotSize.stepSize as string;
        const stepSizeNumber: number = parseFloat(stepSize);
        stepSize = stepSizeNumber.toString(); // removes the extra zero's behind the first number
        if (stepSize.startsWith('0.')) {
            return stepSize.split(".")[1].length || 2;
        } else {
            // Which means, it start with something like: '1.0'.
            return parseFloat(stepSize);
        }
    }

    public static determineMinQty = (lotSize: SymbolLotSizeFilter): number => {
        const minQty: string = lotSize.minQty as string;
        return parseFloat(minQty);
    }

    public static determineTickSize = (priceFilter: SymbolPriceFilter): number => {
        let tickSize: string = priceFilter.tickSize as string;
        const tickSizeNumber: number = parseFloat(tickSize);
        tickSize = tickSizeNumber.toString(); // removes the extra zero's behind the first number
        if (tickSize.startsWith('0.')) {
            return tickSize.split(".")[1].length || 2;
        } else {
            // Which means, it start with something like: '1.0'.
            return parseFloat(tickSize);
        }
    }

    public static calcProfitPrice = (buyOrderPrice: number, takeProfitPercentage: number, tickSize: number): number => {
        const takeProfitPercentageInPercentage: number = takeProfitPercentage / 100;
        let takeProfitPrice: number = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
        return Number(takeProfitPrice.toFixed(tickSize));
    }

    public static calcStopLossPrice = (sellOrderPrice: number, takeLossPercentage: number, tickSize: number): number => {
        const takeLossPercentageInPercentage = takeLossPercentage / 100;
        const takeLossPrice = (1 - takeLossPercentageInPercentage) * sellOrderPrice;
        return Number(takeLossPrice.toFixed(tickSize));
    }

    public static callStopLimitPrice = (stopLossPrice: number, tickSize: number): number => {
        return Number((stopLossPrice * 0.99).toFixed(tickSize));
    }

    public static roundOrderAmount(value: number, decimals: number): number {
        if (decimals === 1) {
            return value = Math.floor(value);
        } else {
            return roundOrderAmountPrivate(value, decimals)
        }
    }

    private static roundDown(value: number, decimals: number) {
        decimals = decimals || 0;
        return (Math.floor(value * Math.pow(10, decimals)) / Math.pow(10, decimals));
    }
}

function roundOrderAmountPrivate(value: number, decimals: number): number {
    const parts = value.toString().split('.')

    if (parts.length === 2) {
        return Number([parts[0], parts[1].slice(0, decimals)].join('.'))
    } else {
        return Number(parts[0]);
    }
}
