const binanceOrder = require('./binance/order');
const binance = require('./binance/binance');
const exchangeLogic = require('./binance/logic');


const config = require('./config.json');
const OrderType = require('./binance/order').OrderType;

async function runTestOrderScript() {
    // generic vairiables
    const binanceRest = binance.generateBinanceRest();
    const tradingPair = "LTCUSDT";
    let currentFreeUSDTAmount = 1000;

    const maxUsdtBuyAmount = 1000;
    const maxPercentageOffBalance = 33;


    
    // test orders variables
    const quantity = 1;
    const orderPrice = 125;
    const stopPrice = 100;

    // const limitSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITSELL, tradingPair, quantity, orderPrice);
    // const limitBuyTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITBUY, tradingPair, quantity, orderPrice);
    // const stopLossLimitTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.STOPLOSSLIMIT, tradingPair, quantity, orderPrice, stopPrice);
    // const marketByTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETBUY, tradingPair, quantity);
    // const marketSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETSELL, tradingPair, quantity);

    // console.log(`--------------- TESTORDER RESULT(S) ---------------`);
    // console.log('limitSellTestOrder');
    // console.log(limitSellTestOrder);
    // console.log('limitBuyTestOrder');
    // console.log(limitBuyTestOrder);
    // console.log('stopLossLimitTestOrder');
    // console.log(stopLossLimitTestOrder);
    // console.log('marketByTestOrder');
    // console.log(marketByTestOrder);
    // console.log('marketSellTestOrder');
    // console.log(marketSellTestOrder);

    
    const currentOpenOrders = // await binance.retrieveAllOpenOrders(binanceRest, tradingPair);
    [
        {
            "symbol": "LTCBTC",
            "orderId": 1,
            "orderListId": -1, //Unless OCO, the value will always be -1
            "clientOrderId": "myOrder1",
            "price": "0.1",
            "origQty": "1.0",
            "executedQty": "0.0",
            "cummulativeQuoteQty": "0.0",
            "status": "NEW",
            "timeInForce": "GTC",
            "type": "LIMIT",
            "side": "BUY",
            "stopPrice": "0.0",
            "icebergQty": "0.0",
            "time": 1499827319559,
            "updateTime": 1499827319559,
            "isWorking": true,
            "origQuoteOrderQty": "0.000000"
        }
    ]



    const totalOpenAmountValue = exchangeLogic.calcCurrentOpenOrderAmount(currentOpenOrders);
    const amountToSpend =  exchangeLogic.checkIfNewOrderIsAllowed(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
    const currentOrderBook = await binance.getOrderBook(binanceRest, tradingPair);
    const currentOrderBookBids = exchangeLogic.bidsToObject(currentOrderBook.bids);
    const orderAndAmount = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountToSpend);


    console.log(`--------------- ACOUNT AND BALANCE STUFF ---------------`);

    console.log('currentOpenOrders');
    console.log(currentOpenOrders);
    console.log('totalOpenAmountValue');
    console.log(totalOpenAmountValue);
    console.log('amountToSpend');
    console.log(amountToSpend);
    // console.log('currentOrderBook');
    // console.log(currentOrderBook);
    // console.log('currentOrderBookBids');
    // console.log(currentOrderBookBids);
    console.log('orderAndAmount.price');
    console.log(orderAndAmount.price);
    console.log('orderAndAmount.amount');
    console.log(orderAndAmount.amount);

    
}

runTestOrderScript();