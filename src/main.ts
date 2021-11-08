import * as schedule from "node-schedule";

//import { WebsocketClient, WsKey } from 'binance';
import { WebsocketClient, WsKey, WsResponse, WsUserDataEvents } from "binance";

import CronHelper from './helpers/cronHelper';
import Tradingbot from './tradingbot';
import WebSocket from 'isomorphic-ws';
import WebSocketService from './binance-service/websocket';
import config from "../config";
import txtLogger from './helpers/txt-logger';

export default class Main { // todo aram this wrapper is kind of uselss I think, can do all of this stuff directly in index.ts as well, maybe just for tidyness use this wrapper
    private tradingBot: Tradingbot;
    private inProgress: boolean = false;
    private websocketClient: WebsocketClient;
    private websocketKey: WsKey;

    private job: schedule.Job = new schedule.Job(async function () {
        txtLogger.log(`Job invoked`)
        await this.tradingBot.runProgram();
    }.bind(this));

    public async Renew() { // todo aram maybe use this as a reset to renew all objects, websocket etc.?

    }
    
    public async GetState() {
        let websocketClientCreated: boolean = false
        if (this.websocketClient !== undefined) {
            websocketClientCreated = true;
        }

        return `The inProgress state of the app is ${this.inProgress}. The created state of the websocketClient is ${websocketClientCreated}`;
    }

    public async Start() {
        if (this.inProgress) {
            txtLogger.log('Main already in progress, skipping...'); // todo aram is this enough?
            return;
        }

        this.inProgress = true; 
        txtLogger.log('App is running');

        // todo aram add an 'in progress' boolean to the class to prevent the start endpoint calling multiple  trading bots etc.
        // maybe even add a result for the start function where it becomes clear of the start was succesful 
        // (and in the case of being "in progress" it would be false)
        // and if not, why not, and have that sent to the frontend again, so you can see like details of your run

        // setup
        const cronExpression = CronHelper.GetCronExpression();
        // todo aram consider moving the websocket stuff to private consts, this way you can call a 
        // /monitor endpoint or something and ask for the current state of the webconnection etc.
        // could be like the start of the dashboard feature
        const wsService: WebSocketService = new WebSocketService(); 
        this.websocketKey = wsService.websocketKey;
        this.websocketClient = wsService.generateWebsocketClient();
        this.tradingBot = new Tradingbot()

        txtLogger.log('Subscribing to webSocketClient');
        
        this.websocketClient.subscribeSpotUserDataStream();

        // Retreive some config values
        const runTestInsteadOfProgram: boolean = config.production.devTest.triggerBuyOrderLogic;

        this.websocketClient.on('open', async (data: {
            wsKey: WsKey;
            ws: WebSocket;
            event?: any;
        }) => {
            txtLogger.log(`Websocket event - connection opened:', ${data.wsKey}, ${data.ws.url}`);

            if (runTestInsteadOfProgram === false) {
                this.job.schedule(cronExpression);
            } else {
                txtLogger.log(`Running job once `)
                this.job.invoke();
            }

            // wsService.requestListSubscriptions(websocketClient, data.wsKey, 1);
        });

        // We can run requestListSubscriptions above to check if we are subscribed. The answer will appear here.
        this.websocketClient.on('reply', async (data: WsResponse) => {
            txtLogger.log(`reply eventreceived: ${JSON.stringify(data)}`);
        });

        // Listen To Order Changes
        this.websocketClient.on('formattedUserDataMessage', async (data: WsUserDataEvents) => {
            txtLogger.log(`formattedUserDataMessage eventreceived: ${JSON.stringify(data)}`);
            await this.tradingBot.processFormattedUserDataMessage(data);
        });
    }

    public  async Stop() {
        this.inProgress = false;
        txtLogger.log('Stopping scheduled job');

        var jobCancelled = this.job.cancel();

        if (jobCancelled) {
            txtLogger.log('Job cancelled');
        } else {
            txtLogger.log('Warning, unable to cancel job'); // todo aram maybe we want an email to be sent out in this case?
        }
    }
}