import { Candle, LightWeightCandle } from '../models/candle';

import { LogLevel } from '../models/log-level';
import dateHelper from './date';
import fetch from 'node-fetch';
import txtLogger from './txt-logger';

export default class CandleHelper {
    public retrieveCandles = (url) => {
        return fetch(url)
            .then(res => { return res.json() })
            .then(data => {
                return data;
            }).catch(err => {
                txtLogger.log(`retrieveCandles() failed: ${JSON.stringify(err, null, 4)}`, LogLevel.ERROR);
            });
    }

    public generateClosePricesList = (data): number[] => data.map(d => parseFloat(d[4]));

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

    public generateSmallObjectsFromData = (data): LightWeightCandle[] => 
        data.map(element => {
            return {
                openTime: dateHelper.formatLongDate(new Date(element[0])),
                open: element[1],
                high: element[2],
                low: element[3],
                close: element[4],
                closeTime: dateHelper.formatLongDate(new Date(element[6])),
            } as LightWeightCandle
        });
}