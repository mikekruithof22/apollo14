import { LogLevel } from "../models/log-level";

const fs = require('fs');

export default class RsiCalculator {
    public static writeToLogFile = (message: string, logLevel = LogLevel.INFO): string => {
        const fileLocation: string = RsiCalculator.generateFilePath();
        const date: Date = new Date();
        message = `\n ${logLevel} - ${date.toUTCString()} - ${message}`;

        if (message.includes('Program started')) {
            message = `\n\n ${message}`;
        }

        if (message.includes('Starting ordering logic method')) {
            message = `\n ${message} \n`;
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