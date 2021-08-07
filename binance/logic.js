
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


module.exports = {
    calcCurrentOpenOrderAmount,
    checkIfNewOrderIsAllowed
};
