const fs = require('fs');

const writeToLogFile = (message, logLevel = LogLevel.INFO) => {
    const fileLocation = generateFilePath();
    const date = new Date();
    message = `\n ${logLevel} - ${date.toGMTString()} - ${message}`;

    if (message.includes('Program started')) {
        message = `\n\n ${message}`;
    }
    return fs.appendFileSync(`${fileLocation}`, `${message}`)
}

const generateFilePath = () => {
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

const LogLevel = {
    INFO: 'INFO',
    DEBUG: 'DEBUG',
    TRACE: 'TRACE',
    NOTICE: 'NOTICE',
    WARN: 'WARN',
    ERROR: 'ERROR',
    FATAL: 'FATAL'
}

module.exports = {
    generateFilePath,
    writeToLogFile,
    LogLevel
}