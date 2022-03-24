export default {
    "brokerApiUrl": "https://api.binance.com/", //
    "baseCoin": "USDT", //
    "generic": { // got rid of this level
        "order": { // got rid of this level
            "rsiCalculationLength": 14, //
            "doNotOrder": { // got rid of this level
                "RSIValueIsBelow": 3 //
            },
            "limitBuyOrderExpirationTimeInSeconds": 60 //
        },
        "timeIntervals": [ // changed name to candleInterval
            "15m" // made number instead of array of numbers
        ],
        "emailRecipient": "<your-email-here>", // placed under emailSettings
        "emailWhenBuyOrderCreated": false, //
        "emailWhenCrashDetected": false, //
        "emailWhenOrdersIsOpenAfterCandleAmount": 20 //
    },
    "test": { // renamed testSettings
        "numberOfCandlesToRetrieve": 1000, // renamed candles to retrieve
        "generateExcelFile": true, //
        "candleAmountToLookIntoTheFuture": 100, //
        "leverage": { //
            "active": false, //
            "amount": 3 //
        },
        "retrieveTop100CoinsInsteadOftest": false, //
        "devTest": { // got rid of this level
            "triggerBuyOrderLogic": false // moved to production
        }
    },
    "production": {
        "numberOfCandlesToRetrieve": 50, // renamed to candles to retrieve
        "maxAllowedActiveOrdersForTraidingPair": 2, // renamed to maxAllowedActiveOrders
        "minimumUSDTorderAmount": 50, //
        "largeCrashOrder": { // renamed to crashOrder
            "active": true, // renamed to enabled
            "maxAmountOfCandlesToLookBack": 15, // renamed to maxCandlesToLookBack
            "minimumDeclingPercentage": -20, // 
            "order": { //
                "takeProfitPercentage": 5, //
                "takeLossPercentage": 50, //
                "maxUsdtBuyAmount": 10000, //
                "maxPercentageOfBalance": 50 //
            }
        },
        "pauseCondition": {//
            "active": true,//
            "tradingPair": "BTCUSDT",//
            "maxAmountOfCandlesToLookBack": 13,//
            "minimumDeclingPercentage": -4.5,//
            "amountOfCandlesToPauseBotFor": 32//
        }
    },

    "tradingPairs": [//
        "ETH",
        "LUNA",
        "ADA"
    ],
    "orderConditions": [// 
        {
            "name": "4-30-1#50",//
            "rsi": {//
                "minimumRisingPercentage": 30.00//
            },
            "candle": {//
                "minimumDeclingPercentage": -4.00//
            },
            "calcBullishDivergence": {//
                "numberOfMinimumIntervals": 5,//
                "numberOfMaximumIntervals": 32//
            },
            "order": {
                "takeProfitPercentage": 0.85,//
                "takeLossPercentage": 25,//
                "maxUsdtBuyAmount": 500,//
                "maxPercentageOfBalance": 50//
            },
            "doNotOrder": {//
                "btc24HourChange": {//
                    "active": false,//
                    "percentage": 1//
                },
                "coin24HourChange": {//
                    "active": false,//
                    "percentage": -7.5//
                }
            }
        }
    ]
}