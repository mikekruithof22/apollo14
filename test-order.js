const binanceOrder = require('./binance/order');
const binance = require('./binance/binance');

const config = require('./config.json');
const OrderType = require('./binance/order').OrderType;

async function runTestOrderScript() {
    // STEP 01 - test data
    const tradingPair = "LTCUSDT";
    const quantity = 1;
    const orderPrice = 125;
    const stopPrice = 100;
    const binanceTestRest = binance.generateBinanceRest();

    // const limitSellTestOrder = await binanceOrder.generateTestOrder(binanceTestRest, OrderType.LIMITSELL, tradingPair, quantity, orderPrice);
    // const limitBuyTestOrder = await binanceOrder.generateTestOrder(binanceTestRest, OrderType.LIMITBUY, tradingPair, quantity, orderPrice);
    // const stopLossLimitTestOrder = await binanceOrder.generateTestOrder(binanceTestRest, OrderType.STOPLOSSLIMIT, tradingPair, quantity, orderPrice, stopPrice);
    // const marketByTestOrder = await binanceOrder.generateTestOrder(binanceTestRest, OrderType.MARKETBUY, tradingPair, quantity);
    // const marketSellTestOrder = await binanceOrder.generateTestOrder(binanceTestRest, OrderType.MARKETSELL, tradingPair, quantity);

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
}

runTestOrderScript();