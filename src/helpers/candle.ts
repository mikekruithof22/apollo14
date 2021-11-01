import { Candle, ClosePrice, LightWeightCandle } from '../models/candle';

import dateHelper from './date';
import fetch from 'node-fetch';

export default class CandleHelper {
    public retrieveCandles = (url) => {
        return fetch(url)
            .then(res => { return res.json() })
            .then(data => {
                return data;
            }).catch(error => console.log(error));
    }

    public generateClosePricesList = (data): ClosePrice[] => {
        let result = [];
        data.forEach(element => {
            result.push(parseFloat(element[4]));
        });
        return result;
    }

    public generateObjectsFromData = (data): Candle[] => {
        let result: Candle[] = [];
        data.forEach(element => {
            let obj: Candle = {
                openTime: dateHelper.formatLongDate(new Date(element[0])),
                open: element[1],
                high: element[2],
                low: element[3],
                close: element[4],
                volume: element[5],
                closeTime: dateHelper.formatLongDate(new Date(element[6])),
                quoteAssetVolume: element[7],
                numberOfTrades: element[8],
                takerBuyBaseAssetVolume: element[9],
                takerBuyQuoteAssetVolume: element[10],
                ignore: element[11]
            }
            result.push(obj);
            obj = undefined;
        });
        return result;
    }

    public generateSmallObjectsFromData = (data): LightWeightCandle[] => {
        let result: LightWeightCandle[] = [];
        data.forEach(element => {
            let obj: LightWeightCandle = {
                openTime: dateHelper.formatLongDate(new Date(element[0])),
                open: element[1],
                high: element[2],
                low: element[3],
                close: element[4],
                closeTime: dateHelper.formatLongDate(new Date(element[6])),
            }
            result.push(obj);
            obj = undefined;
        });
        return result;
    }
}

