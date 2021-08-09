const api = require('binance');
const binanceWS = new api.BinanceWS(true);

const streams = binanceWS.streams;

/*
    TODO: 
        Het is mogelijk dat je meerdere streams opzet. Graag hier rekening mee houden!

*/


// 
const startOnTradeStream = (tradingPair) => {
    binanceWS.onTrade(tradingPair, data => {
        console.log(data);
    });
}



module.exports = {
    startOnTradeStream
}