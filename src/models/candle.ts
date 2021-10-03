
export class Candle {
    openTime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume:string;
    closeTime: string;
    quoteAssetVolume:string;
    numberOfTrades: string;
    takerBuyBaseAssetVolume: string;
    takerBuyQuoteAssetVolume: string;
    ignore: string;
}

export class LightWeightCandle {
    openTime: string;
    open: string;
    high: string;
    low: string;
    close:string;
    closeTime: string;
}

export class ClosePrice {
    price: number;
}

export class LightWeightCandleCollection {
    tradingPair: string; 
    interval: string;
    lightWeightCandles: LightWeightCandle[] = [];
}

export class ClosePriceCollection {
    tradingPair: string; 
    interval: string;
    closePrices: ClosePrice[] = [];
}
export class RsiCollection {
    interval: string;
    tradingPair: string; 
    rsiCollection: any[] = [];
}