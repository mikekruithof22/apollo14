import { OrderBookRow } from "../../node_modules/binance/lib/index";

export default class Logic {

    public static calcCurrentOpenOrderAmount = (currentOpenOrders) => {
        let openAmount = 0;
        let totalOpenAmountValue = 0;

        if (currentOpenOrders.length >= 1) {
            let usdtValue = 0;
            currentOpenOrders.forEach(order => {
                openAmount = openAmount + (order.origQty - order.executedQty);
                usdtValue = usdtValue + order.price; // TODO: is dit juist...
            });
            totalOpenAmountValue = totalOpenAmountValue * usdtValue;
        }

        return totalOpenAmountValue;
    }

    public static calcAmountToSpend = (currentFreeUSDTAmount: number, maxUsdtBuyAmount: number, maxPercentageOffBalance: number) => {
        const currentAllowedOrderAmount = currentFreeUSDTAmount * (maxPercentageOffBalance / 100);
        const amountToSpend = currentAllowedOrderAmount > maxUsdtBuyAmount
            ? maxUsdtBuyAmount
            : currentAllowedOrderAmount;
        return amountToSpend;
    }

    public static calcOrderAmountAndPrice = (bids, amountToSpend: number, currentFreeCryptoBalanceAmount: number = 0) => {
        let amount = 0 + currentFreeCryptoBalanceAmount;
        let price = 0;
        let tmpAmount = 0;

        for (var i = 0; i < bids.length; i++) {
            let breakOutOfLoop = false;
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
        const finalAmount = Number(((amountToSpend / price) * 0.995).toFixed(5));

        return {
            price: price,
            amount: finalAmount
        }
    }

    public static calcProfitPrice = (buyOrderPrice: number, takeProfitPercentage: number) => {
        const takeProfitPercentageInPercentage = takeProfitPercentage / 100;
        const takeProfitPrice = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
        return Number(takeProfitPrice.toFixed(5));
    }

    public static calcStopLossPrice = (sellOrderPrice: number, takeLossPercentage: number) => {
        const takeLossPercentageInPercentage = takeLossPercentage / 100;
        const takeLossPrice = (1 - takeLossPercentageInPercentage) * sellOrderPrice;
        return Number(takeLossPrice.toFixed(5));
    }

    public static bidsToObject = (bids: OrderBookRow[]) => {
        let result : bidObject[] = [];
        bids.forEach(element => {
            let obj = {
                price: parseFloat(element[0] as string),
                amount: parseFloat(element[1] as string),
            }
            result.push(obj);
            obj = undefined;
        });
        return result;
    }
}

export class bidObject{
    price: Number;
    amount: Number;
}
// module.exports = {
//     calcCurrentOpenOrderAmount,
//     calcAmountToSpend,
//     calcOrderAmountAndPrice,
//     calcProfitPrice,
//     calcStopLossPrice,
//     bidsToObject
// };
