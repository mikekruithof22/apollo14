import * as schedule from "node-schedule";
import Tradingbot from './tradingbot';
import CronHelper from './helpers/cronHelper';
import WebSocketService from './binance/websocket';
import { WebsocketClient, WsKey } from './../node_modules/binance/lib/websocket-client';
import txtLogger from './helpers/txt-logger';
import { LogLevel } from './models/log-level'; // todo aram check if loglevel can be included in txtLogger class
import WebSocket from 'isomorphic-ws';

// app.listen(app.get("port"), () => {
//     console.log(("App is running"), app.get("env"));
    console.log("App is running");

    // setup
    const cronExpression = CronHelper.GetCronExpression();
    const wsService: WebSocketService = new WebSocketService();
    let websocketClient: WebsocketClient = wsService.generateWebsocketClient();

    websocketClient.subscribeSpotUserDataStream();

    websocketClient.on('open', async (data: {
        wsKey: WsKey;
        ws: WebSocket;
        event?: any;
    }) => {
        txtLogger.writeToLogFile(`Websocket event - connection opened open:', ${data.wsKey}, ${data.ws.url}`);

        schedule.scheduleJob(cronExpression, async function () {
            var tradingBot = new Tradingbot(wsService, websocketClient);
            await tradingBot.runProgram();
        });
    });

// app.on('close', () => {
//     console.log("App is Closing");
//     app.removeAllListeners();
// });

// const tradingBot = new Tradingbot();
// tradingBot.runProgram();
