import { StaticKeyword } from 'typescript';
import config from '../../config';

const configInterval: string = config.generic.timeIntervals[0]; // For the time being only one interval, therefore [0].
const tradingBotInterval = configInterval.slice(0, -1);
const cronExpression = '*/' + tradingBotInterval + ' * * * *';

console.log('cronExpression = ' + cronExpression);

export default class CronHelper {
    public static GetCronExpression() {
        return cronExpression;
    }
}

