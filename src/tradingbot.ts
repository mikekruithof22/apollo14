import { AllCoinsInformationResponse, ExchangeInfo, MainClient, OrderBookResponse, OrderResponseFull, SpotOrder, SymbolExchangeInfo, SymbolFilter, SymbolLotSizeFilter, SymbolPriceFilter, WsUserDataEvents } from 'binance';
import { AmountAndPrice, ConfigOrderCondition } from './models/logic';
import { ClosePrice, LightWeightCandle } from './models/candle';
import { OrderStatusEnum, OrderTypeEnum } from './models/order';

import { ActiveBuyOrder } from './models/trading-bot';
import BinanceService from './binance/binance';
import { BullishDivergenceResult } from './models/calculate';
import CandleHelper from './helpers/candle';
import { LogLevel } from './models/log-level';
import Order from './binance/order';
import calculate from './helpers/calculate';
import config from '../config';
import configChecker from './helpers/config-sanity-check';
import exchangeLogic from './binance/logic';
import rsiHelper from './helpers/rsi';
import txtLogger from './helpers/txt-logger';

export default class Tradingbot {
    private activeBuyOrders: ActiveBuyOrder[] = [];
    private activeOcoOrdersIds: string[] = [];
    private binanceRest: MainClient;
    private binanceService: BinanceService;
    private candleHelper: CandleHelper;
    private order: Order;

    constructor() {
        this.binanceService = new BinanceService();
        this.candleHelper = new CandleHelper();
        this.order = new Order();
        this.binanceRest = this.binanceService.generateBinanceRest();
    }

    /*
    TODO: hier nog over nadenken!
        1. Wat te doen als de buy order niet in een keer afgaat? 
            a. cancelen na x aantal seconden & opnieuw? 
                i. daarna cancellen? 
        2. TestMike todo dingen uit de code doorgaan. 
    */
    public async runProgram() {
        let foundAtLeastOneBullishDivergence: boolean = false;

        // STEP 1 - Sanity check the config.json.
        txtLogger.writeToLogFile(`---------- Program started ---------- `);

        const configCheck = configChecker.checkConfigData(config, true);
        if (configCheck.closeProgram === true) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(configCheck.message, LogLevel.ERROR);
            return;
        }

        // STEP 2 - Prepare configuration data.
        const brokerApiUrl: string = config.brokerApiUrl;
        const numberOfCandlesToRetrieve: number = config.production.numberOfCandlesToRetrieve + config.orderConditions[0].calcBullishDivergence.numberOfMaximumIntervals;
        const orderConditions: any[] = config.orderConditions;
        const minimumUSDTorderAmount: number = config.production.minimumUSDTorderAmount;
        const triggerBuyOrderLogic: boolean = config.production.devTest.triggerBuyOrderLogic;
        const candleInterval: string = config.timeIntervals[0]; // For the time being only one interval, therefore [0].
        const tradingPairs: string[] = config.tradingPairs;
        const rsiCalculationLength: number = config.genericOrder.rsiCalculationLength;

