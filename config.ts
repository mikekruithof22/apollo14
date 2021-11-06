export default {
    "brokerApiUrl": "https://api.binance.com/",
    "emailRecipient": "a.gulzadian@gmail.com",
    "tradingPairs": [
        "DOTUSDT",
        "BTCUSDT",
        "ETHUSDT",
        "LTCUSDT"
    ],
    "timeIntervals": ["15m"],
    "genericOrder": {
        "rsiCalculationLength": 14,  
        "doNotOrder": {
            "RSIValueIsBelow": 20
        },      
        "limitBuyOrderExpirationTimeInSeconds": 5
    },
    "production": {
        "numberOfCandlesToRetrieve": 50, 
        "maxAllowedActiveOrdersForTraidingPair": 3,
        "minimumUSDTorderAmount": 10,
        "devTest": {
            "triggerBuyOrderLogic": false,
        },
        "largeCrashOrder": {
            "maxAmountOfCandlesToLookBack": 15,
            "minimumDeclingPercentage": -15,
            "order": {
                "takeProfitPercentage": 5,
                "takeLossPercentage": 90,
                "maxUsdtBuyAmount": 100,
                "maxPercentageOfBalance": 100
            }
        },
        "pauseCondition": {
            "active": true,
            "tradingPair": "BTCUSDT",
            "maxAmountOfCandlesToLookBack": 10,
            "minimumDeclingPercentage": -5,
            "amountOfCandlesToPauseBotFor": 32
        }
    },
    "test": {
        "numberOfCandlesToRetrieve": 1000,
        "generateExcelFile": true,
        "candleAmountToLookIntoTheFuture": 100,
        "leverage": {
            "active": true,
            "amount": 3
        }
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
                "maxPercentageOfBalance": 75
            }
        }
    ]
}