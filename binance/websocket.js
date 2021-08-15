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

const listenToAccountOderChanges = (wsClient, listenKey) => {
    return wsClient.subscribeSpotUserDataStream();
}

const closeAccountOderChangesStream = (wsClient, listenKey) => {

}

// wsClient.subscribeSpotUserDataStream();
// wsClient.subscribeMarginUserDataStream();
// wsClient.subscribeIsolatedMarginUserDataStream('BTCUSDT');
// wsClient.subscribeUsdFuturesUserDataStream();





module.exports = {
    generateWebsocketClient,
    listenToAccountOderChanges
}