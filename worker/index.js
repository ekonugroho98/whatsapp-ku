const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initializeFirebase, getConfig, registerCustomer, updateSpreadsheetId, updateLastActive } = require('./firebase');
const { parseNominal, toTitleCase, getFormattedDate, extractSpreadsheetId } = require('./utils');

dotenv.config();

const app = express();
app.use(express.json());

const AI_ENDPOINT = process.env.AI_ENDPOINT || 'http://ai-service:8000/process_expense';
const AI_IMAGE_ENDPOINT = process.env.AI_IMAGE_ENDPOINT || 'http://ai-service:8000/process_image_expense';
let lastTextMessage = null;

// Baca config_price_gold.json
const GOLD_PRICE_CONFIG_PATH = path.join(__dirname, 'config_price_gold.json');
let goldPrices = [];

try {
  const rawData = fs.readFileSync(GOLD_PRICE_CONFIG_PATH);
  goldPrices = JSON.parse(rawData);
  console.log('Harga emas berhasil dimuat dari config_price_gold.json');
} catch (error) {
  console.error('Gagal membaca config_price_gold.json:', error.message);
  process.exit(1); // Hentikan aplikasi jika file JSON tidak valid
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Google Sheets client
async function createSheetsClient() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  console.log('Using credentials file:', credentialsPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  try {
    const client = await auth.getClient();
    console.log('Auth client created successfully');
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Failed to create auth client:', error.message);
    if (error.code === 'EISDIR') {
      console.error(`Credentials file at ${credentialsPath} is a directory, not a file.`);
    }
    throw new Error(`Failed to authenticate with Google Sheets: ${error.message}`);
  }
}

// Write to Google Sheet
async function writeToGoogleSheet(sheets, spreadsheetId, data) {
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

// Fungsi untuk mengekstrak tahun dari pesan
function extractYearFromMessage(text) {
  const yearRegex = /(?:pembelian tanggal\s+\d{1,2}\s+\w+\s+(\d{4}))|(\d{4})/i;
  const match = text.match(yearRegex);
  if (match) {
    return parseInt(match[1] || match[2], 10);
  }
  return null;
}

// Fungsi untuk mencari harga emas dari config_price_gold.json
function getGoldPrice(year) {
  const priceEntry = goldPrices.find(entry => entry.tahun === year);
  if (!priceEntry) {
    throw new Error(`Harga emas untuk tahun ${year} tidak ditemukan di config_price_gold.json`);
  }
  return priceEntry.harga;
}

// Get category from AI
async function getCategoryFromAI(text) {
  try {
    const response = await axios.post(AI_ENDPOINT, { text }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error('Error calling AI endpoint:', error.message);
    throw new Error(error.response?.data?.detail || "Invalid format. Gunakan format: [Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings]. Contoh: Antam 5g 5000k 1 Dana Darurat");
  }
}

// Process image with AI
async function processImageWithAI(imageBuffer, caption) {
  try {
    const response = await axios.post(AI_IMAGE_ENDPOINT, { 
      image: imageBuffer.toString('base64'),
      caption: caption
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data.transactions;
  } catch (error) {
    console.error('Error calling AI image endpoint:', error.message);
    throw new Error('Failed to process image with AI.');
  }
}

// Message processing endpoint
app.post('/process-message', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('No message provided');

  try {
    let config = await getConfig();
    const sheets = await createSheetsClient();
    const from = message.key.remoteJid.split('@')[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const customer = config.customers.find(c => c.phoneNumber === from);
    const isAdmin = config.admin.phoneNumber === from;
    console.debug('req body:', req.body);

    // Handle registration (admin only)
    if (text.startsWith('DAFTAR : ')) {
      if (!isAdmin) {
        return res.json({ reply: '❌ Maaf, hanya admin yang dapat mendaftarkan nomor pelanggan.' });
      }

      try {
        let newNumber = text.split('DAFTAR : ')[1].trim();
        if (newNumber.startsWith('08')) {
          newNumber = '62' + newNumber.slice(1);
        }
        if (!newNumber.match(/^628[0-9]{8,11}$/)) {
          throw new Error('Format nomor tidak valid. Gunakan format 08xxxx atau 628xxxx (contoh: 081234567890 atau 6281234567890).');
        }

        config = await registerCustomer(newNumber, from, config);
        return res.json({ 
          reply: `✅ Nomor ${newNumber} berhasil didaftarkan sebagai pelanggan.\nSilakan kirim link spreadsheet untuk mengaktifkan fitur.` 
        });
      } catch (error) {
        return res.json({ reply: `❌ Gagal mendaftarkan nomor: ${error.message}` });
      }
    }

    // Handle spreadsheet link
    if (text.includes('docs.google.com/spreadsheets')) {
      try {
        const spreadsheetId = extractSpreadsheetId(text);
        if (!spreadsheetId) {
          throw new Error('Format link spreadsheet tidak valid. Contoh: https://docs.google.com/spreadsheets/d/1lPo7.../edit...');
        }

        const targetNumber = isAdmin && text.includes('UNTUK:') 
          ? text.split('UNTUK:')[1].trim().split(' ')[0]
          : from;

        if (isAdmin || targetNumber === from) {
          config = await updateSpreadsheetId(targetNumber, spreadsheetId, config);
          return res.json({ 
            reply: `✅ Spreadsheet ID berhasil diupdate untuk nomor ${targetNumber}:\n${spreadsheetId}` 
          });
        } else {
          return res.json({ reply: '❌ Anda tidak memiliki izin untuk mengatur spreadsheet nomor lain.' });
        }
      } catch (error) {
        return res.json({ reply: `❌ Gagal update spreadsheet: ${error.message}` });
      }
    }

    // Check customer status
    if (!customer) {
      return res.json({ 
        reply: '❌ Nomor Anda tidak terdaftar sebagai pelanggan.\nHubungi admin untuk mendaftarkan nomor Anda.' 
      });
    }

    if (!customer.whitelisted) {
      return res.json({ 
        reply: '❌ Akun Anda tidak diizinkan untuk mengakses fitur ini.\nHubungi admin untuk aktivasi.' 
      });
    }

    const subscriptionExp = customer.subscriptionExp.toDate();
    if (subscriptionExp < new Date()) {
      return res.json({ 
        reply: '❌ Langganan Anda telah kedaluwarsa.\nPerpanjang langganan untuk melanjutkan.' 
      });
    }

    if (!customer.spreadsheetId) {
      return res.json({ 
        reply: '❌ Spreadsheet ID belum diatur!\n\nSilakan kirim link spreadsheet Anda dengan format:\nhttps://docs.google.com/spreadsheets/d/xxx/edit\n\nContoh link:\nhttps://docs.google.com/spreadsheets/d/1lPo7qP8szZr9WgDd_H82wtbK-p6cgyjOW2N_CvGGQZg/edit#gid=0' 
      });
    }

    // Update lastActive
    config = await updateLastActive(from, config);

    try {
      if (text && !message.message?.imageMessage) {
        let result = await getCategoryFromAI(text);
        console.log('Hasil dari AI untuk pesan teks:', result);

        if (result.error) {
          throw new Error(result.error);
        }

        // Tangani kasus Nominal kosong
        if (result.nominal === 0) {
          const year = extractYearFromMessage(text);
          if (!year) {
            throw new Error('Tahun tidak ditemukan dalam pesan. Harap sertakan tahun pembelian, misalnya: "pembelian tanggal 11 Januari 2010".');
          }

          // Cari harga emas dari config_price_gold.json
          try {
            const pricePerGram = getGoldPrice(year);
            result.nominal = pricePerGram * result.berat * result.qty; // Hitung nominal
            console.log(`Harga emas untuk tahun ${year}: ${pricePerGram} IDR/gram, Nominal dihitung: ${result.nominal}`);
          } catch (error) {
            throw new Error(error.message);
          }
        }

        if (!result.jenis_lm) throw new Error('Could not determine Jenis LM.');

        const data = {
          tanggal: result.tanggal,
          jenis_lm: result.jenis_lm,
          berat: result.berat || 0,
          nominal: result.nominal,
          qty: result.qty || 1,
          tabel_savings: result.tabel_savings || 'Tidak Berlaku'
        };

        console.log('Data sebelum parsing nominal:', data);

        if (data.tabel_savings !== 'Tidak Berlaku' && data.nominal) {
          const nominal = parseNominal(data.nominal.toString());
          if (isNaN(nominal) || nominal <= 0) throw new Error('Nominal harus bernilai positif.');
          data.nominal = nominal;

          await writeToGoogleSheet(sheets, customer.spreadsheetId, data);
          return res.json({
            reply: `✅ Transaksi berhasil dicatat!\n\n📅 Tanggal: ${data.tanggal}\n🏷️ Jenis LM: ${data.jenis_lm}\n⚖️ Berat: ${data.berat}g\n💰 Nominal: Rp${nominal.toLocaleString('id-ID')}\n🔢 Qty: ${data.qty}\n📊 Tabel: ${data.tabel_savings}`
          });
        } else {
          lastTextMessage = text;
          console.log('Pesan teks disimpan sebagai konteks:', lastTextMessage);
          return res.json({
            reply: `📝 Pesan teks diterima: ${text}\n\nSilakan kirim gambar struk untuk melengkapi transaksi, atau pastikan format lengkap:\n[Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings]\n\nContoh: "Antam 5g 5000k 1 Dana Darurat"`
          });
        }
      }

      if (message.message?.imageMessage) {
        try {
          const caption = message.message.imageMessage.caption || lastTextMessage || '';
          console.log('Caption gambar:', caption);

          if (!caption) {
            throw new Error('Harap sertakan tujuan savings dalam caption gambar atau pesan teks sebelumnya.\nContoh: "Dana Darurat"');
          }

          const imageBuffer = Buffer.from(message.message.imageMessage.jpegThumbnail || message.message.imageMessage.url || '', 'base64');
          const transactions = await processImageWithAI(imageBuffer, caption);

          if (!transactions || transactions.length === 0) {
            throw new Error('Tidak ditemukan transaksi dalam gambar. Pastikan gambar berisi informasi:\n- Jenis LM\n- Berat\n- Nominal\n- Qty');
          }

          const successMessages = [];
          const tanggal = getFormattedDate();
          const seenTransactions = new Set();

          for (const transaction of transactions) {
            const transactionKey = `${transaction.jenis_lm}|${transaction.berat}|${transaction.nominal}|${transaction.qty}`;
            if (seenTransactions.has(transactionKey)) {
              console.log('Transaksi duplikat ditemukan, dilewati:', transactionKey);
              continue;
            }
            seenTransactions.add(transactionKey);

            const data = {
              tanggal: tanggal,
              jenis_lm: transaction.jenis_lm,
              berat: transaction.berat || 0,
              nominal: transaction.nominal,
              qty: transaction.qty || 1,
              tabel_savings: transaction.tabel_savings || 'Tidak Berlaku'
            };

            console.log('Data transaksi dari gambar:', data);

            if (!data.nominal || data.nominal == 0) {
              throw new Error('Nominal tidak valid. Pastikan gambar berisi informasi nominal yang jelas.');
            }

            if (data.tabel_savings === 'Tidak Berlaku') {
              throw new Error('Tujuan savings tidak dikenali. Gunakan salah satu dari:\n- Dana Darurat\n- Pendidikan Anak\n- Investasi\n- Dana Pensiun\n- Haji & Umroh\n- Rumah\n- Wedding\n- Mobil\n- Liburan\n- Gadget');
            }

            const nominal = parseNominal(data.nominal.toString());
            if (isNaN(nominal) || nominal <= 0) throw new Error('Nominal harus angka positif.');
            data.nominal = nominal;

            await writeToGoogleSheet(sheets, customer.spreadsheetId, data);
            successMessages.push(
              `✅ Transaksi berhasil dicatat!\n\n📅 Tanggal: ${data.tanggal}\n🏷️ Jenis LM: ${data.jenis_lm}\n⚖️ Berat: ${data.berat}g\n💰 Nominal: Rp${nominal.toLocaleString('id-ID')}\n🔢 Qty: ${data.qty}\n📊 Tabel: ${data.tabel_savings}`
            );
          }

          if (successMessages.length > 0) {
            return res.json({ reply: successMessages.join('\n\n━━━━━━━━━━━━━━━━\n\n') });
          } else {
            throw new Error('Tidak ada transaksi valid yang ditemukan dalam gambar.');
          }
        } catch (error) {
          console.error('Error saat memproses gambar:', error.message);
          return res.json({ reply: `❌ Gagal memproses gambar:\n${error.message}` });
        }
      }

      return res.json({ reply: '❌ Pesan tidak dikenali. Kirim teks transaksi atau gambar struk.' });
    } catch (error) {
      console.error('Error saat memproses pesan:', error.message);
      return res.json({
        reply: `❌ Error:\n${error.message}\n\nContoh format yang benar:\n"Antam 5g 5000k 1 Dana Darurat"`
      });
    }
  } catch (error) {
    console.error('Error saat menginisialisasi konfigurasi:', error.message);
    return res.status(500).json({ reply: '❌ Server error. Silakan coba lagi nanti.' });
  }
});

// Start the server
app.listen(3002, () => console.log('Worker running on port 3002'));