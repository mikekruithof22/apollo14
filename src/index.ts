import express from "express";
import txtLogger from './helpers/txt-logger';
import Main from './main';

const app = express();
// const port = 3000; // default port to listen
const port = process.env.PORT || 3000;

// define a route handler for the default home page
app.get( "/", ( req, res ) => {
    res.send( "Hello world! This is a TypeScript Node application running in Azure!" );
    console.log("Hello console logger world");
    txtLogger.writeToLogFile("Hello file logger world");
});

app.get( "/start", ( req, res ) => {
    res.send( "Starting app!" );
    txtLogger.writeToLogFile("Starting app through start endpoint");
    Main.Start();
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
});