const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

export default class ExportService {
    public exportTestExcel = (data, dataSecondSheet, workSheetColumnNames, workSheetColumnTwoNames) => {
        const filePath = this.generateFileNameAndDirectory('testLogs');

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

    public exportHistoricalTest = (data, metaDataContent) => {
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
                data.balance,
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
            'BALANCE',
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

        this.exportTestExcel(dataFirstSheet, dataSecondSheet, workSheetColumnOneNames, workSheetColumnTwoNames);
    }

    public generateFileNameAndDirectory = (directoryName) => {
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
}
// module.exports = {
//     exportHistoricalTest,

// };
