const checkConfigData = (config) => {
    let message = `----- Mike Kruithof wants to tell you someting: -----`;
    let closeProgram = false;

    if (config.enableCreateOrders === true && config.test.testWithHistoricalData === true) {
        message += `
                    ERROR: The config values 
                    "enableCreateOrders" and "testWithHistoricalData" 
                    are not allowed to be both true. `;
        closeProgram = true;
    }

    if (message.includes('ERROR')) {
        message += `
        The program closed after the config.json file was checked.`;
    }

    return {
        message,
        closeProgram
    };
}

module.exports = {
    checkConfigData
};
