import * as schedule from "node-schedule";
import { WebsocketClient, WsKey, WsResponse, WsUserDataEvents } from "binance";
import CronHelper from './helpers/cronHelper';
import Tradingbot from './tradingbot';
import WebSocket from 'isomorphic-ws';
import WebSocketService from './binance-service/websocket';
import config from "../config";
import txtLogger from './helpers/txt-logger';
import Mailer from './helpers/mailer';
import configChecker from './helpers/config-sanity-check';

export default class Main { // todo aram this wrapper is kind of uselss I think, can do all of this stuff directly in index.ts as well, maybe just for tidyness use this wrapper
    private tradingBot: Tradingbot;
    private inProgress: boolean = false;
    private websocketClient: WebsocketClient;
    private websocketKey: WsKey;
    private currentPauseTimeInCandles: number = 0;
    private amountOfCandlesToPauseBotFor: number = config.production.pauseCondition.amountOfCandlesToPauseBotFor
    
    private job: schedule.Job = new schedule.Job(async function () {
        txtLogger.log(`---------- Program started ---------- `);

        txtLogger.log(`---------- Checking for Crash ---------- `);
        const crashDetected: boolean = await this.tradingBot.checkForCrash();
        if (crashDetected) {            
            txtLogger.log(`Crash detected. Setting number of candles to pause to ${this.amountOfCandlesToPauseBotFor} candles`);
            this.currentPauseTimeInCandles = this.amountOfCandlesToPauseBotFor;
        }

        txtLogger.log(`---------- Checking for Pause condition ---------- `);
        if (this.currentPauseTimeInCandles > 0) {
            txtLogger.log(`Bot is paused for ${this.currentPauseTimeInCandles} candles.`);
            // todo aram I don't like how the tradingbot is still run even if the bot is supposed to be paused
            // find out what the bot does do (even though it's paused) and maybe pull it out ouf the trading bot
            // I guess it's just the crash order logic, see if you can seperate that logic from the main divergence logic
            // (assuming the crash order stuff doesn't require a divergence)
            txtLogger.log(`Only checking crash order condition per trading pair during pause.`);

            this.tradingBot.botPauseActive = true;
            this.currentPauseTimeInCandles--;
        } else {
            this.tradingBot.botPauseActive = false;
        }

        await this.tradingBot.runProgram();

    }.bind(this));

    private forceBuyOrderJob: schedule.Job = new schedule.Job(async function () {
        txtLogger.log(`---------- Program started in ForceBuyOrder mode ---------- `);

        await this.tradingBot.forceBuyOrder();

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
            txtLogger.log('Main already in progress, skipping...');
            return;
        }

        this.inProgress = true; 
        txtLogger.log('App is running');

        // setup
        const cronExpression = CronHelper.GetCronExpression();
        const wsService: WebSocketService = new WebSocketService(); 
        this.websocketKey = wsService.websocketKey;
        this.websocketClient = wsService.generateWebsocketClient();
        this.tradingBot = new Tradingbot() // todo aram I don't like that the trading bot (or somethinf CALLED trading bot) is only created now

        txtLogger.log('Subscribing to webSocketClient');
        
        this.websocketClient.subscribeSpotUserDataStream();

        // Retreive some config values
        this.websocketClient.on('open', async (data: {
            wsKey: WsKey;
            ws: WebSocket;
            event?: any;
        }) => {
            // Sanity check the config.json.
            // todo aram maybe do config importer stuff here? Downside is the config won't be loaded and visible in the UI before you hit start
            // todo aram on second thought the on subscribe of the websocket is actually a terrible place to do this i think
            const incorrectConfigData: boolean = configChecker.checkConfigData();
            if (incorrectConfigData) {
                txtLogger.log(`The websocket() quit because:`);
                txtLogger.log(`The method checkConfigData() detected wrong config values`);
                return;
            }
            txtLogger.log(`*** config.json is equal to:  ${JSON.stringify(config)}`);
            txtLogger.log(`Websocket event - connection opened:', ${data.wsKey}`);

            txtLogger.log(`Running job scheduled according to cron expression `)
            this.job.schedule(cronExpression);

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

    public async ForceBuyOrderTest() {
        // todo aram double check if the in progress check is still relevant for the forceBuyOrderTest
        if (this.inProgress) {
            txtLogger.log('Main already in progress, skipping...');
            return;
        }

        this.inProgress = true; 
        txtLogger.log('App is running in Force Buy Order mode');

        // setup
        const wsService: WebSocketService = new WebSocketService(); 
        this.websocketKey = wsService.websocketKey;
        this.websocketClient = wsService.generateWebsocketClient();
        this.tradingBot = new Tradingbot() // todo aram I don't like that the trading bot (or something CALLED trading bot) is only created now

        txtLogger.log('Subscribing to webSocketClient');
        
        this.websocketClient.subscribeSpotUserDataStream();
        this.websocketClient.on('open', async (data: {
            wsKey: WsKey;
            ws: WebSocket;
            event?: any;
        }) => {
            // Sanity check the config.json.
            // todo aram maybe do config importer stuff here? Downside is the config won't be loaded and visible in the UI before you hit start
            // todo aram actually on second thought, I'm not sure if the "on subscribe" of the websocketclient is at all a good place to handle the config
            const incorrectConfigData: boolean = configChecker.checkConfigData();
            if (incorrectConfigData) {
                txtLogger.log(`The method checkConfigData() detected wrong config values`);
                return;
            }
            txtLogger.log(`*** config.json is equal to:  ${JSON.stringify(config)}`);
            txtLogger.log(`Websocket event - connection opened:', ${data.wsKey}`);
    
            this.forceBuyOrderJob.invoke();
        });

        // todo aram not sure if the below is interesting for forced buy order mode, we only care about putting in the order right?
        // not the oco order part. Maybe add a param to toggle the option to also place an oco.
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
