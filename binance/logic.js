
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
    const currentAllowedOrderAmount = (currentFreeUSDTAmount / maxPercentageOffBalance) * 10;
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

const calcProfitPrice = (buyOrderPrice, takeProfitPercentage) => {
    // const percentage = (takeProfitPercentage / 100) + 1;
    // let limitOrderPrice = buyOrderPrice * percentage;
    const takeProfitPercentageInPercentage = takeProfitPercentage / 100;
    const takeProfitPrice = (1 + takeProfitPercentageInPercentage) * buyOrderPrice;
    return takeProfitPrice.toFixed(5);
}

const calcStopLossPrice = (sellOrderPrice, takeProfitPercentage) => {
    // const percentage = 1 - (takeProfitPercentage / 100);
    // let limitOrderPrice = sellOrderPrice * percentage;

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
        obj = {};
    });
    return result;
}

const determineOrderFilled = async (
    binanceRest,
    tradingPair,
    clientOrderId,
    checkOrderStatusMaxRetryCount,
    checkOrderStatusRetryTime,
    orderStatusAfterCreation
) => {

    let orderFilled = orderStatusAfterCreation;
    let retryCount = 0;
    while (orderFilled === false && retryCount < checkOrderStatusMaxRetryCount) {
        // params
        var date = new Date();
        var timestamp = date.getTime();
        // request
        const orderStatus = await binance.checkOrderStatus(binanceRest, tradingPair, clientOrderId, timestamp);
        switch (orderStatus.status) {
            case OrderStatus.PARTIALLY_FILLED:
                // do something?
                orderFilled = OrderStatus.PARTIALLY_FILLED;
                break;
            case OrderStatus.FILLED:
                orderFilled = OrderStatus.FILLED;
                break;
            case OrderStatus.NEW:
            case OrderStatus.CANCELED:
            case OrderStatus.PENDING_CANCEL:
            case OrderStatus.REJECTED:
            case OrderStatus.EXPIRED:
                // do nothing
                break;
            default:
                break;
        }
        retryCount++;
        sleep(checkOrderStatusRetryTime)
    }
    return orderFilled;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const monitorSellAndStopLossOrder = () => {
    /*  
        MAKE SURE THAT:
            A.) In case sellOrder triggers ===> the stopLossLimitOrder is canceled
            b.) In case stopLossLimitOrder triggers ===> the sellOrder is canceled

            TODO: een stream of iets dergelijks opzetten? 
    */
}

module.exports = {
    calcCurrentOpenOrderAmount,
    calcAmountToSpend,
    calcOrderAmountAndPrice,
    calcProfitPrice,
    calcStopLossPrice,
    bidsToObject,
    determineOrderFilled,
    monitorSellAndStopLossOrder
};
