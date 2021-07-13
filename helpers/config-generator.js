
const testConfigurationGenerator = (config) => {
    const rsiConfig = config.rsi.test;
    const candleConfig = config.candle.test;
    let testConfigList = [];

    if (testConfig.tryDifferentConfigurations === false) {
        return config;
    } else {
        return undefined; // TODO: hiero verder gaan!
    }
};

module.exports = {
    testConfigurationGenerator,
};


/*
TODO: dit mogelijk later als object neerzetten:
{
    "brokerApiUrl": "https://api.binance.com/",
    "numberOfCandlesToRetrieve": 50,
    "logBullishDivergenceCalculation": false,
    "testWithHistoricData": true,
    "generateLogFile": false,
    "rsi": {
        "minimumRisingPercentage": 5.00,
        "calculationLength": 14,
        "test": {
            "active": false,
            "increaseEachIterationWith": 0.5,
            "maxPercentage": 30   
        }
    },
    "candle": {
        "tradingPair": "BTCUSDT",
        "interval": "1d",
        "minimumDeclingPercentage": -5.00,
        "test": {
            "active": false,
            "increaseEachIterationWith": -0.5,
            "maxPercentage": 30  
        }
    },
    "calcBullishDivergence": {
        "numberOfMinimumIntervals": 5,
        "numberOfMaximumIntervals": 15
    },
    "stopLossOrder": {
        "takeProfitPercentage": 1,
        "takeLossPercentage": 2,
        "candleAmountToLookIntoTheFuture": 10
    }
}







*/