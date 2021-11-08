require('dotenv').config();

import { AllCoinsInformationResponse, BasicSymbolParam, CancelOrderParams, ExchangeInfo, ExchangeInfoParams, OrderBookParams } from '../../node_modules/binance/lib/index';

import BinanceError from '../models/binance-error';
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

    public getAccountBalancesWithRetry = async (binanceRest: MainClient): Promise<AllCoinsInformationResponse[] | BinanceError> => {
        const retryDelay = 3000;
        const response = await this.getAccountBalances(binanceRest);
        if (!this.isTimeStampError(response)) {
            return response;
        } else {
            txtLogger.writeToLogFile(`Retrying getAccountBalances() with delay of ${retryDelay}ms`);
            setTimeout(async () => {
                return await this.getAccountBalances(binanceRest);
            }, retryDelay);
        }
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
    }
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
   

    public retrieveAllTradingPairs = async (binanceRest: MainClient): Promise<ExchangeInfo | BinanceError> => {
        return binanceRest
            .getExchangeInfo()
            .then(response => {
                return response as ExchangeInfo;
            }).catch(err => {
                return err as BinanceError;
            });
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

    public get24hrChangeStatististics = async (binanceRest: MainClient, symbol: string): Promise<any> => {
        const options: BasicSymbolParam = {
            symbol: symbol
        }

        return binanceRest
            .get24hrChangeStatististics(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.writeToLogFile(` get24hrChangeStatististics() ${JSON.stringify(err)}`, LogLevel.ERROR);
            });

            /* 
            {
            symbol: 'BTCUSDT',
            priceChange: '3684.44000000',
            priceChangePercent: '5.951',
            weightedAvgPrice: '64743.14646356',
            prevClosePrice: '61911.00000000',
            lastPrice: '65595.44000000',
            lastQty: '0.00953000',
            bidPrice: '65595.43000000',
            bidQty: '0.09531000',
            askPrice: '65595.44000000',
            askQty: '1.92980000',
            openPrice: '61911.00000000',
            highPrice: '66423.00000000',
            lowPrice: '61700.77000000',
            volume: '47843.74933000',
            quoteVolume: '3097554870.23826050',
            openTime: 1636298221662,
            closeTime: 1636384621662,
            firstId: 1133222857,
            lastId: 1135202650,
            count: 1979794
            }
            */
    }

    private getAccountBalances = async (binanceRest: MainClient): Promise<AllCoinsInformationResponse[] | BinanceError> => {
        return binanceRest
            .getBalances()
            .then(response => {
                return response as AllCoinsInformationResponse[];
            }).catch(err => {
                return err as BinanceError;
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


    private isTimeStampError(response: AllCoinsInformationResponse[] | BinanceError): response is BinanceError {
        return (response as BinanceError).code === -1021 && (response as BinanceError).message.startsWith("Timestamp")
    }
}
