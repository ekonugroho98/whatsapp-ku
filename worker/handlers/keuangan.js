const axios = require('axios');
const { deleteLastTransactionsFromRedis, getLastTransactionsFromRedis, saveLastTransactionsToRedis } = require('../utils/redisHelpers');

if (!process.env.AI_ENDPOINT_KEUANGAN) {
  throw new Error("❌ Env AI_ENDPOINT_KEUANGAN belum diset");
}

if (!process.env.AI_IMAGE_ENDPOINT_KEUANGAN) {
  throw new Error("❌ Env AI_IMAGE_ENDPOINT_KEUANGAN belum diset");
}

// Endpoint AI untuk kedua fitur
const AI_ENDPOINT_KEUANGAN = process.env.AI_ENDPOINT_KEUANGAN;
const AI_IMAGE_ENDPOINT_KEUANGAN = process.env.AI_IMAGE_ENDPOINT_KEUANGAN;
const AI_VOICE_ENDPOINT_KEUANGAN = process.env.AI_VOICE_ENDPOINT_KEUANGAN;

async function handleKeuanganText(sheets, customer, text) {
  try {
    const response = await axios.post(`${AI_ENDPOINT_KEUANGAN}`, { text });

    // Jika AI mengembalikan note tanpa transaksi
    if (response.data?.note && (!response.data.transactions || response.data.transactions.length === 0)) {
      return { reply: response.data.note };
    }

    // Ambil transaksi pertama dari array (saat ini hanya satu)
    const transaksiObj = response.data.transactions?.[0];
    if (!transaksiObj) {
      throw new Error('Data transaksi kosong atau tidak dikenali.');
    }

    const { transaksi, kategori, nominal, tanggal, keterangan } = transaksiObj;

    if (!kategori || !nominal || !tanggal || !transaksi) {
      throw new Error('Data dari AI tidak lengkap: ' + JSON.stringify(transaksiObj));
    }

    // Format tanggal
    const dateObj = new Date(tanggal);
    const bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const tgl = String(dateObj.getDate()).padStart(2, '0');
    const bulan = bulanIndo[dateObj.getMonth()];
    const tahun = dateObj.getFullYear();
    const formattedDate = `${tgl} ${bulan} ${tahun}`;

    // Format nominal
    const formattedNominal = Number(nominal);
    const nominalWithCurrency = `Rp${formattedNominal.toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    const values = [[
      tanggal,
      transaksi,
      "", "", // kolom kosong
      kategori,
      "", "", // kolom kosong
      "Rp.",
      nominal,
      keterangan
    ]];

    const spreadsheetId = customer.spreadsheets?.keuangan;
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID tidak ditemukan untuk pelanggan ini.');
    }

    const sheetName = getCurrentMonthInThreeLetters();
    const range = `${sheetName}!C:W`;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values },
    });

    await saveLastTransactionsToRedis(`${customer.phoneNumber}`, [transaksiObj]);

    return {
      reply: `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formattedDate}\n📋 Kategori: ${kategori}\n💰 Nominal: ${nominalWithCurrency}\n📝 Keterangan: ${keterangan || 'Tidak ada'}`
    };

  } catch (error) {
    if (error.message.includes('The caller does not have permission')) {
      return {
        reply:
          `❌ Sistem tidak dapat mengakses spreadsheet Anda.\n\n` +
          `🔒 Pastikan Anda sudah membagikan spreadsheet tersebut ke:\n` +
          `📧 *wa-bot@wa-bot-456306.iam.gserviceaccount.com*`
      };
    }

    console.error('Error di handleKeuanganText:', error.message);
    throw new Error(`Error calling AI endpoint for Keuangan: ${error.message}`);
  }
}


async function handleKeuanganImage(sheets, customer, imageBufferBase64, caption) {
  try {
    if (!imageBufferBase64 || typeof imageBufferBase64 !== 'string' || imageBufferBase64.length < 1000) {
      throw new Error('Data gambar tidak valid atau terlalu kecil.');
    }
    const isProbablyJpeg = imageBufferBase64.startsWith('/9j/');
    if (!isProbablyJpeg) {
      throw new Error('Gambar tidak terdeteksi sebagai JPEG. Harap kirim gambar dengan format yang benar.');
    }

    const image = imageBufferBase64;
    const response = await axios.post(`${AI_IMAGE_ENDPOINT_KEUANGAN}`, {
      image,
      caption,
    });

    const transactions = response.data.transactions || [];
    const note = response.data.note;

    if (transactions.length === 0) {
      // Jika tidak ada transaksi, kirim note humanis atau fallback message
      return {
        reply: note || '❗ Gambar tidak terdeteksi sebagai struk atau tidak mengandung transaksi keuangan.'
      };
    }

    const spreadsheetId = customer.spreadsheets?.keuangan;
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID untuk fitur keuangan tidak ditemukan untuk pelanggan ini.');
    }

    const sheetName = getCurrentMonthInThreeLetters();
    const range = `${sheetName}!C:W`;

    const successMessages = [];
    for (const t of transactions) {
      const values = [[
        t.tanggal,
        t.tipe_transaksi,
        '', '',
        t.kategori,
        '', '',
        'Rp.',
        t.nominal,
        t.keterangan
      ]];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values },
      });
    
      await saveLastTransactionsToRedis(`${customer.phoneNumber}`, transactions);

      const dateObj = new Date(t.tanggal);
      const bulanIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const tanggal = String(dateObj.getDate()).padStart(2, '0');
      const bulan = bulanIndo[dateObj.getMonth()];
      const tahun = dateObj.getFullYear();
      const formattedDate = `${tanggal} ${bulan} ${tahun}`;
      const nominalWithCurrency = `Rp${Number(t.nominal).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      successMessages.push(
        `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formattedDate}\n📋 Kategori: ${t.kategori}\n💰 Nominal: ${nominalWithCurrency}\n📝 Keterangan: ${t.keterangan || 'Tidak ada'}`
      );
    }

    // Gabungkan note dengan hasil sukses
    const fullReply = [
      ...(note ? [note] : []),
      ...successMessages
    ].join('\n\n');

    return { reply: fullReply };
  } catch (error) {
    console.error('Error di handleKeuanganImage:', error.message);
    throw new Error(`Error calling AI endpoint for Keuangan: ${error.message}`);
  }
}

