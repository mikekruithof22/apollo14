require('dotenv').config();

import { BasicSymbolParam, CancelOrderParams, ExchangeInfo, ExchangeInfoParams, OrderBookParams } from '../../node_modules/binance/lib/index';

import { LogLevel } from '../models/log-level';
import { MainClient } from '../../node_modules/binance/lib/main-client';
import txtLogger from '../helpers/txt-logger';

/*
    Documentation urls
        A.) NPM 
            https://www.npmjs.com/package/binance
        
        B.) GitHub
            https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
        
        C.) Binance V3 (zelfde als GitHub, alleen dan slechter?)
            https://binance-docs.github.io/apidocs/spot/en/#change-log
*/

export default class BinanceService {

    public generateBinanceRest = (): MainClient => {
        const binanceRest = new MainClient({
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
        });
        return binanceRest;
    }

    public getAccountBalances = async (binanceRest: MainClient): Promise<any> => {
        const options = {
            timestamp: new Date().getTime()
        }
        return binanceRest
            .getBalances()
            .then(response => {
                // console.log('----- response ----------');
                // console.log(response)
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(`getAccountBalances() ${JSON.stringify(err)}`, LogLevel.ERROR);
            });
        /*
            Example response:
           [{
                coin: 'WABI',
                depositAllEnable: true,
                withdrawAllEnable: true,
                name: 'TAEL',
                free: '0',
                locked: '0',
                freeze: '0',
                withdrawing: '0',
                ipoing: '0',
                ipoable: '0',
                storage: '0',
                isLegalMoney: false,
                trading: true,
                networkList: [ [Object] ]
            },
            etc.
            ]
        */
    }

    public getOrderBook = async (binanceRest: MainClient, symbol: string): Promise<any> => {
        const options: OrderBookParams = {
            symbol: symbol
        }
        return binanceRest
            .getOrderBook(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(` getOrderBook() ${JSON.stringify(err)}`, LogLevel.ERROR);
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

    public retrieveAllOpenOrders = async (binanceRest: MainClient, symbol: string): Promise<any> => {
        const options: Partial<BasicSymbolParam> = {
            symbol: symbol
        }
        return binanceRest
            .getOpenOrders(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(` retrieveAllOpenOrders() ${JSON.stringify(err)}`, LogLevel.ERROR);
            });
        /*
      Example response:
    
      // IF FILLED, otherwise an emtpy array: []!
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

    // public checkOrderStatus = async (binanceRest: MainClient, symbol: string, orderId: string, timestamp) => {
    //     const options = {
    //         symbol: symbol,
    //         orderId: orderId,
    //         timestamp: timestamp
    //     }
    //     return binanceRest
    //         .queryOrder(options)
    //         .then(response => {
    //             return response;
    //         }).catch(err => {
    //             txtLogger.writeToLogFile(` checkOrderStatus() ${JSON.stringify(err)}`, LogLevel.ERROR);
    //         });
    //     /*  Example response::
    //         {
    //             "symbol": "LTCBTC",
    //             "orderId": 1,
    //             "orderListId": -1 //Unless part of an OCO, the value will always be -1.
    //             "clientOrderId": "myOrder1",
    //             "price": "0.1",
    //             "origQty": "1.0",
    //             "executedQty": "0.0",
    //             "cummulativeQuoteQty": "0.0",
    //             "status": "NEW",
    //             "timeInForce": "GTC",
    //             "type": "LIMIT",
    //             "side": "BUY",
    //             "stopPrice": "0.0",
    //             "icebergQty": "0.0",
    //             "time": 1499827319559,
    //             "updateTime": 1499827319559,
    //             "isWorking": true,
    //             "origQuoteOrderQty": "0.000000"
    //         }
    //     */
    // }

    public cancelOrder = async (binanceRest: MainClient, symbol: string, orderId: number): Promise<any> => {
        const options: CancelOrderParams = {
            symbol: symbol,
            orderId: orderId
        }
        return binanceRest
            .cancelOrder(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(`cancelOrder() ${JSON.stringify(err)}`, LogLevel.ERROR);
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

    public getExchangeInfo = async (binanceRest: MainClient, symbol: string): Promise<ExchangeInfo | void> => {
        const options: ExchangeInfoParams = {
            symbol: symbol        
        }
        return binanceRest
            .getExchangeInfo(options)
            .then(response => {
                return response as ExchangeInfo;
            }).catch(err => {
                txtLogger.writeToLogFile(`getExchangeInfo() ${JSON.stringify(err)}`, LogLevel.ERROR);
            });

        /*
        Example response:
             timezone: string;
    serverTime: number;
    rateLimits: RateLimiter[];
    exchangeFilters: ExchangeFilter[];
    symbols: SymbolExchangeInfo[];
        */
    }

    public getSpotUserDataListenKey = async (binanceRest: MainClient): Promise<any> => {
        return binanceRest
            .getSpotUserDataListenKey()
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(` getSpotUserDataListenKey() ${JSON.stringify(err)}`, LogLevel.ERROR);
            });
    }
}
