import { AmountAndPrice, BidObject } from "../models/logic";
import { OrderBookRow, SymbolLotSizeFilter } from "../../node_modules/binance/lib/index";

export default class Logic {

    public static calcAmountToSpend = (
        currentFreeUSDTAmount: number,
        maxUsdtBuyAmount: number,
        maxPercentageOffBalance: number
    ): number => {
        const currentAllowedOrderAmount: number = currentFreeUSDTAmount * (maxPercentageOffBalance / 100);
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
        // subtract 0.5% for fees
        const finalAmount: number = Number(((amountToSpend / price) * 0.995).toFixed(stepSize));

        return {
            price: price,
            amount: finalAmount,
            totalUsdtAmount: price * finalAmount
        }
    }

    public static determineStepSize = (lotSize: SymbolLotSizeFilter) => {
        // Lotsize.stepSize: '0.01000000' ==> means two behind the comma. Therefore: 2.
        let stepSize: number = parseFloat(lotSize.stepSize as string);
        return stepSize = stepSize.toString().split(".")[1].length || 2;
    }

    public static calcProfitPrice = (buyOrderPrice: number, takeProfitPercentage: number, stepSize: number): number => {
        const takeProfitPercentageInPercentage: number = takeProfitPercentage / 100;
        const takeProfitPrice: number = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
        return Number(takeProfitPrice.toFixed(stepSize));
    }

    public static calcStopLossPrice = (sellOrderPrice: number, takeLossPercentage: number, stepSize: number): number => {
        const takeLossPercentageInPercentage = takeLossPercentage / 100;
        const takeLossPrice = (1 - takeLossPercentageInPercentage) * sellOrderPrice;
        return Number(takeLossPrice.toFixed(stepSize));
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
}
