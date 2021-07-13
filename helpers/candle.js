const fetch = require('node-fetch');
const dateHelper = require('./date');

const retrieveCandles = (url) => {
    return fetch(url)
        .then(res => { return res.json() })
        .then(data => {
            return data;
        }).catch(error => console.log(error));
}

const generateClosePricesList = (data) => {
    let result = [];
    data.forEach(element => {
        result.push(parseFloat(element[4]));
    });
    return result;
}

const generateObjectsFromData = (data) => {
    let result = [];
    data.forEach(element => {
        let obj = {
            openTime: dateHelper.formatDate(new Date(element[0])),
            open: element[1],
            high: element[2],
            low: element[3],
            close: element[4],
            volume: element[5],
            closeTime: dateHelper.formatDate(new Date(element[6])),
            quoteAssetVolume: element[7],
            numberOfTrades: element[8],
            takerBuyBaseAssetVolume: element[9],
            takerBuyQuoteAssetVolume: element[10],
            ignore: element[11]
        }
        result.push(obj);
        obj = {};
    });
    return result;
}

const generateSmallObjectsFromData = (data) => {
    let result = [];
    data.forEach(element => {
        let obj = {
            openTime: dateHelper.formatDate(new Date(element[0])),
            open: element[1],
            high: element[2],
            low: element[3],
            close: element[4],
            closeTime: dateHelper.formatDate(new Date(element[6])),
        }
        result.push(obj);
        obj = {};

    });
    return result;
}

module.exports = {
    retrieveCandles,
    generateObjectsFromData,
    generateClosePricesList,
    generateSmallObjectsFromData
};
