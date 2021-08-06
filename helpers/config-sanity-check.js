const checkConfigData = (config) => {
    let message = `----- Roger Ver wants to tell you someting: -----`;
    let closeProgram = false;

    if (config.production.active === true && config.test.testWithHistoricalData === true) {
        message += `
                    ERROR: The config values 
                    "production.active" and "testWithHistoricalData" 
                    are not allowed to be both true. `;
        closeProgram = true;
    }

    if (config.production.active === true && config.test.realTimeTest === true) {
        message += `
                    ERROR: The config values 
                    "production.active" and "realTimeTest" 
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

    const totalPercentageCountConfigured = calcTotalPercentageAmountOffOrders(config.orderConditions);

    if (totalPercentageCountConfigured > 100) {
        message += `
            ERROR: The total amount off all 
            'maxPercentageOffBalance' values is larger 100%.
            The current total is right now: ${totalPercentageCountConfigured}%.`;
        closeProgram = true;
    }

    if (closeProgram === true) {
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

const calcTotalPercentageAmountOffOrders = (orderConditions) => {
    let count = 0;
    for (let order of orderConditions) {
        count = count + order.stopLossOrder.maxPercentageOffBalance;
    }
    console.log('----------- count die we returnen ------------');
    console.log(count);
    return count;

}

module.exports = {
    checkConfigData
};
