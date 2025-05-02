const { getConfig, registerCustomer, updateSpreadsheetId, updateLastActive, updateCustomerFeatures } = require('./firebase');
const { extractSpreadsheetId } = require('./utils');

// Handle registration (admin only)
async function handleRegistration(text, from, isAdmin, config) {
  if (!isAdmin) {
    throw new Error('Maaf, hanya admin yang dapat mendaftarkan nomor pelanggan.');
  }

  const parts = text.split('FITUR :');
  let newNumber = parts[0].split('DAFTAR : ')[1].trim();
  let features = ['logam_mulia'];

  if (newNumber.startsWith('08')) {
    newNumber = '62' + newNumber.slice(1);
  }
  if (!newNumber.match(/^628[0-9]{8,11}$/)) {
    throw new Error('Format nomor tidak valid. Gunakan format 08xxxx atau 628xxxx (contoh: 081234567890 atau 6281234567890).');
  }

  config = await registerCustomer(newNumber, from, config);

  if (parts.length > 1) {
    features = parts[1].trim().split(' ').map(f => f.toLowerCase());
    const validFeatures = ['logam_mulia', 'keuangan'];
    if (!features.every(f => validFeatures.includes(f))) {
      throw new Error(`Fitur tidak valid. Fitur yang tersedia: ${validFeatures.join(', ')}.`);
    }
    config = await updateCustomerFeatures(newNumber, features, config);
  }

  return {
    config,
    reply: `✅ Nomor ${newNumber} berhasil didaftarkan sebagai pelanggan dengan fitur: ${features.join(', ')}.\nSilakan kirim link spreadsheet untuk mengaktifkan fitur.`
  };
}

// Handle spreadsheet link
async function handleSpreadsheetLink(text, from, isAdmin, config) {
  const spreadsheetId = extractSpreadsheetId(text);
  if (!spreadsheetId) {
    throw new Error('Format link spreadsheet tidak valid. Contoh: https://docs.google.com/spreadsheets/d/1lPo7.../edit...');
  }

  let targetNumber;
  let feature;

  if (text.toLowerCase().includes('spreadsheet lm:')) {
    feature = 'logam_mulia';
    targetNumber = text.split('SPREADSHEET LM:')[1].trim().split(' ')[0];
  } else if (text.toLowerCase().includes('spreadsheet keuangan:')) {
    feature = 'keuangan';
    targetNumber = text.split('SPREADSHEET KEUANGAN:')[1].trim().split(' ')[0];
  } else {
    targetNumber = isAdmin && text.includes('UNTUK:') 
      ? text.split('UNTUK:')[1].trim().split(' ')[0]
      : from;

    const customer = config.customers.find(c => c.phoneNumber === targetNumber);
    if (!customer) {
      throw new Error('Nomor tidak ditemukan dalam daftar pelanggan.');
    }

    const customerFeatures = customer.features || ['logam_mulia'];
    if (customerFeatures.length > 1) {
      throw new Error(
        '❌ Nomor ini memiliki lebih dari satu fitur. Harap gunakan pembeda:\n' +
        '- Untuk Logam Mulia: SPREADSHEET LM: [nomor] [link]\n' +
        '- Untuk Keuangan: SPREADSHEET KEUANGAN: [nomor] [link]\n\n' +
        'Contoh:\nSPREADSHEET LM: 6281234567890 https://docs.google.com/spreadsheets/...\n' +
        'SPREADSHEET KEUANGAN: 6281234567890 https://docs.google.com/spreadsheets/...'
      );
    }
    feature = customerFeatures[0];
  }

  if (isAdmin || targetNumber === from) {
    config = await updateSpreadsheetId(targetNumber, feature, spreadsheetId, config);
    return {
      config,
      reply: `✅ Spreadsheet ID untuk fitur ${feature} berhasil diupdate untuk nomor ${targetNumber}:\n${spreadsheetId}`
    };
  } else {
    throw new Error('Anda tidak memiliki izin untuk mengatur spreadsheet nomor lain.');
  }
}

// Handle update fitur (admin only)
async function handleUpdateFeatures(text, from, isAdmin, config) {
  if (!isAdmin) {
    throw new Error('Maaf, hanya admin yang dapat mengatur fitur pelanggan.');
  }

  const parts = text.split('UPDATE_FITUR : ')[1].trim().split(' ');
  const phoneNumber = parts[0];
  const features = parts.slice(1).map(f => f.toLowerCase());

  if (!phoneNumber.match(/^628[0-9]{8,11}$/)) {
    throw new Error('Format nomor tidak valid. Gunakan format 628xxxx (contoh: 6281234567890).');
  }

  const validFeatures = ['logam_mulia', 'keuangan'];
  if (!features.every(f => validFeatures.includes(f))) {
    throw new Error(`Fitur tidak valid. Fitur yang tersedia: ${validFeatures.join(', ')}.`);
  }

  config = await updateCustomerFeatures(phoneNumber, features, config);
  return {
    config,
    reply: `✅ Fitur untuk nomor ${phoneNumber} berhasil diperbarui: ${features.join(', ')}.`
  };
}

// Check customer status
async function checkCustomerStatus(from, config, selectedFeature) {
  const customer = config.customers.find(c => c.phoneNumber === from);
  if (!customer) {
    throw new Error('Nomor Anda tidak terdaftar sebagai pelanggan.\nHubungi admin untuk mendaftarkan nomor Anda.');
  }

  if (!customer.whitelisted) {
    throw new Error('Akun Anda tidak diizinkan untuk mengakses fitur ini.\nHubungi admin untuk aktivasi.');
  }

  const subscriptionExp = customer.subscriptionExp.toDate();
  if (subscriptionExp < new Date()) {
    throw new Error('Langganan Anda telah kedaluwarsa.\nPerpanjang langganan untuk melanjutkan.');
  }

  const spreadsheets = customer.spreadsheets || {};
  if (!spreadsheets[selectedFeature]) {
    throw new Error(
      `Spreadsheet ID untuk fitur ${selectedFeature} belum diatur!\n\n` +
      `Silakan kirim link spreadsheet Anda dengan format:\n` +
      `- Untuk Logam Mulia: SPREADSHEET LM: ${from} [link]\n` +
      `- Untuk Keuangan: SPREADSHEET KEUANGAN: ${from} [link]\n\n` +
      `Contoh link:\nhttps://docs.google.com/spreadsheets/d/1lPo7qP8szZr9WgDd_H82wtbK-p6cgyjOW2N_CvGGQZg/edit#gid=0`
    );
  }

  return customer;
}

module.exports = {
  handleRegistration,
  handleSpreadsheetLink,
  handleUpdateFeatures,
  checkCustomerStatus,
  updateLastActive,
  getConfig
};