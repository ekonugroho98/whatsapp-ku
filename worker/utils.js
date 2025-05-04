function parseNominal(nominalStr) {
    if (!nominalStr || nominalStr === "0") return 0;
  
    const parsedNumber = parseFloat(nominalStr);
    if (!isNaN(parsedNumber) && parsedNumber > 0) {
      return Math.round(parsedNumber);
    }
  
    nominalStr = nominalStr.trim().toLowerCase();
    const match = nominalStr.match(/^([\d,.]+)\s*(k|rb|ribu|jt|juta|m|milyar)?$/i);
    if (!match) throw new Error('Invalid nominal format.');
  
    let number = parseFloat(match[1].replace(',', '.'));
    const suffix = match[2] || '';
  
    if (isNaN(number) || number <= 0) throw new Error('Nominal must be a positive number.');
  
    const multipliers = {
      'k': 1000,
      'rb': 1000,
      'ribu': 1000,
      'jt': 1000000,
      'juta': 1000000,
      'm': 1000000000,
      'milyar': 1000000000
    };
  
    return Math.round(number * (multipliers[suffix] || 1));
  }
  
  function toTitleCase(str) {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  function extractSpreadsheetId(url) {
    const regex = /\/d\/([a-zA-Z0-9-_]{25,})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }
  
  module.exports = { parseNominal, toTitleCase, getFormattedDate, extractSpreadsheetId };