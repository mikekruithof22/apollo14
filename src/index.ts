import * as schedule from "node-schedule";
import config from '../config';
import Tradingbot from './tradingbot';

// app.listen(app.get("port"), () => {
//     console.log(("App is running"), app.get("env"));
    console.log("App is running");
    const configInterval: string = config.orderConditions[0].interval;
    const tradingBotInterval = configInterval.slice(0, -1);
    const cronExpression = '*/' + tradingBotInterval + ' * * * *';

    console.log('cronExpression = ' + cronExpression);
    
    schedule.scheduleJob(cronExpression, async function () {
        var tradingBot = new Tradingbot();
        await tradingBot.runProgram();
    });
// });

// app.on('close', () => {
//     console.log("App is Closing");
//     app.removeAllListeners();
// });

// const tradingBot = new Tradingbot();
// tradingBot.runProgram();
