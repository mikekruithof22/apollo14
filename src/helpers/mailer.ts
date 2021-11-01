import * as nodemailer from 'nodemailer';
import txtLogger from './txt-logger';

const userName = "apollo1111tothemoon@gmail.com";
const password = "notaprophet";
const recipient = "a.gulzadian@gmail.com";

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
    user: userName,
    pass: password
    }
});

const mailOptions = {
    from: 'The Idea project',
    to: recipient,
    subject: 'Bitcoin is crashing',
    text: "Lorem ipsum dolor sit amet"
};

export default class mailer {

    public static Send = () => {
        txtLogger.writeToLogFile(`Foobar ${userName} - ${password} - ${recipient}`);

        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                txtLogger.writeToLogFile(`Unable to send email from ${userName} to ${recipient}`);
                txtLogger.writeToLogFile(error.message);
            } 
            else {
                txtLogger.writeToLogFile(`Email succesfully sent from ${userName} to ${recipient}`);
            }
        });
    }
}
