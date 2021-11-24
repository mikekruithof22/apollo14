export default {
    "brokerApiUrl": "https://api.binance.com/",
    "baseCoin": "USDT",
    "generic": {
        "order": {
            "rsiCalculationLength": 14,
            "doNotOrder": {
                "RSIValueIsBelow": 3
            },
            "limitBuyOrderExpirationTimeInSeconds": 60
        },
        "timeIntervals": [
            "15m"
        ],
        "emailRecipient": "<your-email-here>",
        "emailWhenBuyOrderCreated": false
    },
    "test": {
        "numberOfCandlesToRetrieve": 1000,
        "generateExcelFile": true,
        "candleAmountToLookIntoTheFuture": 100,
        "leverage": {
            "active": false,
            "amount": 3
        },
        "retrieveTop100CoinsInsteadOftest": false,
        "devTest": {
            "triggerBuyOrderLogic": false
        }
    },
    "production": {
        "numberOfCandlesToRetrieve": 50,
        "maxAllowedActiveOrdersForTraidingPair": 2,
        "minimumUSDTorderAmount": 50,
        "largeCrashOrder": {
            "active": true,
            "maxAmountOfCandlesToLookBack": 15,
            "minimumDeclingPercentage": -20,
            "order": {
                "takeProfitPercentage": 5,
                "takeLossPercentage": 50,
                "maxUsdtBuyAmount": 10000,
                "maxPercentageOfBalance": 50
            }
        },
        "pauseCondition": {
            "active": true,
            "tradingPair": "BTCUSDT",
            "maxAmountOfCandlesToLookBack": 13,
            "minimumDeclingPercentage": -4.5,
            "amountOfCandlesToPauseBotFor": 32
        }
    },

    "tradingPairs": [
        "ETH",
        "LUNA",
        "ADA"
    ],
    "orderConditions": [
        {
            "name": "4-30-1#50",
            "rsi": {
                "minimumRisingPercentage": 30.00
            },
            "candle": {
                "minimumDeclingPercentage": -4.00
            },
            "calcBullishDivergence": {
                "numberOfMinimumIntervals": 5,
                "numberOfMaximumIntervals": 32
            },
            "order": {
                "takeProfitPercentage": 0.85,
                "takeLossPercentage": 25,
                "maxUsdtBuyAmount": 500,
                "maxPercentageOfBalance": 50
            },
            "doNotOrder": {
                "btc24HourChange": {
                    "active": false,
                    "percentage": 1
                },
                "coin24HourChange": {
                    "active": false,
                    "percentage": -7.5
                }
            }
        }
    ]
}