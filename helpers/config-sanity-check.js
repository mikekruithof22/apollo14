const checkConfigData = (config, isTest = false) => {
    let message = `----- Roger Ver wants to say someting: -----`;
    let closeProgram = false;

    if (config.production.active === true && config.test.testWithHistoricalData === true) {
        message += `
                    ERROR: The config values 
                    "production.active" and "testWithHistoricalData" 
                    are not allowed to be both true. `;
    }

    if (isTest && config.test.testWithHistoricalData === false) {
        message += `
            ERROR: The config value
            'testWithHistoricalData' 
            is not equal to true therefor the program will quit. `;
    }

    const totalPercentageCountConfigured = calcTotalPercentageAmountOffOrders(config.orderConditions);

    if (totalPercentageCountConfigured > 100) {
        message += `
            ERROR: The total amount off all 
            'maxPercentageOffBalance' values is larger than 100%.
            The current total is right now: ${totalPercentageCountConfigured}%.`;
        closeProgram = true;
    }

    if (message.includes('ERROR')) {
        message += `
        The program closed after the config.json file was checked.
        Don't forget to buy the REAL Bitcoin!
        ------------------------------------------------`;
        closeProgram = true;
        console.log(message);
    }

    return {
        message,
        closeProgram
    };
}

const calcTotalPercentageAmountOffOrders = (orderConditions) => {
    let count = 0;
    for (let order of orderConditions) {
        count = count + order.order.maxPercentageOffBalance;
    }
    return count;
}

module.exports = {
    checkConfigData
};
