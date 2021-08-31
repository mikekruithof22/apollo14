export enum OrderTypeEnum {
    LIMITSELL = 'Limit sell',
    LIMITBUY = 'Limit buy',
    STOPLOSSLIMIT = 'Stoploss limit',
    MARKETBUY = 'Market buy',
    MARKETSELL = 'Market sell',
    STOPLOSS = 'Stop loss',
    OCO = 'OCO'
}

export enum OrderStatusEnum {
    CANCELED = 'CANCELED',
    EXPIRED = 'EXPIRED',
    FILLED = 'FILLED',
    NEW = 'NEW',
    PENDING_CANCEL = 'PENDING_CANCEL',
    PARTIALLY_FILLED = 'PARTIALLY_FILLED',
    REJECTED = 'REJECTED'
}