import * as nodemailer from 'nodemailer';

import config from '../../config';
import txtLogger from './txt-logger';

require('dotenv').config();

const userName = process.env.EMAIL_USERNAME;
const password = process.env.EMAIL_PASSWORD;

const recipient = config.emailRecipient;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: userName,
        pass: password
    }
});

export default class Mailer {
    public static Send(subject: string = 'The bot is down', text: string = 'The bot is down for unspecified reasons, please check the logs' ) {
        const mailOptions = {
            from: 'Apollo',
            to: recipient,
            subject: subject,
            text: text
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                txtLogger.log(`Unable to send email from ${userName} to ${recipient}`);
                txtLogger.log(error.message);
            } 
            else {
                txtLogger.log(`Email succesfully sent from ${userName} to ${recipient}`);
            }
        });
    }
}
