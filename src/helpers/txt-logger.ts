import { LogLevel } from "../models/log-level";

const fs = require('fs');

export default class TextLogger {
    public static writeToLogFile = (message: string, logLevel = LogLevel.INFO): string => {
        console.log(message);
        
        const fileLocation: string = TextLogger.generateFilePath();
        const date: Date = new Date();
        message = `\n ${logLevel} - ${date.toUTCString()} - ${message}`;

        if (message.includes('Program started')) {
            message = `\n\n ${message}`;
        }

        if (message.includes('Starting ordering logic method')) {
            message = `\n ${message} \n`;
        }


        return fs.appendFileSync(`${fileLocation}`, `${message}`)
    }

    public static generateFilePath = (): string => {
        const directoryName = 'production-logs';
        if (!fs.existsSync(`./${directoryName}`)) {
            console.log("production-logs directory not found, creating directory...");

            fs.mkdir(`./${directoryName}`, (err: any) => {
                if (err) throw err;
                console.log("production logs directory created");
            });
        }

        const date: Date = new Date();
        // todo aram not sure but I think the month is one off
        const fileName: string = `log-${date.getDate()}-${date.getMonth()}-${date.getFullYear()}`;
        const filePath: string = `./${directoryName}/${fileName}.txt`;
        return filePath;
    }
}