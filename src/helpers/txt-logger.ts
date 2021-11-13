import { LogLevel } from "../models/log-level";
import Mailer from "./mailer";
import config from '../../config';

const fs = require('fs');

export default class TextLogger {
    public static writeToLogFile = (message: string, logLevel = LogLevel.INFO): string => {
        const fileLocation: string = TextLogger.generateFilePath();
        const date: Date = new Date();
        if (message.includes('Program started') || message.includes('*** config.json is equal to')) {
            message = `\n\n ${logLevel} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()} - ${message}`;
        } else {
            message = `\n ${logLevel} - ${date.toLocaleTimeString()} - ${message}`;
        }

        if ((logLevel === LogLevel.ERROR || logLevel === LogLevel.FATAL) &&
            config.test.devTest.triggerBuyOrderLogic === false) {
            const emailMessage: string = `The last log line includes a line with an error (LogLevel.ERROR). The error message is as follows: 
                                        
            ${message}
                                        
            NOTE: This does not automaticly mean that the bot is switched off. It might still continue to run.`;
            Mailer.Send('Last log line contains an error', emailMessage);
        }

        console.log(message);

        return fs.appendFileSync(`${fileLocation}`, `${message}`)
    }

    public static generateFilePath = (): string => {
        const directoryName = 'production-logs';
        if (!fs.existsSync(`./${directoryName}`)) {
            fs.mkdir(`./${directoryName}`, (err) => {
                if (err) throw err;
            });
        }

        const date: Date = new Date();
        const fileName: string = `log - ${date.toLocaleDateString()}`;
        const filePath: string = `./${directoryName}/${fileName}.txt`;
        return filePath;
    }
}