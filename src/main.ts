import * as schedule from "node-schedule";

//import { WebsocketClient, WsKey } from 'binance';
import { WebsocketClient, WsKey, WsResponse, WsUserDataEvents } from "binance";

import CronHelper from './helpers/cronHelper';
import { LogLevel } from './models/log-level'; // todo aram check if loglevel can be included in txtLogger class
import Tradingbot from './tradingbot';
import WebSocket from 'isomorphic-ws';
import WebSocketService from './binance/websocket';
import config from "../config";
import txtLogger from './helpers/txt-logger';

export default class Main { // todo aram this wrapper is kind of uselss I think, can do all of this stuff directly in index.ts as well, maybe just for tidyness use this wrapper
    public static async Start() {
        txtLogger.log('App is running');

        // setup
        const cronExpression = CronHelper.GetCronExpression();
        const wsService: WebSocketService = new WebSocketService();
        const websocketClient: WebsocketClient = wsService.generateWebsocketClient();
        const tradingBot = new Tradingbot();

        txtLogger.log('Subscribing to webSocketClient with new source for WebSocketClient');
        
        websocketClient.subscribeSpotUserDataStream();

        // Retreive some config values
        const runTestInsteadOfProgram: boolean = config.production.devTest.triggerBuyOrderLogic;

        websocketClient.on('open', async (data: {
            wsKey: WsKey;
            ws: WebSocket;
            event?: any;
        }) => {
            txtLogger.log(`Websocket event - connection opened open:', ${data.wsKey}, ${data.ws.url}`);

            if (runTestInsteadOfProgram === false) {
                schedule.scheduleJob(cronExpression, async function () {
                    await tradingBot.runProgram();
                });
            } else {
                await tradingBot.runProgram();
            }

            // wsService.requestListSubscriptions(websocketClient, data.wsKey, 1);
        });

        // We can run requestListSubscriptions above to check if we are subscribed. The answer will appear here.
        websocketClient.on('reply', async (data: WsResponse) => {
            txtLogger.log(`reply eventreceived: ${JSON.stringify(data)}`);
        });

        // Listen To Order Changes
        websocketClient.on('formattedUserDataMessage', async (data: WsUserDataEvents) => {
            txtLogger.log(`formattedUserDataMessage eventreceived: ${JSON.stringify(data)}`);
            await tradingBot.processFormattedUserDataMessage(data);
        });
    }
}
