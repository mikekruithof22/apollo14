
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

const checkIfNewOrderIsAllowed = (currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance) => {
    const currentAllowedOrderAmount = (currentFreeUSDTAmount / maxPercentageOffBalance) * 10;
    const amountToSpend = currentAllowedOrderAmount > maxUsdtBuyAmount
        ? maxUsdtBuyAmount
        : currentAllowedOrderAmount;

    return amountToSpend;
}

const calcOrderAmountAndPrice = (bids, amountToSpend) => {
    let price = 0;
    let amount = 0;
    let tmpAmount = 0;

    for (var i = 0; i < bids.length; i++) {
        let breakOutOfFirstLoop = false;
        for (var j = 0; j <= i; j++) {
            amount = amount + bids[j].amount;
            tmpAmount = amount * bids[i].price;
            if (tmpAmount >= amountToSpend) {
                price = bids[i].price;
                breakOutOfLoop = true;
                break;
            }
        }
        if (breakOutOfFirstLoop) {
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

const bidsToObject = (bids) => {
    let result = [];
    bids.forEach(element => {
        let obj = {
            price: parseFloat(element[0]),
            amount: parseFloat(element[1]),
        }
        result.push(obj);
        obj = {};
    });
    return result;
}


module.exports = {
    calcCurrentOpenOrderAmount,
    checkIfNewOrderIsAllowed,
    calcOrderAmountAndPrice,
    bidsToObject
};
