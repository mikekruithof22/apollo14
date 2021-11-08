import config from '../../config';
import txtLogger from './txt-logger';

export default class ConfigSanityCheck {

    public static checkConfigData = () => {
        let message = `----- Roger Ver wants to say someting: -----`;
        let closeProgram = false;

        if (config.production.maxAllowedActiveOrdersForTraidingPair > 5) {
            message += `
            ERROR: The config value:
                'maxAllowedActiveOrdersForTraidingPair' 
            cannot be higher than 5. Because Binance does not allow more then that.`;
        }

        if (config.emailRecipient.indexOf('@') === -1 ) {
            message += `
            ERROR: The config value:
                'emailRecipient' 
            does not contain a valid email address.`;
        }

        if (message.includes('ERROR')) {
            message += `
            The program closed after the config.json file was checked.
            Don't forget to buy the REAL Bitcoin!
            ------------------------------------------------`;
            closeProgram = true;
            txtLogger.writeToLogFile(message);
        }

        return closeProgram;
    }
}
