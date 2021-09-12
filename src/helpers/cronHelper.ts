import { StaticKeyword } from 'typescript';
import config from '../../config';

const configInterval: string = config.orderConditions[0].interval;
const tradingBotInterval = configInterval.slice(0, -1);
const cronExpression = '*/' + tradingBotInterval + ' * * * *';

console.log('cronExpression = ' + cronExpression);

export default class CronHelper {
    public static GetCronExpression() {
        return cronExpression;
    }
}

