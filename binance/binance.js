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
   */

    /* STEP 1 - start binance
        Per dag een log file maken
    */


    /* STEP 2 - check account balance
        WE GAAN IEDERE KEER VAN 1000 EURO/USDT UIT

        scenario's
            1. GEEN GELD 
                STOPPEN & DIT LOGGEN

            2. EEN DEEL VAN HET GELD
                DEEL HIERVAN HERINVERSTEREN

            3. AL HET GELD
                DEEL HIERVAN INVERSTEREN
    */


    /* STEP 3 - ORDERS, LIEFST OCO 
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
    const orderObject = {
        symbol: `${tradingPair}`,
        quantity: 0.1,
        side: 'BUY',
        type: 'MARKET',
        newClientOrderId: customOrderId,
    }

    return binanceRest
        .testOrder(orderObject)
        .then(response => {
            orderResult = {
                message: 'Order created successfully',
                time: dateHelper.formatLongDate(new Date()),
                symbol: tradingPair,
                side: 'BUY',
                type: 'MARKET',
                newClientOrderId: customOrderId,
                response: response
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
                response: err
            }
            return orderResult;
        });
}

module.exports = {
    generateBinanceRest,
    generateTestOrder
};

