export default class ConfigSanityCheck {
    public static checkConfigData = (config, isTest = false) => {
        let message = `----- Roger Ver wants to say someting: -----`;
        let closeProgram = false;


        if (isTest && config.test.testWithHistoricalData === false) {
            message += `
            ERROR: The config value
            'testWithHistoricalData' 
            is not equal to true therefor the program will quit. `;
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
}
