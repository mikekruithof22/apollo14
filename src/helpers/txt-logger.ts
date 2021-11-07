import { LogLevel } from "../models/log-level";

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