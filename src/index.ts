import * as schedule from "node-schedule";

import { WebsocketClient, WsKey } from 'binance';
import { WsResponse, WsUserDataEvents } from "binance";

import CronHelper from './helpers/cronHelper';
import Mailer from './helpers/mailer';
import Tradingbot from './tradingbot';
import WebSocket from 'isomorphic-ws';
import WebSocketService from './binance/websocket';
import config from "../config";
import configChecker from './helpers/config-sanity-check';
import txtLogger from './helpers/txt-logger';

console.log("App is running");

// setup
try {
    const cronExpression = CronHelper.GetCronExpression();
    const wsService: WebSocketService = new WebSocketService();
    const websocketClient: WebsocketClient = wsService.generateWebsocketClient();
    const tradingBot = new Tradingbot();
    let candlesToWait: number = 0;

    websocketClient.subscribeSpotUserDataStream();

    // Retreive some config values
    const runTestInsteadOfProgram: boolean = config.test.devTest.triggerBuyOrderLogic;
    const amountOfCandlesToPauseBotFor: number = config.production.pauseCondition.amountOfCandlesToPauseBotFor
    const largeCrashOrderActive: boolean = config.production.largeCrashOrder.active;

    // Sanity check the config.json.
    const incorrectConfigData: boolean = configChecker.checkConfigData();
    if (incorrectConfigData) {
        txtLogger.writeToLogFile(`The program quit because:`);
        txtLogger.writeToLogFile(`The the method checkConfigData() detected incorrect config values.`);
        txtLogger.writeToLogFile(`Program is closed by 'process.exit.`);
        process.exit();
    }
    txtLogger.writeToLogFile(`***** config.json is equal to:`);
    txtLogger.writeToLogFile(`${JSON.stringify(config)}`);

    websocketClient.on('open', async (data: {
        wsKey: WsKey;
        ws: WebSocket;
        event?: any;
    }) => {
        txtLogger.writeToLogFile(`Websocket event - connection opened open:', ${data.wsKey}`);
        if (runTestInsteadOfProgram === false) {
            schedule.scheduleJob(cronExpression, async function () {
                txtLogger.writeToLogFile(`---------- Program started ---------- `);
                const crashDetected: boolean = await tradingBot.crashDetected();
                if (crashDetected) {
                    txtLogger.writeToLogFile(`Crash detected. Setting pause to ${amountOfCandlesToPauseBotFor} candles. Config details:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(config.production.pauseCondition, null, 4)}`);                    
                    candlesToWait = amountOfCandlesToPauseBotFor;

                    if (config.generic.emailWhenCrashDetected === true) {
                        Mailer.Send(`Crash detected ${new Date().toLocaleString()}`, `Crash detected on ${new Date().toLocaleString()}. Setting pause to ${amountOfCandlesToPauseBotFor} }`);
                    }
                }
                if (candlesToWait > 0) {
                    txtLogger.writeToLogFile(`Pause active for ${candlesToWait} amount of candles.`);
                    if (largeCrashOrderActive) {
                        txtLogger.writeToLogFile(`Only checking crash order condition per trading pair during pause.`);
                        await tradingBot.runProgram(true);
                    } else {
                        txtLogger.writeToLogFile(`NOT going to check for crash orders, because this is functionally is turned off (config.production.largeCrashOrder.active = false).`);
                    }
                    candlesToWait--;
                } else {
                    await tradingBot.runProgram(false);
                }
            });
        } else {
            await tradingBot.runProgram(false);
        }
    });

    // Listen To Order Changes
    websocketClient.on('formattedUserDataMessage', async (data: WsUserDataEvents) => {
        txtLogger.writeToLogFile(`formattedUserDataMessage event received: ${JSON.stringify(data)}`);
        await tradingBot.processFormattedUserDataMessage(data);
    });
} catch (error) {
    error = error as Error;
    const errorString = `Bot has stopped due to the following error: ${(error as Error).name} - ${(error as Error).stack}`;
    Mailer.Send('Bot crashed', errorString);
}
