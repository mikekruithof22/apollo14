const binance = require('./binance/binance');
const config = require('./config.json');
const OrderType = require('./binance/binance').OrderType;

async function runTestOrderScript() {
    // STEP 01 - test data
    const tradingPair = "LTCUSDT";
    const quantity = 1;
    const orderPrice = 125;
    const stopPrice = 100;
    const binanceTestRest = binance.generateBinanceRest();

    // const limitSellTestOrder = await binance.generateTestOrder(binanceTestRest, OrderType.LIMITSELL, tradingPair, quantity, orderPrice);
    // const limitBuyTestOrder = await binance.generateTestOrder(binanceTestRest, OrderType.LIMITBUY, tradingPair, quantity, orderPrice);
    // const stopLossTestOrder = await binance.generateTestOrder(binanceTestRest, OrderType.STOPLOSSLIMIT, tradingPair, quantity, orderPrice, stopPrice);
    // const marketByOrder = await binance.generateTestOrder(binanceTestRest, OrderType.MARKETBUY, tradingPair, quantity);
    // const marketSellOrder = await binance.generateTestOrder(binanceTestRest, OrderType.MARKETSELL, tradingPair, quantity);

    console.log(`--------------- TESTORDER RESULT(S) ---------------`);
    // console.log('limitSellTestOrder');
    // console.log(limitSellTestOrder);
    // console.log('limitBuyTestOrder');
    // console.log(limitBuyTestOrder);
    // console.log('stopLossTestOrder');
    // console.log(stopLossTestOrder);
    // console.log('marketByOrder');
    // console.log(marketByOrder);
    // console.log('marketSellOrder');
    // console.log(marketSellOrder);

    // TODO: testmike, zo verder gaan en kijken of je een OCO order kunt inleggen!


}

runTestOrderScript();