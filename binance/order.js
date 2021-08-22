
const dateHelper = require('../helpers/date');
const txtLogger = require('../helpers/txt-logger');
const LogLevel = require('../helpers/txt-logger').LogLevel;

const createOrder = async (
    binanceRest,
    orderType,
    symbol,
    quantity,
    orderPrice,
    stopPrice = 0
) => {

    let options;

    switch (orderType) {
        case OrderType.LIMITBUY:
            options = generateLimitBuyOrderOptions(symbol, quantity, orderPrice);
            break;
        case OrderType.LIMITSELL:
            options = generateLimitSellOrderOptions(symbol, quantity, orderPrice);
            break;
        case OrderType.STOPLOSSLIMIT:
            options = generateStopLossOrderOptions(symbol, quantity, orderPrice, stopPrice);
            break;
        case OrderType.MARKETBUY:
            options = generateMarketBuyOrderOptions(symbol, quantity);
            break;
        case OrderType.MARKETSELL:
            options = generateMarketSellOrderOptions(symbol, quantity);
            break;
        case OrderType.STOPLOSS:
            options = generateStopLossSellOrderOptions(symbol, quantity, stopPrice);
            break;
        default:
            txtLogger.writeToLogFile(`Method: createOrder() did not receive a proper options object`, LogLevel.ERROR);
            return;
    }

    txtLogger.writeToLogFile(`Try to create a ${orderType} with the following options:  ${JSON.stringify(options)}`, LogLevel.INFO);

    return binanceRest
        .submitNewOrder(options)
        .then(response => {
            return response;
        }).catch(err => {
            txtLogger.writeToLogFile(`createOrder() failed ${JSON.stringify(err)}`, LogLevel.ERROR);
        });

    /*
        Example response:

        {
            "symbol": "BTCUSDT",
            "orderId": 28,
            "orderListId": -1, //Unless OCO, value will be -1
            "clientOrderId": "6gCrw2kRUAF9CvJDGP16IP",
            "transactTime": 1507725176595,
            "price": "0.00000000",
            "origQty": "10.00000000",
            "executedQty": "10.00000000",
            "cummulativeQuoteQty": "10.00000000",
            "status": "FILLED",
            "timeInForce": "GTC",
            "type": "MARKET",
            "side": "SELL"
        }

    */
}

const createOcoOrder = async (
    binanceRest,
    symbol,
    quantity,
    orderPrice,
    stopPrice,
    listClientOrderId = undefined,
    limitClientOrderId = undefined,
    stopClientOrderId = undefined
) => {
    const options = {
        symbol: symbol,
        side: 'SELL',
        quantity: quantity,
        price: orderPrice,
        stopClientOrderId: stopClientOrderId,
        stopPrice: stopPrice,
        stopLimitTimeInForce: 'GTC',
        newOrderRespType: 'RESULT',
        listClientOrderId: listClientOrderId,
        limitClientOrderId: limitClientOrderId
    }

    return binanceRest
        .submitNewOCO(options)
        .then(response => {
            return response;
        }).catch(err => {
            txtLogger.writeToLogFile(`createOrder() failed ${JSON.stringify(err)}`, LogLevel.ERROR);
        });
}

/*  Example response:
{
  "orderListId": 0,
  "contingencyType": "OCO",
  "listStatusType": "EXEC_STARTED",
  "listOrderStatus": "EXECUTING",
  "listClientOrderId": "JYVpp3F0f5CAG15DhtrqLp",
  "transactionTime": 1563417480525,
  "symbol": "LTCBTC",
  "orders": [
    {
      "symbol": "LTCBTC",
      "orderId": 2,
      "clientOrderId": "Kk7sqHb9J6mJWTMDVW7Vos"
    },
    {
      "symbol": "LTCBTC",
      "orderId": 3,
      "clientOrderId": "xTXKaGYd4bluPVp78IVRvl"
    }
  ],
  "orderReports": [
    {
      "symbol": "LTCBTC",
      "orderId": 2,
      "orderListId": 0,
      "clientOrderId": "Kk7sqHb9J6mJWTMDVW7Vos",
      "transactTime": 1563417480525,
      "price": "0.000000",
      "origQty": "0.624363",
      "executedQty": "0.000000",
      "cummulativeQuoteQty": "0.000000",
      "status": "NEW",
      "timeInForce": "GTC",
      "type": "STOP_LOSS",
      "side": "BUY",
      "stopPrice": "0.960664"
    },
    {
      "symbol": "LTCBTC",
      "orderId": 3,
      "orderListId": 0,
      "clientOrderId": "xTXKaGYd4bluPVp78IVRvl",
      "transactTime": 1563417480525,
      "price": "0.036435",
      "origQty": "0.624363",
      "executedQty": "0.000000",
      "cummulativeQuoteQty": "0.000000",
      "status": "NEW",
      "timeInForce": "GTC",
      "type": "LIMIT_MAKER",
      "side": "BUY"
    }
  ]
}

*/