async function handleKeuanganVoice(sheets, customer, audioBufferBase64, caption) {
  try {
    if (!audioBufferBase64 || typeof audioBufferBase64 !== 'string' || audioBufferBase64.length < 1000) {
      throw new Error('Voice note tidak valid atau terlalu kecil.');
    }

    const response = await axios.post(`${AI_VOICE_ENDPOINT_KEUANGAN}`, {
      audio: audioBufferBase64,
      caption,
    });

    const { transactions = [], note } = response.data;

    if (note && transactions.length === 0) {
      return { reply: note };
    }

    if (transactions.length === 0) {
      return { reply: 'Tidak ditemukan transaksi dari voice note ini.' };
    }

    const spreadsheetId = customer.spreadsheets?.keuangan;
    if (!spreadsheetId) {
      throw new Error('Spreadsheet untuk fitur keuangan tidak ditemukan.');
    }

    const sheetName = getCurrentMonthInThreeLetters();
    const range = `${sheetName}!C:W`;

    const successMessages = [];
    for (const t of transactions) {
      const values = [[
        t.tanggal,
        t.tipe_transaksi,
        '', '',
        t.kategori,
        '', '',
        'Rp.',
        t.nominal,
        t.keterangan
      ]];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values },
      });
      
      await saveLastTransactionsToRedis(`${customer.phoneNumber}`, transactions);

      const dateObj = new Date(t.tanggal);
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
      const formattedNominal = Number(t.nominal);
      const nominalWithCurrency = `Rp${formattedNominal.toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;

      successMessages.push(
        `✅ Transaksi dari voice note dicatat!\n\n📅 Tanggal: ${formattedDate}\n📋 Kategori: ${t.kategori}\n💰 Nominal: ${nominalWithCurrency}\n📝 Keterangan: ${t.keterangan || 'Tidak ada'}`
      );
    }

    return { reply: successMessages.join('\n\n') };
  } catch (error) {
    console.error('Error di handleKeuanganVoice:', error.message);
    throw new Error(`Error memproses voice note keuangan: ${error.message}`);
  }
}

async function handleHapusTerakhirKeuangan(sheets, customer) {
  const spreadsheetId = customer.spreadsheets?.keuangan;
  if (!spreadsheetId) {
    throw new Error('Spreadsheet keuangan belum terhubung ke akun Anda.');
  }

  const cacheKey = `${customer.phoneNumber}`;
  const cached = await getLastTransactionsFromRedis(cacheKey);
  
  if (!cached || cached.length === 0) {
    return { reply: '❌ Tidak ada transaksi terakhir yang bisa dihapus. Kirim transaksi baru terlebih dahulu.' };
  }

  console.log('cached:', cached);

  const sheetName = getCurrentMonthInThreeLetters();
  const range = `${sheetName}!C:W`;

  const transactionsToDelete = cached; // Array of objects

  // Fetch all rows
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = readRes.data.values || [];
  const remainingRows = rows.filter((row) => {
    const [tanggal, tipe, , , kategori, , , , nominal, keterangan] = row;
    return !transactionsToDelete.some((t) =>
      t.tanggal === tanggal &&
      t.tipe_transaksi === tipe &&
      t.kategori === kategori &&
      String(t.nominal) === String(nominal) &&
      t.keterangan === keterangan
    );
  });

  // Update sheet dengan hanya baris yang tidak dihapus
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    resource: {
      values: remainingRows,
    },
  });

  await deleteLastTransactionsFromRedis(cacheKey);

  return { reply: `✅ Transaksi terakhir (${transactionsToDelete.length} item) berhasil dihapus dari sheet bulan ini.` };
}


function getCurrentMonthInThreeLetters() {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  return months[new Date().getMonth()];
}

module.exports = { handleKeuanganText, handleKeuanganImage, handleKeuanganVoice, handleHapusTerakhirKeuangan};