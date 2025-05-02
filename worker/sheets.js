const { google } = require('googleapis');
const path = require('path');
const { parseNominal, toTitleCase, getFormattedDate } = require('./utils');

// Google Sheets client
async function createSheetsClient() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  try {
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Failed to create auth client:', error.message);
    if (error.code === 'EISDIR') {
      console.error(`Credentials file at ${credentialsPath} is a directory, not a file.`);
    }
    throw new Error(`Failed to authenticate with Google Sheets: ${error.message}`);
  }
}

// Write to Google Sheet untuk Logam Mulia
async function writeToGoogleSheetLM(sheets, spreadsheetId, data) {
  const sheetName = 'Tracker';
  let range;

  data.tabel_savings = toTitleCase(data.tabel_savings);
  console.log('Tabel Savings setelah normalisasi:', data.tabel_savings);

  switch (data.tabel_savings) {
    case 'Dana Darurat':
      range = `${sheetName}!N:R`;
      break;
    case 'Pendidikan Anak':
      range = `${sheetName}!V:Z`;
      break;
    case 'Investasi':
      range = `${sheetName}!AD:AH`;
      break;
    case 'Dana Pensiun':
      range = `${sheetName}!AL:AP`;
      break;
    case 'Haji & Umroh':
      range = `${sheetName}!AT:AX`;
      break;
    case 'Rumah':
      range = `${sheetName}!BB:BF`;
      break;
    case 'Wedding':
      range = `${sheetName}!BI:BO`;
      break;
    case 'Mobil':
      range = `${sheetName}!BJ:BN`;
      break;
    case 'Liburan':
      range = `${sheetName}!BZ:CD`;
      break;
    case 'Gadget':
      range = `${sheetName}!CH:CL`;
      break;
    default:
      throw new Error('Transaksi ini tidak termasuk dalam kategori savings.');
  }

  const values = [
    [
      data.tanggal,
      data.jenis_lm,
      data.berat,
      `Rp${parseInt(data.nominal).toLocaleString('id-ID')}`,
      data.qty
    ]
  ];

  console.log('Data yang akan ditulis ke sheet:', values);
  console.log('Spreadsheet id:', spreadsheetId);
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values }
    });
    console.log(`Data written to sheet: ${sheetName} (Spreadsheet ID: ${spreadsheetId}, Range: ${range})`);
    return true;
  } catch (error) {
    console.error(`Failed to write to sheet ${sheetName}:`, error.message);
    throw new Error(`Failed to write data to sheet ${sheetName}: ${error.message}`);
  }
}

// Write to Google Sheet untuk Keuangan
async function writeToGoogleSheetKeuangan(sheets, spreadsheetId, data) {
  const sheetName = getCurrentMonthInThreeLetters();
  const values = [
    [
      data.tanggal,
      data.transaksi,
      "", "", // Empty columns
      data.kategori,
      "", "", // Empty columns
      "Rp.",
      data.nominal,
      data.keterangan
    ]
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!C:W`,
      valueInputOption: 'RAW',
      resource: { values }
    });
    console.log(`Data written to sheet: ${sheetName} (Spreadsheet ID: ${spreadsheetId})`);
    return true;
  } catch (error) {
    console.error(`Failed to write to sheet ${sheetName}:`, error.message);
    throw new Error(`Failed to write data to sheet ${sheetName}. Ensure the sheet exists.`);
  }
}

// Get current month in three letters
function getCurrentMonthInThreeLetters() {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  return months[new Date().getMonth()];
}

module.exports = {
  createSheetsClient,
  writeToGoogleSheetLM,
  writeToGoogleSheetKeuangan
};