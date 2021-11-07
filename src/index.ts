import express from "express";
import txtLogger from './helpers/txt-logger';
import Main from './main';

const app = express();
// const port = 3000; // default port to listen
const port = process.env.PORT || 3000;
const main = new Main();

// define a route handler for the default home page
app.get( "/", ( req, res ) => {
    res.send( "Hello world! This is a TypeScript Node application running in Azure!" );
    txtLogger.log("Hello file logger world");
});

app.get( "/start", ( req, res ) => {
    res.send( "Start endpoint called!" );
    txtLogger.log("Starting app through start endpoint");
    main.Start();
});

app.get( "/stop", ( req, res ) => {
    res.send( "Stop endpoint called!" );
    txtLogger.log("Stopping app through stop endpoint");
    main.Stop();
});

app.get( "/test", ( req, res ) => {
    res.send( `Test endpoint called`);
    txtLogger.log("Test endpoint called");
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
});