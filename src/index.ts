import express from "express";
import Tradingbot from './tradingbot';
import * as schedule from "node-schedule";
export const app = express();

app.listen(app.get("port"), () => {
    console.log(("App is running"), app.get("env"));
    schedule.scheduleJob("*/30 * * * *", async function () {
        var tradingBot = new Tradingbot();
        await tradingBot.runProgram();
    });
});

app.on('close', () => {
    console.log("App is Closing");
    app.removeAllListeners();
});
