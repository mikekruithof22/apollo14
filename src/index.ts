import * as schedule from "node-schedule";
import Tradingbot from './tradingbot';
import CronHelper from './helpers/cronHelper';
import WebSocketService from './binance/websocket';
import { WebsocketClient, WsKey } from './../node_modules/binance/lib/websocket-client';
import txtLogger from './helpers/txt-logger';
import { LogLevel } from './models/log-level'; // todo aram check if loglevel can be included in txtLogger class
import WebSocket from 'isomorphic-ws';
import { WsResponse, WsUserDataEvents } from "binance";

console.log("App is running");

// setup
const cronExpression = CronHelper.GetCronExpression();
const wsService: WebSocketService = new WebSocketService();
const websocketClient: WebsocketClient = wsService.generateWebsocketClient();
const tradingBot = new Tradingbot();

websocketClient.subscribeSpotUserDataStream();

websocketClient.on('open', async (data: {
    wsKey: WsKey;
    ws: WebSocket;
    event?: any;
}) => {
    txtLogger.writeToLogFile(`Websocket event - connection opened open:', ${data.wsKey}, ${data.ws.url}`);

    schedule.scheduleJob(cronExpression, async function () {
        await tradingBot.runProgram();
    });

    // wsService.requestListSubscriptions(websocketClient, data.wsKey, 1);
});

// We can run requestListSubscriptions above to check if we are subscribed. The answer will appear here.
websocketClient.on('reply', async (data: WsResponse) => {
    txtLogger.writeToLogFile(`reply eventreceived: ${JSON.stringify(data)}`);
});

// Listen To Order Changes
websocketClient.on('formattedUserDataMessage', async (data: WsUserDataEvents) => {
    txtLogger.writeToLogFile(`formattedUserDataMessage eventreceived: ${JSON.stringify(data)}`);
    await tradingBot.processFormattedUserDataMessage(data);
});

