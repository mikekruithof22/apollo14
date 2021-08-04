const checkConfigData = (config) => {
    let message = `----- Roger Ver wants to tell you someting: -----`;
    let closeProgram = false;

    if (config.production.enableCreateOrders === true && config.test.testWithHistoricalData === true) {
        message += `
                    ERROR: The config values 
                    "enableCreateOrders" and "testWithHistoricalData" 
                    are not allowed to be both true. `;
        closeProgram = true;
    }

    if (config.test.realTimeTest === true && config.test.testWithHistoricalData === true) {
        message += `
                ERROR: The config values 
                "realTimeTest" and "testWithHistoricalData" 
                are not allowed to be both true. `;
        closeProgram = true;
    }

    if (message.includes('ERROR')) {
        message += `
        The program closed after the config.json file was checked.
        Don't forget to buy the REAL Bitcoin!
        ------------------------------------------------`;
    }

    return {
        message,
        closeProgram
    };
}

module.exports = {
    checkConfigData
};
