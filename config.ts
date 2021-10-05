export default {
    "brokerApiUrl": "https://api.binance.com/",
    "tradingPairs": [
        "DOTUSDT",
        "BTCUSDT",
        "ETHUSDT",
        "LTCUSDT"
    ],
    "timeIntervals": ["15m"],
    "genericOrder": {
        "reduceAmountToSpendWithPercentage": 2.5,
        "rsiCalculationLength": 14
    },
    "production": {
        "numberOfCandlesToRetrieve": 50, 
        "minimumUSDTorderAmount": 10,
        "devTest": {
            "triggerBuyOrderLogic": false,
            "sellCurrentBalance": false
        }
    },
    "test": {
        "numberOfCandlesToRetrieve": 1000,
        "generateExcelFile": true,
        "testWithHistoricalData": true,
        "consoleLogSteps": false,
        "candleAmountToLookIntoTheFuture": 100,
        "startBalance": 2500
    },
    "orderConditions": [
        {
            "name": "1.) VTHOUSDT",
            "rsi": {
                "minimumRisingPercentage": 1.00
            },
            "candle": {
                "minimumDeclingPercentage": -1.00
            },
            "calcBullishDivergence": {
                "numberOfMinimumIntervals": 5,
                "numberOfMaximumIntervals": 25
            },
            "order": {
                "takeProfitPercentage": 1,
                "takeLossPercentage": 2,
                "maxUsdtBuyAmount": 5000,
                "maxPercentageOffBalance": 75
            }
        }
    ]
}