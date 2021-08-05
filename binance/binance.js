const dateHelper = require('../helpers/date');
const api = require('binance');
const config = require('../config.json');
require('dotenv').config();

/*
    Documentation urls
        A.) NPM 
            https://www.npmjs.com/package/binance
        
        B.) GitHub
            https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
        
        C.) Binance V3 (zelfde als GitHub, alleen dan slechter?)
            https://binance-docs.github.io/apidocs/spot/en/#change-log
*/

 /* TODO: hier wat order inleg gedachten. 
    STEP 0 - 
       Interval bepalen wanneer het programma draait, althans het gedeelte wat windows task schedular dat moet doen
           ==> De laagste orderConditions.interval gaat het worden....
           ==> dit moet een mens door door naar de config te kijken. 
   
    STEP 1 - start binance
        Per dag een log file maken

    STEP 2 - check account balance
        WE GAAN IEDERE KEER VAN 1000 EURO/USDT UIT

        scenario's
            1. GEEN GELD 
                STOPPEN & DIT LOGGEN

            2. EEN DEEL VAN HET GELD
                DEEL HIERVAN HERINVERSTEREN

            3. AL HET GELD
                DEEL HIERVAN INVERSTEREN

     STEP 3 - ORDERS, LIEFST OCO 
        (dat kan volgens de documentatie inleggen)

    */



const generateBinanceRest = () => {
    const binanceRest = new api.BinanceRest({
        key: process.env.API_KEY, // Get this from your account on binance.com
        secret: process.env.API_SECRET, // Same for this
        timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
        recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
        disableBeautification: false,
        /*
         * Optional, default is false. Binance's API returns objects with lots of one letter keys.  By
         * default those keys will be replaced with more descriptive, longer ones.
         */
        handleDrift: false,
        /*
         * Optional, default is false.  If turned on, the library will attempt to handle any drift of
         * your clock on it's own.  If a request fails due to drift, it'll attempt a fix by requesting
         * binance's server time, calculating the difference with your own clock, and then reattempting
         * the request.
         */
        baseUrl: 'https://api.binance.com/',
        /*
         * Optional, default is 'https://api.binance.com/'. Can be useful in case default url stops working.
         * In february 2018, Binance had a major outage and when service started to be up again, only
         * https://us.binance.com was working.
         */
        requestOptions: {}
        /*
         * Options as supported by the 'request' library
         * For a list of available options, see:
         * https://github.com/request/request
         */
    });
    return binanceRest;
}

const generateTestOrder = async (binanceRest, tradingPair) => {
    let orderResult;

    const customOrderId = binanceRest.generateNewOrderId();
    const options = {
        symbol: `${tradingPair}`,
        quantity: 0.1,
        side: 'BUY',
        type: 'MARKET',
        newClientOrderId: customOrderId,
    }

    return binanceRest
        .testOrder(options)
        .then(response => {
            orderResult = {
                message: 'Order created successfully',
                time: dateHelper.formatLongDate(new Date()),
                symbol: tradingPair,
                side: 'BUY',
                type: 'MARKET',
                newClientOrderId: customOrderId,
                response: JSON.stringify(response)
            }
            return orderResult;
        })
        .catch(err => {
            orderResult = {
                message: 'Order creation failed',
                time: dateHelper.formatLongDate(new Date()),
                symbol: tradingPair,
                side: 'BUY',
                type: 'MARKET',
                newClientOrderId: customOrderId,
                response: JSON.stringify(err)
            }
            return orderResult;
        });
}

const retrieveOrderBook = (binanceRest, symbol, limit) => {
    const options = {
        symbol: symbol,
        limit: limit
    }
    return binanceRest
        .depth(options)
        .then(response => {
            return response;
        }).catch(err => {
            console.log(err);
        });
    /*  Example response::
        {
            "lastUpdateId": 1027024,
            "bids": [
                [
                "4.00000000",     // PRICE
                "431.00000000"    // QTY
                ]
            ],
            "asks": [
                [
                "4.00000200",
                "12.00000000"
                ]
            ]
        }
    */
}

const retrieveAllOpenOrders = (binanceRest, symbol) => {
    const options = {
        symbol: symbol
    }
    return binanceRest
        .openOrders(options)
        .then(response => {
            return response;
        }).catch(err => {
            console.log(err);
        });
     /*
   Example response:
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
*/
}

const checkOrderStatus = (binanceRest, symbol, orderId, timestamp) => {
    const options = {
        symbol: symbol,
        orderId: orderId,
        timestamp: timestamp
    }
    return binanceRest
        .queryOrder(options)
        .then(response => {
            return response;
        }).catch(err => {
            console.log(err);
        });
    /*  Example response::
        {
            "symbol": "LTCBTC",
            "orderId": 1,
            "orderListId": -1 //Unless part of an OCO, the value will always be -1.
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
    */
}

const cancelOrder = (binanceRest, symbol, orderId, timestamp) => {
    const options = {
        symbol: symbol,
        orderId: orderId,
        timestamp: timestamp
    }
    return binanceRest
        .cancelOrder(options)
        .then(response => {
            return response;
        }).catch(err => {
            console.log(err);
        });

    /*
    Example response:
        {
            "symbol": "LTCBTC",
            "origClientOrderId": "myOrder1",
            "orderId": 4,
            "orderListId": -1, //Unless part of an OCO, the value will always be -1.
            "clientOrderId": "cancelMyOrder1",
            "price": "2.00000000",
            "origQty": "1.00000000",
            "executedQty": "0.00000000",
            "cummulativeQuoteQty": "0.00000000",
            "status": "CANCELED",
            "timeInForce": "GTC",
            "type": "LIMIT",
            "side": "BUY"
        }
    */
}

const createOrder = (binanceRest, symbol, orderId, timestamp) => {
    /*
        TODO: hier nieuwe orders aanmaken!
            1. pak eerst de juiste options..., zie onderstaande hieronder
    */


    return binanceRest
        .newOrder()

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

const generateLimitBuyOrderOptions = (symbol, quantity, maxPrice) => {
    const options = {
        symbol: symbol,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'DAY',
        quantity: quantity,
        price: maxPrice, // TODO: uitzoeken of dit hetzelfde is!
        newOrderRespType: 'RESULT'
    }
    return options;
    // TODO: laten verwijzen naar een generieke order functie?
    // dus per order soort een specifieke functie en deze laten uitvoeren door een generieke functie?

}

const generateLimitSellOrderOptions  = (symbol, quantity, minPrice) => {
    const options = {
        symbol: symbol,
        side: 'SEL',
        type: 'LIMIT',
        timeInForce: 'DAY',
        quantity: quantity,
        price: minPrice, // TODO: uitzoeken of dit hetzelfde is!
        newOrderRespType: 'RESULT'

    }
    return options;
}

const generateStopLossOrderOptions = (symbol, quantity, minPrice, stopPrice) => {
    const options = {
        symbol: symbol,
        side: 'SEL',
        type: 'STOP_LOSS',
        timeInForce: 'DAY',
        quantity: quantity,
        price: minPrice, 
        stopPrice: stopPrice,
        newOrderRespType: 'RESULT'

    }
    return options;
} 

module.exports = {
    generateBinanceRest,
    generateTestOrder,
    retrieveOrderBook,
    retrieveAllOpenOrders,
    checkOrderStatus,
    cancelOrder,
    createOrder,
    generateLimitBuyOrderOptions,
    generateLimitSellOrderOptions,
    generateStopLossOrderOptions,
};

