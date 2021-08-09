const binanceOrder = require('./binance/order');
const binance = require('./binance/binance');
const exchangeLogic = require('./binance/logic');
const LogLevel = require('./helpers/txt-logger').LogLevel;
const txtLogger = require('./helpers/txt-logger');



const config = require('./config.json');
const OrderType = require('./binance/order').OrderType;

async function runTestOrderScript() {
    const binanceRest = binance.generateBinanceRest();
    if (1 + 1 === 3) { // only execute when you want to test if orders can be placed correctly
        await testOrderTypes(binanceRest);
        return;
    }

    // proxy waardes voor echte config waardes   
    const tradingPair = "LTCUSDT";
    const takeProfitPercentage = config.orderConditions[0].order.takeProfitPercentage;
    const takeLossPercentage = config.orderConditions[0].order.takeLossPercentage;


    const currentCryptoTradingPair = tradingPair.replace('USDT', '');
    const cancelOrderWhenUSDTValueIsBelow = config.production.cancelOrderWhenUSDTValueIsBelow;
    const minimumUSDTorderAmount = config.production.minimumUSDTorderAmount;

    let currentFreeUSDTAmount = 1000;  // testmike testdata

    const maxUsdtBuyAmount = 1000;
    const maxPercentageOffBalance = 33;

    // Step 1.1 - Determine free USDT amount AND handle current open orders. 
    const balance = await binance.getAccountBalances(binanceRest);
    const currentUSDTBalance = parseFloat(balance.find(b => b.asset === 'USDT'));
    // currentFreeUSDTAmount = currentUSDTBalance.free;  ==> gecomment ivm testen!
    txtLogger.writeToLogFile(`Current free USDT trade amount is equal to: ${currentFreeUSDTAmount}`);

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
        ];

    txtLogger.writeToLogFile(`Current open orders lengt is equal to: ${currentOpenOrders.length}`);
    txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);

    // STEP 1 - Check balance and cancel orders if necessary   	
    // Step 1.2 - Check if your balance meets the minimal
    txtLogger.writeToLogFile(`STEP 1 - Check balance and cancel orders if necessary`);

    if (currentFreeUSDTAmount <= minimumUSDTorderAmount) {
        txtLogger.writeToLogFile(`Current balance is to low. Program will close. Minimum balance: ${currentFreeUSDTAmount}. Current balance: ${currentFreeUSDTAmount}`);
        return;
    }
    // Step 1.3 - Cancel under certain conditions open orders
            // TODO: testmike, dit voorlopig overgeslagen. Kom hier later op terug
            // In case the current open order amount is tiny - less than 10 USDT cancel the order. 
            // if(currentOpenOrders.length >= 1) {
            //     currentOpenOrders.forEach(order => {
            //         if (cancelOrderWhenUSDTValueIsBelow)

            //     });
            // }
            // Cancel all open orders for the traiding pair you want to execute a trade for

    // STEP 2 - Prepare for new order
    txtLogger.writeToLogFile(`STEP 2 - Prepare for new order`);
    // STEP 2.1 - Get orderbook and amount which you are allowed to spend. Also determine price and amount of the comming order
    const amountToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
    txtLogger.writeToLogFile(`The following USDT amount is allowed to be spend on an order: ${amountToSpend}`);

    const currentOrderBook = await binance.getOrderBook(binanceRest, tradingPair);
    const currentOrderBookBids = exchangeLogic.bidsToObject(currentOrderBook.bids);

    // TODO: kun je alleen doen indien je orders heb gecancelled eerder!
    // Check how much left over crypto you have on your balance and add it to your next order
    // let currentFreeCryptoBalanceAmount = balance.find(b => b.asset === currentCryptoTradingPair).free;
    // currentFreeCryptoBalanceAmount = parseFloat(currentFreeCryptoBalanceAmount);

    const orderPriceAndAmount = exchangeLogic.calcOrderAmountAndPrice(currentOrderBookBids, amountToSpend);

    const orderPrice = orderPriceAndAmount.price;
    const orderAmount = orderPriceAndAmount.amount;
    txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately. Price: ${orderPrice}. Amount: ${orderAmount}`);

    // STEP 3 - Create buy order (and wait until it has been filled for several seconds?)
    txtLogger.writeToLogFile(`STEP 3 - Create buy order`);
    // const buyOrder = await binanceOrder.createOrder(binanceRest, OrderType.LIMITBUY, tradingPair, orderAmount, orderPrice);
    const buyOrder =  {
        "symbol": "BTCUSDT",
        "orderId": 28,
        "orderListId": -1, //Unless OCO, value will be -1
        "clientOrderId": "6gCrw2kRUAF9CvJDGP16IP",
        "transactTime": 1507725176595,
        "price": "125.00000000",
        "origQty": "10.00000000",
        "executedQty": "10.00000000",
        "cummulativeQuoteQty": "10.00000000",
        "status": "FILLED",
        "timeInForce": "GTC",
        "type": "MARKET",
        "side": "SELL"
    }

    /*  TESTMIKE HIERO VERDER GAAN!
        TODO: alles is klaar, nu alleen nog maar de order inleggen. 

        wat gebeurt er:
            A. Order direct wordt gevuld...

            B. Order deels wordt gevuld... 

            C. Order niet wordt gevuld...
    */

    // STEP 4 - Create stoploss and sell order 
    // orderAmount moet huidige free balance zijn  
    if (buyOrder.price === undefined) {
        txtLogger.writeToLogFile(`Program closed because 'buyOrder.price' is undefined`);
        return;
    }     
    const profitPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeProfitPercentage);
    const stopLossPrice = exchangeLogic.calcProfitPrice(parseFloat(buyOrder.price), takeLossPercentage);
 

    const sellOrder = await binanceOrder.createOrder(binanceRest, OrderType.LIMITSELL, tradingPair, orderAmount, orderPrice);
    const stopLossLimitOrder = await binanceOrder.createOrder(binanceRest, OrderType.STOPLOSSLIMIT, tradingPair, orderAmount, orderPrice);





    console.log(`--------------- ACOUNT AND BALANCE STUFF ---------------`);

    console.log('buyOrder');
    console.log(buyOrder);
    console.log('sellOrder');
    console.log(sellOrder);
    console.log('stopLossLimitOrder');
    console.log(stopLossLimitOrder);
    // console.log('currentOrderBook');
    // console.log(currentOrderBook);
    // console.log('currentOrderBookBids');
    // console.log(currentOrderBookBids);
    // console.log('orderAndAmount.price');
    // console.log(orderAndAmount.price);
    // console.log('orderAndAmount.amount');
    // console.log(orderAndAmount.amount);


}
 
async function testOrderTypes(binanceRest) {
    // test orders variables
    const quantity = 1;
    const orderPrice = 125;
    const stopPrice = 100;
    const tradingPair = "LTCUSDT";


    // const limitSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITSELL, tradingPair, quantity, orderPrice);
    // const limitBuyTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITBUY, tradingPair, quantity, orderPrice);
    // const stopLossLimitTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.STOPLOSSLIMIT, tradingPair, quantity, orderPrice, stopPrice);
    // const marketByTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETBUY, tradingPair, quantity);
    // const marketSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETSELL, tradingPair, quantity);
    // const stopLossTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.STOPLOSS, tradingPair, quantity, undefined, stopPrice);
    console.log(`--------------- TESTORDER RESULT(S) ---------------`);
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
    // console.log('stopLossTestOrder');
    // console.log(stopLossTestOrder);
}


runTestOrderScript();