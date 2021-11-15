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

        return {
            price: price,
            amount: finalAmount,
            totalUsdtAmount: price * finalAmount
        }
    }

    public static roundDown(amount: number, decimals: number): number {
        decimals = decimals || 0;
        return (Math.floor(amount * Math.pow(10, decimals)) / Math.pow(10, decimals));
    }

    public static round(amount: number, decimals: number): number {
        decimals = decimals || 0;
        return (Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals));
    }

    public static getdecimals = (size: string): number => {
        // size: '1.0000000' ==> means zero decimals. Therefore decimals will be: 0.        
        // size: '0.1000000' ==> means one decimal. Therefore decimals will be: 1.
        // size: '0.01000000' ==> means two decimals. Therefore decimals will be: 2.
        return Math.max(size.indexOf('1') - 1, 0);
    }

    public static calcProfitPrice = (buyOrderPrice: number, takeProfitPercentage: number, tickSize: number): number => {
        const takeProfitPercentageInPercentage: number = takeProfitPercentage / 100;
        let takeProfitPrice: number = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
        return Logic.round(takeProfitPrice, tickSize);
    }

    public static calcStopLossPrice = (sellOrderPrice: number, takeLossPercentage: number, tickSize: number): number => {
        const takeLossPercentageInPercentage = takeLossPercentage / 100;
        const takeLossPrice = (1 - takeLossPercentageInPercentage) * sellOrderPrice;
        return Logic.round(takeLossPrice, tickSize);
    }

    public static calcStopLimitPrice = (stopLossPrice: number, tickSize: number): number => {
        return Logic.round(stopLossPrice * 0.99, tickSize);
        //TODO: is the 0.99 necessary? Please explain why? must be different from stoploss?
    }

    public static determineMinQty = (lotSize: SymbolLotSizeFilter): number => {
        const minQty: string = lotSize.minQty as string;
        return parseFloat(minQty);
    }
}

