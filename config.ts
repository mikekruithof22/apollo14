export default {
    "brokerApiUrl": "https://api.binance.com/",
    "tradingPairs": [
        "DOTUSDT",
        "BTCUSDT",
        "ETHUSDT",
        "LTCUSDT"
    ],
    "production": {
        "numberOfCandlesToRetrieve": 50, 
        "active": false,
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
            "interval": "30m",
            "rsi": {
                "minimumRisingPercentage": 1.00,
                "calculationLength": 14
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
                "maxPercentageOffBalance": 75,
            }
        }
    ]
}