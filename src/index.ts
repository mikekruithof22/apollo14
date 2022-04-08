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
    txtLogger.log("Hello world! Root endpoint was called");
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

app.get( "/state", ( req, res ) => {
    main.GetState().then( state => {
        res.send( `State check endpoint called: ${state}`);
        txtLogger.log(`State endpoint called: ${state}`); 
    });
});

app.get( "/test", ( req, res ) => {
    res.send( `Test endpoint called`);
    txtLogger.log("Test endpoint called");
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
    // todo aram maybe this is the right place for the config checker
});

// todo aram after merge some from main was excluded, after refactoring make sure those things are included here again:
// - run in test mode
// - config sanity checker
// - bot pauser functionality