import { NewOCOParams, NewSpotOrderParams } from '../../node_modules/binance/lib/index';

import { LogLevel } from '../models/log-level';
import { MainClient } from '../../node_modules/binance/lib/main-client';
import { OrderTypeEnum } from '../models/order';
import dateHelper from '../helpers/date';
import txtLogger from '../helpers/txt-logger';

export default class Order {

    public createOrder = async (
        binanceRest: MainClient,
        orderType: OrderTypeEnum,
        symbol: string,
        quantity: number,
        orderPrice: number,
        stopPrice: number = 0
    ) => {

        let options: NewSpotOrderParams;

        switch (orderType) {
            case OrderTypeEnum.LIMITBUY:
                options = this.generateLimitBuyOrderOptions(symbol, quantity, orderPrice);
                break;
            case OrderTypeEnum.LIMITSELL:
                options = this.generateLimitSellOrderOptions(symbol, quantity, orderPrice);
                break;
            case OrderTypeEnum.STOPLOSSLIMIT:
                options = this.generateStopLossOrderOptions(symbol, quantity, orderPrice, stopPrice);
                break;
            case OrderTypeEnum.MARKETBUY:
                options = this.generateMarketBuyOrderOptions(symbol, quantity);
                break;
            case OrderTypeEnum.MARKETSELL:
                options = this.generateMarketSellOrderOptions(symbol, quantity);
                break;
            case OrderTypeEnum.STOPLOSS:
                options = this.generateStopLossSellOrderOptions(symbol, quantity, stopPrice);
                break;
            default:
                txtLogger.log(`Method: createOrder() did not receive a proper options object`, LogLevel.ERROR);
                return;
        }
        txtLogger.log(`Try to create a ${orderType} with the following options:`, LogLevel.INFO);
        txtLogger.log(`${JSON.stringify(options, null, 4)}`);
        return binanceRest
            .submitNewOrder(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.log(`createOrder() failed ${JSON.stringify(err)}`, LogLevel.ERROR);
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

    public createOcoSellOrder = async (
        binanceRest: MainClient,
        symbol: string,
        quantity: number,
        orderPrice: number,
        stopPrice: number,
        stopLimitPrice: number
    ) => {
        // SELL: Limit Price > Last Price > Stop Price
        // BUY: Limit Price < Last Price < Stop Price
        const options: NewOCOParams = {
            symbol: symbol,
            side: 'SELL',
            quantity: quantity,
            price: orderPrice,
            stopPrice: stopPrice,
            stopLimitPrice: stopLimitPrice,
            stopLimitTimeInForce: 'GTC',
            newOrderRespType: 'RESULT',
        }
        txtLogger.log(`Try to create an OCO with the following options:`, LogLevel.INFO);
        txtLogger.log(`${JSON.stringify(options, null, 4)}`);
        return binanceRest
            .submitNewOCO(options)
            .then(response => {
                return response;
            }).catch(err => {
                txtLogger.log(`createOcoSellOrder() failed ${JSON.stringify(err)}`, LogLevel.ERROR);
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


    public generateTestOrder = async (
        binanceRest: MainClient,
        orderType: OrderTypeEnum,
        symbol: string,
        quantity: number,
        orderPrice: number,
        stopPrice: number = 0
    ) => {
        let orderResult;
        let options: NewSpotOrderParams;

        switch (orderType) {
            case OrderTypeEnum.LIMITBUY:
                options = this.generateLimitBuyOrderOptions(symbol, quantity, orderPrice);
                break;
            case OrderTypeEnum.LIMITSELL:
                options = this.generateLimitSellOrderOptions(symbol, quantity, orderPrice);
                break;
            case OrderTypeEnum.STOPLOSSLIMIT:
                options = this.generateStopLossOrderOptions(symbol, quantity, orderPrice, stopPrice);
                break;
            case OrderTypeEnum.MARKETBUY:
                options = this.generateMarketBuyOrderOptions(symbol, quantity);
                break;
            case OrderTypeEnum.MARKETSELL:
                options = this.generateMarketSellOrderOptions(symbol, quantity);
                break;
            case OrderTypeEnum.STOPLOSS:
                options = this.generateStopLossSellOrderOptions(symbol, quantity, stopPrice);
                break;
            default:
                txtLogger.log(`Method: createOrder() did not receive a proper options object`, LogLevel.ERROR);
                return;
        }

        // options.newClientOrderId = binanceRest.generateNewOrderId();

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

    public generateLimitBuyOrderOptions = (symbol: string, quantity: number, maxPrice: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
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

    public generateLimitSellOrderOptions = (symbol: string, quantity: number, orderPrice: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
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

    public generateStopLossOrderOptions = (symbol: string, quantity: number, orderPrice: number, stopPrice: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
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

    public generateMarketBuyOrderOptions = (symbol: string, quantity: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
            symbol: symbol,
            side: 'BUY',
            type: 'MARKET',
            quantity: quantity,
            newOrderRespType: 'RESULT'

        }
        return options;
    }

    public generateMarketSellOrderOptions = (symbol: string, quantity: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
            symbol: symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: quantity,
            newOrderRespType: 'RESULT'
        }
        return options;
    }

    public generateStopLossSellOrderOptions = (symbol: string, quantity: number, stopPrice: number): NewSpotOrderParams => {
        const options: NewSpotOrderParams = {
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

}

