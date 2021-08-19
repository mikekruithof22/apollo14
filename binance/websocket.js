const { WebsocketClient } = require('binance');
require('dotenv').config();


const generateWebsocketClient = () => {
    const wsClient = new WebsocketClient({
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET,
        beautify: true,
    });

    // notification when a connection is opened
    wsClient.on('open', (data) => {
        console.log('connection opened open:', data.wsKey, data.ws.target.url);
    });
    return wsClient;
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

const closeStreamForKey = (wsClient, wsKey, willReconnect = false) => {
    return wsClient.close(wsKey, willReconnect);
}

const closeWebSocket = (wsClient) => {
    return wsClient.closeWs(wsClient);
}

module.exports = {
    generateWebsocketClient,
    listenToAccountOderChanges,
    closeStreamForKey,
    closeWebSocket
}