const generateTestOrder = async (
    binanceRest,
    orderType,
    symbol,
    quantity,
    orderPrice,
    stopPrice = 0
) => {
    let orderResult;
    let options;

    switch (orderType) {
        case OrderType.LIMITBUY:
            options = generateLimitBuyOrderOptions(symbol, quantity, orderPrice);
            break;
        case OrderType.LIMITSELL:
            options = generateLimitSellOrderOptions(symbol, quantity, orderPrice);
            break;
        case OrderType.STOPLOSSLIMIT:
            options = generateStopLossOrderOptions(symbol, quantity, orderPrice, stopPrice);
            break;
        case OrderType.MARKETBUY:
            options = generateMarketBuyOrderOptions(symbol, quantity);
            break;
        case OrderType.MARKETSELL:
            options = generateMarketSellOrderOptions(symbol, quantity);
            break;
        case OrderType.STOPLOSS:
            options = generateStopLossSellOrderOptions(symbol, quantity, stopPrice);
            break;
        default:
            txtLogger.writeToLogFile(`Method: createOrder() did not receive a proper options object`, LogLevel.ERROR);
            return;
    }

    return binanceRest
        .testNewOrder(options)
        .then(response => {
            orderResult = {
                message: 'Order created successfully',
                time: dateHelper.formatLongDate(new Date()),
                symbol: symbol,
                orderPrice: orderPrice,
                quantity: quantity,
                orderType: orderType,
                newClientOrderId: options['newClientOrderId'],
                stopPrice: stopPrice ? stopPrice : 'N/A',
                response: JSON.stringify(response)
            }
            return orderResult;
        })
        .catch(err => {
            orderResult = {
                message: 'ERROR: Order creation failed',
                time: dateHelper.formatLongDate(new Date()),
                symbol: symbol,
                orderPrice: orderPrice,
                quantity: quantity,
                orderType: orderType,
                newClientOrderId: options['newClientOrderId'],
                stopPrice: stopPrice ? stopPrice : 'N/A',
                response: JSON.stringify(err)
            }
            return orderResult;
        });
}

const generateLimitBuyOrderOptions = (symbol, quantity, maxPrice) => {
    const options = {
        symbol: symbol,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: quantity,
        price: maxPrice,
        newOrderRespType: 'RESULT'
    }
    return options;
}

const generateLimitSellOrderOptions = (symbol, quantity, orderPrice) => {
    const options = {
        symbol: symbol,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: quantity,
        price: orderPrice,
        newOrderRespType: 'RESULT'

    }
    return options;
}

const generateStopLossOrderOptions = (symbol, quantity, orderPrice, stopPrice) => {
    const options = {
        symbol: symbol,
        side: 'SELL',
        type: 'STOP_LOSS_LIMIT',
        timeInForce: "GTC",
        price: orderPrice,
        stopPrice: stopPrice,
        quantity: quantity,
        newOrderRespType: 'RESULT'
    }
    return options;
}

const generateMarketBuyOrderOptions = (symbol, quantity) => {
    const options = {
        symbol: symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: quantity,
        newOrderRespType: 'RESULT'

    }
    return options;
}

const generateMarketSellOrderOptions = (symbol, quantity) => {
    const options = {
        symbol: symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: quantity,
        newOrderRespType: 'RESULT'
    }
    return options;
}

const generateStopLossSellOrderOptions = (symbol, quantity, stopPrice) => {
    const options = {
        symbol: symbol,
        side: 'SELL',
        type: 'STOP_LOSS',
        quantity: quantity,
        stopPrice: stopPrice,
        newOrderRespType: 'RESULT'
    }
    return options;
}
// ERROR:   response: '{"code":-1013,"msg":"Stop loss orders are not supported for this symbol."}'
// TODO: dit werkend krijgen of is dit een package bug?


const OrderType = {
    LIMITSELL: 'Limit sell',
    LIMITBUY: 'Limit buy',
    STOPLOSSLIMIT: 'Stoploss limit',
    MARKETBUY: 'Market buy',
    MARKETSELL: 'Market sell',
    STOPLOSS: 'Stop loss',
    OCO: 'OCO'
}

const OrderStatus = {
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED',
    FILLED: 'FILLED',
    NEW: 'NEW',
    PENDING_CANCEL: 'PENDING_CANCEL',
    PARTIALLY_FILLED: 'PARTIALLY_FILLED',
    REJECTED: 'REJECTED'
}

module.exports = {
    generateTestOrder,
    createOrder,
    generateLimitBuyOrderOptions,
    generateLimitSellOrderOptions,
    generateStopLossOrderOptions,
    createOcoOrder,
    OrderType,
    OrderStatus
};
