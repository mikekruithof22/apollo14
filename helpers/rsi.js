var RSI = require('technicalindicators').RSI;

const calculateRsi = async (prices, length) => {
  const inputRSI = {
    values: prices,
    period: length
  };
  return RSI.calculate(inputRSI);
}

module.exports = {
  calculateRsi
}