        if (this.binanceRest === undefined) {
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`Generating binanceRest failed.`, LogLevel.ERROR);
            return;
        }

        // STEP 3 - Retrieve RSI & calculate bullish divergence foreach trading pair
        txtLogger.writeToLogFile(`Checking bullish divergence for each of the ${orderConditions.length} order condition(s)`);

        for await (let tradingPair of tradingPairs) {

            const url: string = `${brokerApiUrl}api/v3/klines?symbol=${tradingPair}&interval=${candleInterval}&limit=${numberOfCandlesToRetrieve}`;
            txtLogger.writeToLogFile(`Retrieving candles from Binance url`);
            txtLogger.writeToLogFile(url);

            const candleList = await this.candleHelper.retrieveCandles(url);
            const candleObjectList: LightWeightCandle[] = this.candleHelper.generateSmallObjectsFromData(candleList);
            const closePriceList: ClosePrice[] = this.candleHelper.generateClosePricesList(candleList);
            txtLogger.writeToLogFile(`RSI calculation lenght is equal to ${rsiCalculationLength}`);
            const rsiCollection = await rsiHelper.calculateRsi(closePriceList, rsiCalculationLength);

            for await (let order of orderConditions) {
                const orderConditionName: string = `${tradingPair}-${order.name}`;
                txtLogger.writeToLogFile(`Evaluating order condition for: ${orderConditionName}`);

                if (triggerBuyOrderLogic === true) { // use ONLY for testing purposes!
                    txtLogger.writeToLogFile(`Skipping the retrieve candle from server part. Test instead immediately`);
                    this.buyOrderingLogic(
                        order,
                        minimumUSDTorderAmount,
                        tradingPair,
                        orderConditionName
                    );
                    return;
                }

                const rsiMinimumRisingPercentage: number = order.rsi.minimumRisingPercentage;
                const candleMinimumDeclingPercentage: number = order.candle.minimumDeclingPercentage;
                const startCount: number = order.calcBullishDivergence.numberOfMinimumIntervals;
                const stopCount: number = order.calcBullishDivergence.numberOfMaximumIntervals;

                const bullishDivergenceCandle: BullishDivergenceResult = calculate.calculateBullishDivergence(
                    closePriceList,
                    candleObjectList,
                    rsiCollection,
                    startCount,
                    stopCount,
                    rsiMinimumRisingPercentage,
                    candleMinimumDeclingPercentage,
                    orderConditionName
                );

                if (bullishDivergenceCandle !== undefined) {
                    foundAtLeastOneBullishDivergence = true;

                    txtLogger.writeToLogFile(`Bullish divergence detected for: ${orderConditionName}. Next step will be the buyOrderingLogic() method`);
                    txtLogger.writeToLogFile(`Candle one: ${bullishDivergenceCandle.startWithCandle}, RSI one:${bullishDivergenceCandle.endiRsiValue}`);
                    txtLogger.writeToLogFile(`Candle two: ${bullishDivergenceCandle.endingCandle}, RSI two:${bullishDivergenceCandle.endiRsiValue}`);
                    txtLogger.writeToLogFile(`More detailed information can be found below:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(bullishDivergenceCandle)}`);
                    // STEP 4. 
                    //      OPTIE I - A bullish divergence was found, continue to the ordering logic method.
                    this.buyOrderingLogic(
                        order,
                        minimumUSDTorderAmount,
                        tradingPair,
                        orderConditionName
                    );
                } else {
                    txtLogger.writeToLogFile(`No bullish divergence detected for: ${orderConditionName}.`);
                }
            };
        }

        if (foundAtLeastOneBullishDivergence === false) {
            // STEP 4. 
            //      OPTIE II  - Close the program & websocket because no bullish divergence(s) where found this time.
            txtLogger.writeToLogFile(`Program quit because:`);
            txtLogger.writeToLogFile(`No bullish divergence(s) where found during this run.`);

            return;
        }
    }

    public async buyOrderingLogic(
        order: ConfigOrderCondition,
        minimumUSDTorderAmount: number,
        tradingPair: string,
        orderName: string
    ) {
        txtLogger.writeToLogFile(`Starting ordering logic method()`);

        // STEP I. Prepare config.json order data 
        const takeProfitPercentage: number = order.order.takeProfitPercentage;
        const takeLossPercentage: number = order.order.takeLossPercentage;
        const maxUsdtBuyAmount: number = order.order.maxUsdtBuyAmount;
        const maxPercentageOffBalance: number = order.order.maxPercentageOffBalance;

        // STEP II. Cancel all open buy orders.
        const currentOpenOrders = await this.binanceService.retrieveAllOpenOrders(this.binanceRest, tradingPair);
        txtLogger.writeToLogFile(`Current open orders length is equal to: ${(currentOpenOrders as SpotOrder[]).length}`);
        txtLogger.writeToLogFile(`Current open order details: ${JSON.stringify(currentOpenOrders)}`);
        if ((currentOpenOrders as SpotOrder[]).length >= 1) {
            for await (let order of (currentOpenOrders as SpotOrder[])) {
                if (order.side === 'BUY') {
                    const openBuyOrder = await this.binanceService.cancelOrder(this.binanceRest, tradingPair, order.orderId);
                    txtLogger.writeToLogFile(`Canceled open BUY - clientOrderId: ${order.clientOrderId} - with the following details:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(openBuyOrder)}`);

                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === order.clientOrderId);
                    if (index > -1) {
                        this.activeBuyOrders.splice(index, 1);
                    }
                }
            }
        }

        // STEP III. Check current amount off free USDT on the balance.
        const balance = await this.binanceService.getAccountBalances(this.binanceRest);
        const currentUSDTBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === 'USDT');
        const currentFreeUSDTAmount = parseFloat(currentUSDTBalance.free.toString());
        txtLogger.writeToLogFile(`Current free USDT amount on the balance is equal to: ${currentFreeUSDTAmount}`);

        if (currentFreeUSDTAmount < minimumUSDTorderAmount) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Current free USDT trade amount is: ${currentFreeUSDTAmount}. That is lower than the configured amount: ${minimumUSDTorderAmount}.`);
            return;
        }

        // STEP IV. Determine how much you can spend at the next buy order based on the order book.
        const amountOffUSDTToSpend = exchangeLogic.calcAmountToSpend(currentFreeUSDTAmount, maxUsdtBuyAmount, maxPercentageOffBalance);
        txtLogger.writeToLogFile(`The allocated USDT amount for this order is equal to: ${amountOffUSDTToSpend}`);

        const symbol: string = `symbol=${tradingPair}`; // workaround, npm package sucks
        const exchangeInfo = await this.binanceService.getExchangeInfo(this.binanceRest, symbol) as ExchangeInfo;

        if (exchangeInfo === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`getExchangeInfo() method failed.`, LogLevel.ERROR);
            return;
        }

        const symbolResult: SymbolExchangeInfo = exchangeInfo.symbols.find(r => r.symbol === tradingPair);

        if (symbolResult === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`symbolResult was undefined .`, LogLevel.ERROR);
            return;
        }

        const lotSize: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'LOT_SIZE') as SymbolLotSizeFilter;
        const priceFilter: SymbolFilter = symbolResult.filters.find(f => f.filterType === 'PRICE_FILTER') as SymbolPriceFilter;

        const stepSize: number = exchangeLogic.determineStepSize(lotSize);
        const minimumOrderQuantity: number = exchangeLogic.determineMinQty(lotSize);
        const tickSize: number = exchangeLogic.determineTickSize(priceFilter);

        txtLogger.writeToLogFile(`Trying to create a limit buy order`);
        txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
        txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

        // STEP V. Retrieve bid prices.
        const currentOrderBook = await this.binanceService.getOrderBook(this.binanceRest, tradingPair);
        const currentOrderBookBids = exchangeLogic.bidsToObject((currentOrderBook as OrderBookResponse).bids);
        const orderPriceAndAmount: AmountAndPrice = exchangeLogic.calcOrderAmountAndPrice(
            currentOrderBookBids, 
            amountOffUSDTToSpend, 
            stepSize 
        );
        const orderPrice: number = orderPriceAndAmount.price;
        const orderAmount: number = orderPriceAndAmount.amount;
        const totalUsdtAmount: number = orderPriceAndAmount.totalUsdtAmount;

        if (orderAmount < minimumOrderQuantity) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`Order quantity is lower than - ${orderAmount} - the minimum order quanity: ${minimumOrderQuantity}`);
            return;
        }

        txtLogger.writeToLogFile(`Based on the order book the following order will be (very likely) filled immediately:`);
        txtLogger.writeToLogFile(`Price: ${orderPrice}. Amount: ${orderAmount}`);
        txtLogger.writeToLogFile(`Total USDT value of the order is equal to: ${totalUsdtAmount}`);

        // STEP VI. Create the buy order and add it to the activeBuyOrders array.
        const buyOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITBUY, tradingPair, orderAmount, orderPrice) as OrderResponseFull;
        if (buyOrder === undefined) {
            txtLogger.writeToLogFile(`Buy ordering logic is cancelled because:`);
            txtLogger.writeToLogFile(`There was an error creating the buy order`, LogLevel.ERROR);
            return;
        }
        txtLogger.writeToLogFile(`Buy order created. Details:`);
        txtLogger.writeToLogFile(`Status: ${buyOrder.status}, orderId: ${buyOrder.orderId}, clientOrderId: ${buyOrder.clientOrderId}, price: ${buyOrder.price}`);

        if (buyOrder.status === OrderStatusEnum.PARTIALLY_FILLED ||
            buyOrder.status === OrderStatusEnum.NEW ||
            buyOrder.status === OrderStatusEnum.FILLED
        ) {
            const currentBuyOrder: ActiveBuyOrder = {
                clientOrderId: buyOrder.clientOrderId,
                orderName: orderName,
                takeProfitPercentage: takeProfitPercentage,
                takeLossPercentage: takeLossPercentage,
                minimumOrderQuantity: minimumOrderQuantity,
                stepSize: stepSize,
                tickSize: tickSize
            }
            this.activeBuyOrders.push(currentBuyOrder);
        }
    }

    public async processFormattedUserDataMessage(data: WsUserDataEvents) {
        if (data.eventType === 'executionReport' && data.orderStatus === OrderStatusEnum.FILLED) {
            const clientOrderId: string = data.newClientOrderId;

            txtLogger.writeToLogFile(`FOOBAR ARAM`);
            txtLogger.writeToLogFile(JSON.stringify(data, null, 4));


            // POSSIBILITY I - When a buy order is FILLED an oco order should be created.
            if (data.orderType === 'LIMIT' && data.side === 'BUY' && data.orderStatus === OrderStatusEnum.FILLED) {
                const buyOrder: ActiveBuyOrder = this.activeBuyOrders.find(b => b.clientOrderId === clientOrderId);
                txtLogger.writeToLogFile(`Limit buy order with clientOrderId: ${clientOrderId} and order name: ${buyOrder.orderName} is filled`);

                const stepSize: number = buyOrder.stepSize;
                const tickSize: number = buyOrder.tickSize;

                const profitPrice: number = exchangeLogic.calcProfitPrice(Number(data.price), buyOrder.takeProfitPercentage, tickSize);
                const stopLossPrice: number = exchangeLogic.calcStopLossPrice(Number(data.price), buyOrder.takeLossPercentage, tickSize);
                const stopLimitPrice: number = exchangeLogic.callStopLimitPrice(stopLossPrice, tickSize);

                /*
                    TODO: ARAM hiero verder gaan. 


                        FUNCTIONELE UITLEG: 
                            0. Login bij Binance en zorg dat je minimaal 15 dollar vrij te bestenden USDT hebt 
                                TIP: per test run je coins weer inwisselen naar USDT

                            1.  
                                a.production.devTest.triggerBuyOrderLogic = true (in de config.json)
                                (je gaat nu automatisch een buy order inleggen en zodra die gevuld gaat de methode waarin dit commentaar staat af)
                                b.  "tradingPairs": ["DOTUSDT"] 
                                (per test maar een item, anders koop je te veel!)




                            2. Urls die je altijd open moet hebben staan: 
                            https://www.npmjs.com/package/binance
                            https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
                            https://binance-docs.github.io/apidocs/spot/en/#change-log

                            3. Dit stuk van de code legt een oco order in nadat een limit buy gevuld is.

                            4. Kijk in de map 'production-logs' en filter op: 
                                Creating OCO order

                                VOORBEELD VAN DE LOG WAAR JE ZELF IEDER KEER MOET KIJKEN. 

                                INFO - Tue, 05 Oct 2021 14:35:32 GMT - Trying to create an OCO order
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - The oco order amount is equal to: 13.4
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - The step size - which will be used in order to calculate the the amount - is: 1
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - The tick size - which will be used in order to calculate the the price - is: 3
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - Creating OCO order. Symbol: ADAUSDT orderAmount: 13.4 profitPrice: 2.222 stopLossPrice: 2.09 stopLimitPrice: 2.069
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - Try to create an OCO with the following options: {"symbol":"ADAUSDT","side":"SELL","quantity":13.4,"price":2.222,"stopPrice":2.09,"stopLimitPrice":2.069,"stopLimitTimeInForce":"GTC","newOrderRespType":"RESULT"}
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - formattedUserDataMessage eventreceived: {"eventType":"outboundAccountPosition","eventTime":1633444533651,"lastUpdateTime":1633444533650,"balances":[{"asset":"BNB","availableBalance":0.0033,"onOrderBalance":0},{"asset":"USDT","availableBalance":0.03031563,"onOrderBalance":0},{"asset":"ADA","availableBalance":13.4086,"onOrderBalance":0}],"wsMarket":"spot","wsKey":"spot_userData__o4qV5T36wfERwpZqLWroWlJkyoB8B7Eoh4E3xOUruod9NJWNS07Tugqg74tl"}
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - Oco Order was successfully created. Details:
 INFO - Tue, 05 Oct 2021 14:35:32 GMT - {"orderListId":46903768,"contingencyType":"OCO","listStatusType":"EXEC_STARTED","listOrderStatus":"EXECUTING","listClientOrderId":"x-U5D79M5BfwbidwhW9kRTfUw","transactionTime":1633444534287,"symbol":"ADAUSDT","orders":[{"symbol":"ADAUSDT","orderId":2439997522,"clientOrderId":"x-U5D79M5BJ4N3E78os6gpbyr"},{"symbol":"ADAUSDT","orderId":2439997523,"clientOrderId":"x-U5D79M5BR4kQUTLU1fezsIE"}],"orderReports":[{"symbol":"ADAUSDT","orderId":2439997522,"orderListId":46903768,"clientOrderId":"x-U5D79M5BJ4N3E78os6gpbyr","transactTime":1633444534287,"price":"2.06900000","origQty":"13.40000000","executedQty":"0.00000000","cummulativeQuoteQty":"0.00000000","status":"NEW","timeInForce":"GTC","type":"STOP_LOSS_LIMIT","side":"SELL","stopPrice":"2.09000000"},{"symbol":"ADAUSDT","orderId":2439997523,"orderListId":46903768,"clientOrderId":"x-U5D79M5BR4kQUTLU1fezsIE","transactTime":1633444534287,"price":"2.22200000","origQty":"13.40000000","executedQty":"0.00000000","cummulativeQuoteQty":"0.00000000","status":"NEW","timeInForce":"GTC","type":"LIMIT_MAKER","side":"SELL"}]}


                        UITLEG: 
                            ISSUE DAT ARAM MAG FIXEN: soms is de amount voor de OCO order hoger dan het aantal dat daadwerkelijk is
                                bijv. je koop 7.25 stuks en de balance bezit maar 7.23 stuks... 
                                    ==> Error van Binance insufficient balance. 
                                    (bot sluit zich daarna af!)



                        OPLOSSINGS VOORSTEL van MIKE:
                        1. Probeer onderstaande oplossing eens: 
                            - hier haal ik de balance op met een call, vervolgens kijk ik hoeveel vrij te besteden 
                            aantal je hebt. In de code: currentCryptoBalance.free

                            Ik heb geen tijd gehad om de code te testen, ik denk dat ie het wel moet doen. 

                        2. Test als volgt: 
                                xrp,
                                ada,
                                dot, 
                                eth     

                            VOOR alle symbols graag testen eerst met een order van 15 dollar. 
                            DAARNA zelfde test met een bedrag van 250 dollar! (De laatste test is het belangrijkst)
                        
                        3. TIP: per test run je coins weer inwisselen naar USDT


                */
                // START -  OPLOSSINGS VOORSTEL van MIKE:
                const coinName: string = data.symbol.replace('USDT', '');
                let balance = await this.binanceService.getAccountBalances(this.binanceRest);
                let currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
                let currentFreeCryptoBalance = Number(currentCryptoBalance.free);

                // todo aram doesn't this mean ALL of the cryptos in the wallet will be sold?
                // Let's say you wanna have 5000 DOT in your portfolio for long term investment, this would sell all of those?
                let ocoOrderAmount: number = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize); 
                const minimumOcoOrderQuantity: number = buyOrder.minimumOrderQuantity;
                // Einde -  OPLOSSINGS VOORSTEL van MIKE:

                txtLogger.writeToLogFile('currentCryptoBalance');
                txtLogger.writeToLogFile(JSON.stringify(currentCryptoBalance, null, 4));
                txtLogger.writeToLogFile('currentFreeCryptoBalance');
                txtLogger.writeToLogFile(JSON.stringify(currentFreeCryptoBalance, null, 4));
                txtLogger.writeToLogFile('ocoOrderAmount');
                txtLogger.writeToLogFile(JSON.stringify(ocoOrderAmount, null, 4));

             
                if (ocoOrderAmount < minimumOcoOrderQuantity) {
                    txtLogger.writeToLogFile(`Oco order quantity is lower than - ${ocoOrderAmount} - the minimum order quanity: ${minimumOcoOrderQuantity}`);
                    txtLogger.writeToLogFile(`Re-retrieving current free balance after a couple of seconds to ensure it's not a timing issue`);

                    const delay = ms => new Promise(res => setTimeout(res, ms));
                    await delay(3000);

                    balance = await this.binanceService.getAccountBalances(this.binanceRest);
                    currentCryptoBalance = (balance as AllCoinsInformationResponse[]).find(b => b.coin === coinName);
                    currentFreeCryptoBalance = Number(currentCryptoBalance.free);
                    ocoOrderAmount = exchangeLogic.roundOrderAmount(currentFreeCryptoBalance, stepSize);

                  
                    if (ocoOrderAmount < minimumOcoOrderQuantity) {
                        txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
                        txtLogger.writeToLogFile(`Oco order quantity is STILL lower than - ${ocoOrderAmount} - the minimum order quanity: ${minimumOcoOrderQuantity}`);
    
                        return;
                    }

                    txtLogger.writeToLogFile(`Re-retrieving current free balance did the trick, continueing oco order logic`);
                }

                txtLogger.writeToLogFile(`Trying to create an OCO order`);
                txtLogger.writeToLogFile(`The oco order amount is equal to: ${ocoOrderAmount}`);
                txtLogger.writeToLogFile(`The step size - which will be used in order to calculate the the amount - is: ${stepSize}`);
                txtLogger.writeToLogFile(`The tick size - which will be used in order to calculate the the price - is: ${tickSize}`);

                txtLogger.writeToLogFile(`Creating OCO order. Symbol: ${data.symbol} orderAmount: ${ocoOrderAmount} profitPrice: ${profitPrice} stopLossPrice: ${stopLossPrice} stopLimitPrice: ${stopLimitPrice}`);

                const ocoOrder = await this.order.createOcoSellOrder(
                    this.binanceRest,
                    data.symbol,
                    ocoOrderAmount,
                    profitPrice,
                    stopLossPrice,
                    stopLimitPrice
                );

                if (ocoOrder === undefined) {
                    txtLogger.writeToLogFile(`The method ListenToAccountOrderChanges quit because:`);
                    txtLogger.writeToLogFile(`Oco order creation failed.`, LogLevel.ERROR);

                    const limitSellOrderAmount: number = ocoOrderAmount;
                    const limitSellOrderPrice: number = data.price * 0.95;

                    const limitSellOrder = await this.order.createOrder(this.binanceRest, OrderTypeEnum.LIMITSELL, data.symbol, limitSellOrderAmount, limitSellOrderPrice) as OrderResponseFull;
                    if (limitSellOrder === undefined) {
                        txtLogger.writeToLogFile(`There was an error creating the limit sell order`, LogLevel.ERROR);
                    } else {
                        txtLogger.writeToLogFile(`Limit sell order created. Details:`);
                        txtLogger.writeToLogFile(`Status: ${limitSellOrder.status}, orderId: ${limitSellOrder.orderId}, clientOrderId: ${limitSellOrder.clientOrderId}, price: ${limitSellOrder.price}`);
                    }
                    txtLogger.writeToLogFile(`***SAFETY MEASURE***: When oco fails the bot will be switched off!`);
                    txtLogger.writeToLogFile(`Program is closed by 'process.exit`);

                    process.exit();

                    return;
                } else {
                    // todo aram don't we want to splice the old buy order no matter if the oco order was succesful? Since the buy order was fulfilled? 
                    // Or doesn't it matter since the process exits anyway above here when ocoOrder === undefined?
                    // if that's true the activeOcoOrdersIds stuff is kind of obsolete as well
                    const index = this.activeBuyOrders.findIndex(o => o.clientOrderId === clientOrderId);
                    if (index > -1) {
                        this.activeBuyOrders.splice(index, 1); 
                    }
                    this.activeOcoOrdersIds.push(ocoOrder.listClientOrderId);

                    txtLogger.writeToLogFile(`Oco Order was successfully created. Details:`);
                    txtLogger.writeToLogFile(`${JSON.stringify(ocoOrder)}`);
                }
            }
        }

        // // POSSIBILITY II - OCO order is finished - ALL_DONE
        if (data.eventType === 'listStatus' && data.listOrderStatus === 'ALL_DONE') {
            const listClientOrderId = data.listClientOrderId;
            txtLogger.writeToLogFile(`Oco order with listClientOrderId: ${listClientOrderId} is filled. Details:`);
            txtLogger.writeToLogFile(`${JSON.stringify(data)}`);
            this.activeOcoOrdersIds = this.activeOcoOrdersIds.filter(id => id !== listClientOrderId);
        }
    }
}