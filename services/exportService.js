const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const exportExcel = (data, dataSecondSheet, workSheetColumnNames, workSheetColumnTwoNames) => {
    if (!fs.existsSync('./logs')) {
        fs.mkdir('./logs', (err) => {
            if (err) throw err;
        });
    }
    const date = new Date();
    const fileName = `log ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()} ${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
    const filePath = `./logs/${fileName}.xlsx`;


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
    xlsx.utils.book_append_sheet(workBook, workSheet, 'Results');
    xlsx.utils.book_append_sheet(workBook, workSheetTwo, 'Meta data');
    xlsx.writeFile(workBook, path.resolve(filePath));
}

const exporDivergencesToExcel = (data, metaDataContent) => {
    const dataFirstSheet = data.map(data => {
        return [
            //data.id,
            //data.message,
            data.startWithCandle.openTime,
            data.startWithCandle.open,
            // data.startWithCandle.high,
            // data.startWithCandle.low,
            data.startWithCandle.close,
            data.startWithCandle.closeTime,
            data.startRsiValue,

            data.endingCandle.openTime,
            data.endingCandle.open,
            // data.endingCandle.high,
            // data.endingCandle.low,
            data.endingCandle.close,
            data.endingCandle.closeTime,
            data.endiRsiValue,
            data.highestNextCandle,
            data.lowestCandle,
            data.stopLossMsg
        ];
    });

    const dataSecondSheet = metaDataContent.map(metaDataContent => {
        return [
            metaDataContent.amount,
            metaDataContent.succesfull,
            metaDataContent.unable,
            metaDataContent.uri,
            metaDataContent.configuration
        ];
    });

    const workSheetColumnOneNames = [
        //'ID',
        //'message',
        'FIRST CANDLE',
        'Open',
        // 'sw-high',
        // 'sw-low',
        'Close',
        'CloseTime',
        'RSI',
        'SECOND CANDLE',
        'Open',
        // 'ec-high',
        // 'ec-low',
        'Close',
        'CloseTime',
        'RSI',
        'Highest next candle',
        'Lowest candle'
    ];

    const workSheetColumnTwoNames = [
        'Number of divergences',
        'Number of succesfull trades',
        'Number of unable to know if succesfull trades',
        'Url',
        'Configuration object'
    ];

    exportExcel(dataFirstSheet, dataSecondSheet, workSheetColumnOneNames, workSheetColumnTwoNames);
}

module.exports = {
    exporDivergencesToExcel
};
