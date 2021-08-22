const { WebsocketClient } = require('binance');
require('dotenv').config();
const txtLogger = require('../helpers/txt-logger');

let websocketKey;

const generateWebsocketClient = () => {
    const wsClient = new WebsocketClient({
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET,
        beautify: true,
    });

    // notification when a connection is opened
    wsClient.on('open', (data) => {
        websocketKey = data.wsKey;
        txtLogger.writeToLogFile(`Websocket event - connection opened open:', ${data.wsKey}, ${data.ws.url}`);
    });

    wsClient.on('close', (data) => {
        txtLogger.writeToLogFile(`Websocket event - connection closed', ${data.wsKey}, ${data.ws.url}`);
    });

    wsClient.on('reconnecting', (data) => {
        txtLogger.writeToLogFile(`Websocket event - trying to reconnected...', ${data.wsKey}, ${data.ws.url}`);
    });


    wsClient.on('reconnected', (data) => {
        txtLogger.writeToLogFile(`Websocket event - reconnected', ${data.wsKey}, ${data.ws.url}`);
    });

    return wsClient;
}

const closeStreamForKey = (wsClient, wsKey, willReconnect = false) => {
    return wsClient.close(wsKey, willReconnect);
}

const closeWebSocket = (wsClient) => {
    return wsClient.closeWs(wsClient);
}

const listenToAccountOderChanges = (wsClient) => {
    return wsClient.subscribeSpotUserDataStream();

    // eventType: 'executionReport';
    // eventTime: number;
    // symbol: string;
    // newClientOrderId: string;
    // side: OrderSide;
    // orderType: OrderType;
    // cancelType: OrderTimeInForce;
    // quantity: number;
    // price: number;
    // stopPrice: number;
    // icebergQuantity: number;
    // orderListId: number;
    // originalClientOrderId: string;
    // executionType: OrderExecutionType;
    // orderStatus: OrderStatus;
    // rejectReason: string;
    // orderId: number;
    // lastTradeQuantity: number;
    // accumulatedQuantity: number;
    // lastTradePrice: number;
    // commission: number;
    // commissionAsset: string | null;
    // tradeTime: number;
    // tradeId: number;
    // ignoreThis1: number;
    // isOrderOnBook: false;
    // isMaker: false;
    // ignoreThis2: true;
    // orderCreationTime: number;
    // cumulativeQuoteAssetTransactedQty: number;
    // lastQuoteAssetTransactedQty: number;
    // orderQuoteQty: number;
    // wsMarket: WsMarket;
    // wsKey: WsKey;


    // For OCO

    // eventType: 'listStatus';
    // eventTime: number;
    // symbol: string;
    // orderListId: number;
    // contingencyType: 'OCO';
    // listStatusType: OCOStatus;
    // listOrderStatus: OCOOrderStatus;
    // listRejectReason: string;
    // listClientOrderId: string;
    // transactionTime: number;
    // orders: OrderObjectFormatted[];
    // wsMarket: WsMarket;
    // wsKey: WsKey;
}

module.exports = {
    generateWebsocketClient,
    listenToAccountOderChanges,
    closeStreamForKey,
    closeWebSocket,
    websocketKey
}