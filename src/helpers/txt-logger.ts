import { LogLevel } from "../models/log-level";

const fs = require('fs');

export default class TextLogger {
    public static log = (message: string, logLevel = LogLevel.INFO): string => {
        console.log(message);
        
        const fileLocation: string = TextLogger.generateFilePath();
        const date: Date = new Date();
        if (message.includes('Program started') || message.includes('*** config.json is equal to')) {
            message = `\n\n ${logLevel} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()} - ${message}`;
        } else {
            message = `\n ${logLevel} - ${date.toLocaleTimeString()} - ${message}`;
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