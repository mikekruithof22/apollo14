import { LightWeightCandle } from "./candle";

export class HistoricalBullishDivergenceResult {
    id: string;
    startWithCandle: LightWeightCandle;
    startRsiValue: string;
    endingCandle: LightWeightCandle;
    endiRsiValue: string;
    orderConditionName: string;
    totalCandles: number;
    nextCandlesAfterHit: LightWeightCandle[];
    startCandle: LightWeightCandle;
}

export class BalanceObject {
    id: number;
    startWithCandle: string;
    startRsiValue: string;
    endingCandle: string;
    endiRsiValue: string;
    balance: number;
    stopLossMsg: string;
    orderConditionName: string;
    totalCandles: string;
}

export class MetaDataContent {
    amount: string;
    succesfull: string;
    unsuccesfull: string;
    unableSameCandle: string;
    unableUnknown: string;
    numberOffApiCalls: string;
    configuration: string;
}
