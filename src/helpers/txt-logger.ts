import { LogLevel } from "../models/log-level";

const fs = require('fs');

export default class RsiCalculator {
    public static writeToLogFile = (message, logLevel = LogLevel.INFO) => {
        const fileLocation = RsiCalculator.generateFilePath();
        const date = new Date();
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

    public static generateFilePath = () => {
        const directoryName = 'production-logs';
        if (!fs.existsSync(`./${directoryName}`)) {
            fs.mkdir(`./${directoryName}`, (err) => {
                if (err) throw err;
            });
        }

        const date = new Date();
        const fileName = `log - ${date.toLocaleDateString()}`;
        const filePath = `./${directoryName}/${fileName}.txt`;
        return filePath;
    }

    // const LogLevel = {
    //     INFO: 'INFO',
    //     DEBUG: 'DEBUG',
    //     TRACE: 'TRACE',
    //     NOTICE: 'NOTICE',
    //     WARN: 'WARN',
    //     ERROR: 'ERROR',
    //     FATAL: 'FATAL'
    // }
}
// module.exports = {
//     generateFilePath,
//     writeToLogFile,
//     LogLevel
// }