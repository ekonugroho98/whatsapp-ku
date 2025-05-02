const { parseNominal, getFormattedDate } = require('../utils');
const { getCategoryFromAILM, processImageWithAILM } = require('../ai');
const { writeToGoogleSheetLM } = require('../sheets');

// Baca config_price_gold.json
const fs = require('fs');
const path = require('path');
const GOLD_PRICE_CONFIG_PATH = path.join(__dirname, '../config_price_gold.json');
let goldPrices = [];

try {
  const rawData = fs.readFileSync(GOLD_PRICE_CONFIG_PATH);
  goldPrices = JSON.parse(rawData);
  console.log('Harga emas berhasil dimuat dari config_price_gold.json');
} catch (error) {
  console.error('Gagal membaca config_price_gold.json:', error.message);
  process.exit(1);
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

async function handleLogamMuliaText(sheets, customer, text) {
  let result;
  try {
    result = await getCategoryFromAILM(text);
    console.log('Hasil dari AI untuk pesan teks (Logam Mulia):', result);

    if (result.error) {
      // Jika AI mengembalikan error, coba tangani kasus Qty atau Nominal yang hilang
      throw new Error(result.error);
    }
  } catch (error) {
    // Parsing manual jika AI gagal
    const regex = /^(\w+)\s+(\d+)g\s*(?:(\d+\.?\d*[jt]?k?)?\s*)?(\d+)?\s+(.+)$/i;
    const match = text.match(regex);
    if (!match) {
      throw new Error(
        `Format tidak valid. Gunakan format: [Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings].\n` +
        `Contoh: "Antam 5g 5000k 1 Dana Darurat"\n` +
        `- Nominal boleh kosong jika menyertakan tahun pembelian (contoh: "Antam 5g Dana Darurat pembelian tanggal 11 Januari 2010")\n` +
        `- Qty boleh dihilangkan (default: 1)`
      );
    }

    const jenis_lm = match[1];
    const berat = parseFloat(match[2]);
    const nominalRaw = match[3] || '0';
    const qty = match[4] ? parseInt(match[4]) : 1;
    const tabel_savings = match[5].replace(/pembelian tanggal \d{1,2} \w+ \d{4}/i, '').trim();

    result = {
      tanggal: getFormattedDate(),
      jenis_lm,
      berat,
      nominal: nominalRaw,
      qty,
      tabel_savings
    };
  }

  // Jika nominal kosong, hitung berdasarkan tahun
  if (!result.nominal || parseNominal(result.nominal.toString()) === 0) {
    const year = extractYearFromMessage(text);
    if (!year) {
      throw new Error('Tahun tidak ditemukan dalam pesan. Harap sertakan tahun pembelian, misalnya: "pembelian tanggal 11 Januari 2010".');
    }

    try {
      const pricePerGram = getGoldPrice(year);
      result.nominal = pricePerGram * result.berat * result.qty;
      console.log(`Harga emas untuk tahun ${year}: ${pricePerGram} IDR/gram, Nominal dihitung: ${result.nominal}`);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  if (!result.jenis_lm) throw new Error('Could not determine Jenis LM.');

  const data = {
    tanggal: result.tanggal || getFormattedDate(),
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

    await writeToGoogleSheetLM(sheets, customer.spreadsheets.logam_mulia, data); // Gunakan spreadsheets.logam_mulia
    return {
      reply: `✅ Transaksi berhasil dicatat!\n\n📅 Tanggal: ${data.tanggal}\n🏷️ Jenis LM: ${data.jenis_lm}\n⚖️ Berat: ${data.berat}g\n💰 Nominal: Rp${nominal.toLocaleString('id-ID')}\n🔢 Qty: ${data.qty}\n📊 Tabel: ${data.tabel_savings}`
    };
  } else {
    return {
      saveText: text,
      reply: `📝 Pesan teks diterima: ${text}\n\nSilakan kirim gambar struk untuk melengkapi transaksi, atau pastikan format lengkap:\n[Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings]\n\nContoh: "Antam 5g 5000k 1 Dana Darurat"`
    };
  }
}

async function handleLogamMuliaImage(sheets, customer, imageMessage, lastTextMessage) {
  const caption = imageMessage.caption || lastTextMessage || '';
  console.log('Caption gambar:', caption);

  if (!caption) {
    throw new Error('Harap sertakan tujuan savings dalam caption gambar atau pesan teks sebelumnya.\nContoh: "Dana Darurat"');
  }

  const imageBuffer = Buffer.from(imageMessage.jpegThumbnail || imageMessage.url || '', 'base64');
  const transactions = await processImageWithAILM(imageBuffer, caption);
  console.log('Transaksi yang ditemukan dalam gambar:', transactions);
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
      tanggal: transactions.tanggal || tanggal,
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

    await writeToGoogleSheetLM(sheets, customer.spreadsheets.logam_mulia, data); // Gunakan spreadsheets.logam_mulia
    successMessages.push(
      `✅ Transaksi berhasil dicatat!\n\n📅 Tanggal: ${data.tanggal}\n🏷️ Jenis LM: ${data.jenis_lm}\n⚖️ Berat: ${data.berat}g\n💰 Nominal: Rp${nominal.toLocaleString('id-ID')}\n🔢 Qty: ${data.qty}\n📊 Tabel: ${data.tabel_savings}`
    );
  }

  if (successMessages.length === 0) {
    throw new Error('Tidak ada transaksi valid yang ditemukan dalam gambar.');
  }

  return {
    reply: successMessages.join('\n\n━━━━━━━━━━━━━━━━\n\n')
  };
}

module.exports = {
  handleLogamMuliaText,
  handleLogamMuliaImage
};