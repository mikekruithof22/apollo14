const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const exportTestExcel = (data, dataSecondSheet, workSheetColumnNames, workSheetColumnTwoNames) => {
    const filePath = generateFileNameAndDirectory('testRunLogs');

    const workBook = xlsx.utils.book_new();
    const workSheetOneData = [
        workSheetColumnNames,
        ...data
    ];

    const workSheetTwoData = [
        workSheetColumnTwoNames,
        ...dataSecondSheet
    ];

    const workSheet = xlsx.utils.aoa_to_sheet(workSheetOneData);
    const workSheetTwo = xlsx.utils.aoa_to_sheet(workSheetTwoData);
    xlsx.utils.book_append_sheet(workBook, workSheet, 'Candles');
    xlsx.utils.book_append_sheet(workBook, workSheetTwo, 'Data');
    xlsx.writeFile(workBook, path.resolve(filePath));
}

const exportHistoricalTest = (data, metaDataContent) => {
    const dataFirstSheet = data.map(data => {
        return [
            //data.id,
            //data.message,
            data.orderConditionName,
            '',
            data.startWithCandle.openTime,
            data.startWithCandle.open,
            // data.startWithCandle.high,
            // data.startWithCandle.low,
            data.startWithCandle.close,
            data.startWithCandle.closeTime,
            data.startRsiValue,
            '',
            data.endingCandle.openTime,
            data.endingCandle.open,
            // data.endingCandle.high,
            // data.endingCandle.low,
            data.endingCandle.close,
            data.endingCandle.closeTime,
            data.endiRsiValue,
            '',
            data.totalCandles,
            '',
            data.highestNextCandle,
            data.lowestCandle,
            data.stopLossMsg
        ];
    });

    const dataSecondSheet = metaDataContent.map(metaDataContent => {
        return [
            metaDataContent.amount,
            metaDataContent.succesfull,
            metaDataContent.unsuccesfull,
            metaDataContent.unableSameCandle,
            metaDataContent.unableUnknown,
            metaDataContent.numberOffApiCalls,
            metaDataContent.configuration
        ];
    });

    const workSheetColumnOneNames = [
        //'ID',
        //'message',
        'ORDER NAME',
        ' * ',
        'FIRST CANDLE',
        'OPEN',
        // 'sw-high',
        // 'sw-low',
        'CLOSE',
        'CLOSETIME',
        'RSI',
        ' * ',

        'SECOND CANDLE',
        'OPEN',
        // 'ec-high',
        // 'ec-low',
        'CLOSE',
        'CLOSETIME',
        'RSI',

        ' * ',
        'CANDLES DIFFERENCE',
        ' * ',
        'HIGHEST NEXT CANDLE',
        'LOWEST NEXT CANDLE',
        'MOST LIKELY OUTCOME'
    ];

    const workSheetColumnTwoNames = [
        'TOTAL TRADES',
        'SUCCESSFULL TRADES',
        'UNSUCCESSFULL TRADES',
        'UNABLE TO DECIDE TRADES - SAME CANDLE',
        'UNABLE TO DECIDE TRADES',
        'NUMBER OF API CALLS',
        'CONFIGURATION OBJECT'
    ];

    exportTestExcel(dataFirstSheet, dataSecondSheet, workSheetColumnOneNames, workSheetColumnTwoNames);
}

const exportRealTimeTest = (data) => {
    const dataFirstSheet = data.map(data => {
        return [
            data.candle.orderConditionName,
            '',
            data.candle.startWithCandle.openTime,
            data.candle.startWithCandle.open,
            data.candle.startRsiValue,
            '',
            data.candle.endingCandle.openTime,
            data.candle.endingCandle.open,
            data.candle.endiRsiValue,
            '',
            data.testOrder.message,
            data.testOrder.time,
            data.testOrder.symbol,
            data.testOrder.side,
            data.testOrder.type,
            data.testOrder.newClientOrderId,
            data.testOrder.response
        ];
    });

    const workSheetColumnNames = [
        'ORDER NAME',
        ' * ',
        'FIRST CANDLE',
        'OPEN',
        'RSI',
        ' * ',
        'SECOND CANDLE',
        'OPEN',
        'RSI',
        ' * ',
        'MESSAGE',
        'CREATED TIME',
        'SYMBOL',
        'SIDE',
        'TYPE',
        'ORDERID',
        'RESPONSE'
    ];

    exportRealTimeTestExcel(dataFirstSheet, workSheetColumnNames);
}

const exportRealTimeTestExcel = (data, workSheetColumnNames) => {
    const filePath = generateFileNameAndDirectory('realTimeTestLogs');

    const workBook = xlsx.utils.book_new();
    const workSheetOneData = [
        workSheetColumnNames,
        ...data
    ];

    const workSheet = xlsx.utils.aoa_to_sheet(workSheetOneData);
    xlsx.utils.book_append_sheet(workBook, workSheet, 'Test orders');
    xlsx.writeFile(workBook, path.resolve(filePath));

}

const generateFileNameAndDirectory = (directoryName) => {
    if (!fs.existsSync(`./${directoryName}`)) {
        fs.mkdir(`./${directoryName}`, (err) => {
            if (err) throw err;
        });
    }
    const date = new Date();
    const fileName = `log ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()} ${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
    const filePath = `./${directoryName}/${fileName}.xlsx`;
    return filePath;
}

module.exports = {
    exportHistoricalTest,
    exportRealTimeTest
};
