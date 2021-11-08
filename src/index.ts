import * as schedule from "node-schedule";

import { WebsocketClient, WsKey } from './../node_modules/binance/lib/websocket-client';
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
    const runTestInsteadOfProgram: boolean = config.production.devTest.triggerBuyOrderLogic;
    const amountOfCandlesToPauseBotFor: number = config.production.pauseCondition.amountOfCandlesToPauseBotFor

    websocketClient.on('open', async (data: {
        wsKey: WsKey;
        ws: WebSocket;
        event?: any;
    }) => {
        // Sanity check the config.json.
        const incorrectConfigData: boolean = configChecker.checkConfigData();
        if (incorrectConfigData) {
            txtLogger.writeToLogFile(`The websocket() quit because:`);
            txtLogger.writeToLogFile(`The the method checkConfigData() detected wrong config values`);
            return;
        }
        txtLogger.writeToLogFile(`*** config.json is equal to:  ${JSON.stringify(config)}`);
        txtLogger.writeToLogFile(`Websocket event - connection opened open:', ${data.wsKey}`);

        if (runTestInsteadOfProgram === false) {
            schedule.scheduleJob(cronExpression, async function () {
                txtLogger.writeToLogFile(`---------- Program started ---------- `);
                const crashDetected: boolean = await tradingBot.crashDetected();
                if (crashDetected) {
                    txtLogger.writeToLogFile(`Crash detected. Setting pause to ${amountOfCandlesToPauseBotFor} candles`);
                    candlesToWait = amountOfCandlesToPauseBotFor;
                }
                if (candlesToWait > 0) {
                    txtLogger.writeToLogFile(`Pause active for ${candlesToWait} amount of candles.`);
                    txtLogger.writeToLogFile(`Only checking crash order condition per trading pair during pause.`);
                    await tradingBot.runProgram(true);
                    candlesToWait--;
                } else {
                    await tradingBot.runProgram(false);
                }
            });
        } else {
            await tradingBot.runProgram(false);
        }

        // wsService.requestListSubscriptions(websocketClient, data.wsKey, 1);
    });

    // We can run requestListSubscriptions above to check if we are subscribed. The answer will appear here.
    websocketClient.on('reply', async (data: WsResponse) => {
        txtLogger.writeToLogFile(`Reply event received: ${JSON.stringify(data)}`);
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
