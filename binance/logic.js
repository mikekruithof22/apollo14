const calcCurrentOpenOrderAmount = (currentOpenOrders) => {
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

const calcAmountToSpend = (currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance) => {
    const currentAllowedOrderAmount = currentFreeUSDTAmount * (maxPercentageOffBalance / 100);
    const amountToSpend = currentAllowedOrderAmount > maxUsdtBuyAmount
        ? maxUsdtBuyAmount
        : currentAllowedOrderAmount;
    return amountToSpend;
}

const calcOrderAmountAndPrice = (bids, amountToSpend, currentFreeCryptoBalanceAmount = 0) => {
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
    const finanlAmount = ((amountToSpend / price) * 0.995).toFixed(5);

    return {
        price: price,
        amount: finanlAmount
    }
}

const calcProfitPrice = (buyOrderPrice, takeProfitPercentage) => {
    const takeProfitPercentageInPercentage = takeProfitPercentage / 100;
    const takeProfitPrice = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
    return takeProfitPrice.toFixed(5);
}

const calcStopLossPrice = (sellOrderPrice, takeLossPercentage) => {
    const takeLossPercentageInPercentage = takeLossPercentage / 100;
    const takeLossPrice = (1 - takeLossPercentageInPercentage) * sellOrderPrice;
    return takeLossPrice.toFixed(5);
}

const bidsToObject = (bids) => {
    let result = [];
    bids.forEach(element => {
        let obj = {
            price: parseFloat(element[0]),
            amount: parseFloat(element[1]),
        }
        result.push(obj);
        obj = undefined;
    });
    return result;
}

module.exports = {
    calcCurrentOpenOrderAmount,
    calcAmountToSpend,
    calcOrderAmountAndPrice,
    calcProfitPrice,
    calcStopLossPrice,
    bidsToObject
};
