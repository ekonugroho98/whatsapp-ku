const axios = require('axios');

const AI_API_URL = 'http://127.0.0.1:8000'; // Sesuaikan dengan URL FastAPI Anda

async function handleKeuanganText(sheets, customer, text) {
  try {
    // Panggil endpoint AI untuk keuangan
    const response = await axios.post(`${AI_API_URL}/process_expense_keuangan`, { text });
    const { transaksi, kategori, nominal, tanggal, keterangan } = response.data;
    console.log('Data dari AI:', response.data);
    // Log data yang diterima
    console.log('Data dari AI untuk Keuangan:', { transaksi, kategori, nominal, tanggal, keterangan });

    if (!kategori || !nominal || !tanggal) {
      throw new Error('Data dari AI tidak lengkap: ' + JSON.stringify(response.data));
    }

    // Format tanggal dari YYYY-MM-DD ke DD-MM-YY
    const dateObj = new Date(tanggal);
    const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getFullYear()).slice(-2)}`;

    // Format nominal dengan Rp. dan dua desimal
    const formattedNominal = Number(nominal);
    const nominalWithCurrency = `Rp${formattedNominal.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Siapkan data untuk disimpan ke Google Sheets
    const values = [
      [
        tanggal,
        transaksi,
        "", "", // Empty columns
        kategori,
        "", "", // Empty columns
        "Rp.",
        nominal,
        keterangan
      ],
    ];

    // Simpan ke Google Sheets
    const spreadsheetId = customer.spreadsheets?.keuangan; // Akses spreadsheetId dari customer.spreadsheets.keuangan
    console.log('customer:', customer);
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID untuk fitur keuangan tidak ditemukan untuk pelanggan ini.');
    }

    const sheetName = getCurrentMonthInThreeLetters(); // Sesuaikan dengan nama sheet Anda
    const range = `${sheetName}!C:W`;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: {
        values,
      },
    });

    // Buat pesan balasan dengan ikon
    const reply = `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formattedDate}\n📋 Kategori: ${kategori}\n💰 Nominal: ${nominalWithCurrency}\n📝 Keterangan: ${keterangan || 'Tidak ada'}`;
    return { reply };
  } catch (error) {
    console.error('Error di handleKeuanganText:', error.message);
    throw new Error(`Error calling AI endpoint for Keuangan: ${error.message}`);
  }
}

async function handleKeuanganImage(sheets, customer, imageMessage) {
  try {
    const imageBase64 = imageMessage.jpegThumbnail || ''; // Sesuaikan cara ekstraksi gambar
    console.log('Gambar yang diterima:', imageBase64);
    const caption = imageMessage.caption || '';
    const response = await axios.post(`${AI_API_URL}/process_image_expense_keuangan`, {
      image: imageBase64,
      caption,
    });
    const transactions = response.data.transactions;

    if (transactions.length === 0) {
      return { reply: 'Tidak ada transaksi keuangan yang terdeteksi pada gambar.' };
    }

    // Simpan setiap transaksi ke Google Sheets
    const spreadsheetId = customer.spreadsheets?.keuangan; // Perbaiki akses spreadsheetId
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID untuk fitur keuangan tidak ditemukan untuk pelanggan ini.');
    }

    const sheetName = getCurrentMonthInThreeLetters();
    const range = `${sheetName}!C:W`;

    const successMessages = [];
    for (const t of transactions) {
      const values = [
        [
          t.tanggal,
          t.transaksi,
          "", "", // Empty columns
          t.kategori,
          "", "", // Empty columns
          "Rp.",
          t.nominal,
          t.keterangan
        ],
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: {
          values,
        },
      });

      // Format tanggal dari YYYY-MM-DD ke DD-MM-YY
      const dateObj = new Date(t.tanggal);
      const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getFullYear()).slice(-2)}`;

      // Format nominal dengan Rp. dan dua desimal
      const formattedNominal = Number(t.nominal);
      const nominalWithCurrency = `Rp${formattedNominal.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Tambahkan pesan dengan ikon
      successMessages.push(
        `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formattedDate}\n📋 Kategori: ${t.kategori}\n💰 Nominal: ${nominalWithCurrency}\n📝 Keterangan: ${t.keterangan || 'Tidak ada'}`
      );
    }

    // Gabungkan semua pesan
    const reply = successMessages.join('\n\n');
    return { reply };
  } catch (error) {
    console.error('Error di handleKeuanganImage:', error.message);
    throw new Error(`Error calling AI endpoint for Keuangan: ${error.message}`);
  }
}

function getCurrentMonthInThreeLetters() {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  return months[new Date().getMonth()];
}

module.exports = { handleKeuanganText, handleKeuanganImage };