import { AmountAndPrice, BidObject } from "../models/logic";
import { OrderBookRow, SymbolLotSizeFilter, SymbolPriceFilter } from "../../node_modules/binance/lib/index";

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
        bids: BidObject[],
        amountToSpend: number,
        stepSize: number
    ): AmountAndPrice => {
        let amount: number = 0;
        let price: number = 0;
        let tmpAmount: number = 0;

        for (var i = 0; i < bids.length; i++) {
            let breakOutOfLoop: boolean = false;
            for (var j = 0; j <= i; j++) {
                amount = amount + bids[j].amount;
                tmpAmount = amount * bids[i].price;
                if (tmpAmount >= amountToSpend) {
                    price = bids[i].price;
                    breakOutOfLoop = true;
                    break;
                }
            }
            if (breakOutOfLoop) {
                break;
            }
        }
        let finalAmount: number = 0;
        if (stepSize === 1) {
            finalAmount = Math.round(Number((amountToSpend / price) * 0.99));
        } else {
            // TODO: testMike, nagaan of dit echt nodig is. Want je hebt toch altijd 10 dollar als reserve?
            // subtract 0.5% for fees
            finalAmount = Number(((amountToSpend / price) * 0.995).toFixed(stepSize));
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

    public static bidsToObject = (bids: OrderBookRow[]): BidObject[] => {
        let result: BidObject[] = [];
        bids.forEach(element => {
            let obj: BidObject = {
                price: parseFloat(element[0] as string),
                amount: parseFloat(element[1] as string),
            }
            result.push(obj);
            obj = undefined;
        });
        return result;
    }

    public static roundOrderAmount(value: number, decimals: number): number {
        if (decimals === 1) {
            return value = Math.floor(value);
        } else {
            return roundOrderAmountPrivate(value, decimals)
        }
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
