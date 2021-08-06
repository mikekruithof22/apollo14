const fs = require('fs');

const writeToLogFile = (message, logLevel = 'INFO') => {
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

module.exports = {
    generateFilePath,
    writeToLogFile
}