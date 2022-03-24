export class Config {
    BrokerApiUrl: string;
    BaseCoin: string;
    RsiCalculationLength: number;
    RsiValueIsBelow: number; // todo aram this seems to be a remnant of an early version of crash detection, might be obsolete
    LimitBuyOrderExpirationTimeInSeconds: number;
    CandleInterval: number;
    EmailSettings: {
        Recipient: string;
        Report: {
            enabled: boolean;
            interval: EmailReportInterval;
        }
        EmailWhen: { 
            BuyOrderCreated: boolean;
            ProfitMade: boolean; // todo aram not in original config, doubt this is actually useful, but nice reminder for reporting function
            LossMade: boolean; // todo aram not in original config, doubt this is actually useful, but nice reminder for reporting function
            CrashDetected: boolean;
            OrderIsOpenAfterCandleAmount: number
        }
    }
    TestSettings: { // todo aram leave settings as they are now, but these will probably change drastictly according to new test method
        CandlesToRetrieve: number;
        GenerateExcelFile: boolean;
        CandleAmountToLookIntoTheFuture: number;
        Leverage: { // todo aram consider not ever doing anything with leverage, especially not in test
            Active: boolean; // todo aram if using leverage: use > 0 conition instead of active boolean to determine if leverage should be used
            Amount: number;
        }
        RetrieveTop100CoinsInsteadOftest: boolean;
        // todo aram below is newly added, the idea is that the new test method uses the same methods etc. as the production, but with hypothetical trading pairs and order conditions
    }
    ProductionSettings: { // todo aram consider renaming to something like real bla bla
        TriggerBuyOrderLogic: boolean;
        CandlesToRetrieve: number;
        MaxAllowedActiveOrders: number;
        MinimumUSDTorderAmount: number;
        MaxUsdtBuyAmount: number;
        MaxPercentageOfBalance: number;
        TradingPairs: [
            string
        ]
        OrderStrategies: [
            OrderStrategy
        ]
    }
    CrashSettings: {
        Order: {
            Enabled: boolean;
            CandlesToCheck: number;
            RsiDeclinePercentage: number;
            TakeProfitPercentage: number;
            TakeLossPercentage: number;
            MaxUsdtBuyAmount: number;
            MaxPercentageOfBalance: number;
        }
        Pause: {
            Enabled: boolean;
            CandlesToCheck: number;
            RsiDeclinePercentage: number;
            TradingPair: string;
            PauseTimeInCancles: number;
        }
    }
}

export class OrderStrategy {
    Name: string;
    RsiRisePercentage: number;
    PriceDeclinePercentage: number;
    BullishDivergenceCandleRange: {
        MinIntervals: number;
        MaxIntervals: number;
    }
    Order: {
        TakeProfitPercentage: number;
        TakeLossPercentage: number;
    }
    DoNotOrder: {
        Btc24HourChange: {
            Enabled: boolean;
            Percentage: number;
        }
        Coin24HourChange: {
            Enabled: boolean;
            Percentage: number;
        }
    }
}

export enum EmailReportInterval {
    Daily,
    Weekly
}

// todo aram ideas about how to use the config: 
// a configImporter checks if a config.json exists, if so: it imports it and parses it to a ConfigToUse object or something (with validation at the point of parse)
// If it doesn't exist: the in-code default config values set is used, which is also exported to the config.json, to make sure the .json and ConfigToUse are always in sync

// Later, in the webapp, when you alter a config setting, it changes the value in both the json and the ConfigToUse object
// Also, a download config.json button is provided to save desirable configs
// maybe it'd be nice to see in the interface what the default value is and what the custom value is 