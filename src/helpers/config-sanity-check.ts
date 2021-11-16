import config from '../../config';
import txtLogger from './txt-logger';

export default class ConfigSanityCheck {

    public static checkConfigData = () => {
        let message: string = `\n\n ----- Roger Ver wants to say someting about your config.json: -----.\n`;
        let closeProgram: boolean = false;

        if (config.production.maxAllowedActiveOrdersForTraidingPair > 5) {
            message += `
            ERROR: The config value:
                'maxAllowedActiveOrdersForTraidingPair' 
            cannot be higher than 5. Because Binance does not allow more then that.\n`;
        }

        if (config.generic.emailRecipient.indexOf('@') === -1) {
            message += `
            ERROR: The config value:
                'emailRecipient' 
            does not contain a valid email address.\n`;
        }

        if (config.production.minimumUSDTorderAmount < 25) {
            message += `
            NOTICE: It is highly recommended to make sure that the:
                'minimumUSDTorderAmount' 
            is higher than 25 USDT.
            REASON: The lower the order amount the higer the chance that an price - like OCO stoploss or stoplimit price will be lower than 10. Binance will reject orders with values lower than 10.\n`;
        }

        if (config.test.devTest.triggerBuyOrderLogic === true) {
            message += `
            NOTICE: You are executing a development test because:
                'triggerBuyOrderLogic' 
           is equal to true.\n`;
        }

        let orderCondtionNamesToWarnAbout: string;
        config.orderConditions.forEach(condition => {
            if (condition.order.maxUsdtBuyAmount < 25) {
                orderCondtionNamesToWarnAbout = `${condition.name} - `
            }
            condition.order.maxUsdtBuyAmount
        });

        if (orderCondtionNamesToWarnAbout && orderCondtionNamesToWarnAbout.length > 0) {
            message += `
            NOTICE: It is highly recommended to make sure that the:
                'maxUsdtBuyAmount' 
             is higher than 25 USDT for the following OrderConditions:
                ${orderCondtionNamesToWarnAbout}
            REASON: The lower the order amount the higer the chance that an price - like OCO stoploss or stoplimit price will be lower than 10. Binance will reject orders with values lower than 10.\n`;
        }

        if (config.production.largeCrashOrder.active === true && config.generic.emailRecipient.includes('mikekruithof')) {
            message += 
            `ERROR: Mike wants to make sure that: 
                'largeCrashOrder.active'
            is equal to false. Therfore, quit the program just for him.\n`;
        }


        if (message.includes('ERROR')) {
            message += `
            **********************************************************
            The program closed after the config.json file was checked!
            Don't forget to buy the REAL Bitcoin! 
            **********************************************************.\n`;
            closeProgram = true;
        }

        if (message.includes('ERROR') || message.includes('NOTICE')) {
            txtLogger.writeToLogFile(message);
        }

        return closeProgram;
    }
}
