const binanceOrder = require('./binance/order');
const binance = require('./binance/binance');
const config = require('./config.json');
const OrderType = require('./binance/order').OrderType;

async function generateTestOrders() {
    const binanceRest = binance.generateBinanceRest();

    // test orders variables
    const quantity = 1;
    const orderPrice = 125;
    const stopPrice = 100;
    const tradingPair = 'LTCUSDT';

    const limitSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITSELL, tradingPair, quantity, orderPrice);
    const limitBuyTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.LIMITBUY, tradingPair, quantity, orderPrice);
    const stopLossLimitTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.STOPLOSSLIMIT, tradingPair, quantity, orderPrice, stopPrice);
    const marketByTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETBUY, tradingPair, quantity);
    const marketSellTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.MARKETSELL, tradingPair, quantity);
    const stopLossTestOrder = await binanceOrder.generateTestOrder(binanceRest, OrderType.STOPLOSS, tradingPair, quantity, undefined, stopPrice);
    console.log(`--------------- TESTORDER RESULT(S) ---------------`);
    console.log('limitSellTestOrder');
    console.log(limitSellTestOrder);
    console.log('limitBuyTestOrder');
    console.log(limitBuyTestOrder);
    console.log('stopLossLimitTestOrder');
    console.log(stopLossLimitTestOrder);
    console.log('marketByTestOrder');
    console.log(marketByTestOrder);
    console.log('marketSellTestOrder');
    console.log(marketSellTestOrder);
    console.log('stopLossTestOrder');
    console.log(stopLossTestOrder);
}

generateTestOrders();