
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