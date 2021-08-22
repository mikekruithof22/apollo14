var RSI = require('technicalindicators').RSI;

export default class RsiCalculator {
  public static calculateRsi = async (prices, length) => {
    const inputRSI = {
      values: prices,
      period: length
    };
    return RSI.calculate(inputRSI);
  }
}
