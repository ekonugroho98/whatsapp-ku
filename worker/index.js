// === worker/index.js ===
const express = require('express');
const dotenv = require('dotenv');
const { createSheetsClient } = require('./sheets');
const { handleRegistration, handleSpreadsheetLink, handleUpdateFeatures, checkCustomerStatus, updateLastActive, getConfig } = require('./customer');
const { handleLogamMuliaText, handleLogamMuliaImage } = require('./handlers/logamMulia');
const { handleKeuanganText, handleKeuanganImage , handleKeuanganVoice, handleHapusTerakhirKeuangan } = require('./handlers/keuangan');

dotenv.config();

const app = express();
app.use(express.json({ limit: '20mb' }));

function detectFeature(text, customerFeatures) {
  if (customerFeatures.length === 1) {
    return { feature: customerFeatures[0], cleanText: text };
  }
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith('lm:')) {
    return { feature: 'logam_mulia', cleanText: text.split(':').slice(1).join(':').trim() };
  } else if (lowerText.startsWith('keuangan:')) {
    return { feature: 'keuangan', cleanText: text.split(':').slice(1).join(':').trim() };
  }
  return { feature: null, cleanText: text };
}

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.post('/process-message', async (req, res) => {
  const { message, imageBufferBase64 } = req.body;
  if (!message) return res.status(400).send('No message provided');

  try {
    let config = await getConfig();
    const sheets = await createSheetsClient();
    const from = message.key.remoteJid.split('@')[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const isAdmin = config.admin.phoneNumber === from;

    if (text.startsWith('DAFTAR : ')) {
      const result = await handleRegistration(text, from, isAdmin, config);
      return res.json({ reply: result.reply });
    }

    if (text.startsWith('UPDATE_FITUR : ')) {
      const result = await handleUpdateFeatures(text, from, isAdmin, config);
      return res.json({ reply: result.reply });
    }

    if (text.includes('docs.google.com/spreadsheets')) {
      const result = await handleSpreadsheetLink(text, from, isAdmin, config);
      return res.json({ reply: result.reply });
    }

    const customer = config.customers.find(c => c.phoneNumber === from);
    if (!customer) {
      return res.json({ reply: '❌ Nomor Anda tidak terdaftar sebagai pelanggan.\nHubungi admin untuk mendaftarkan nomor Anda.' });
    }

    const lowerText = text.toLowerCase();  // Tambahkan ini di awal blok 'if (selectedFeature === 'keuangan')'
    if (lowerText === 'hapus terakhir' || lowerText === 'hapus_transaksi_terakhir') {
      const result = await handleHapusTerakhirKeuangan(sheets, customer);
      return res.json({ reply: result.reply });
    }

    const customerFeatures = customer.features || ['logam_mulia'];
    let selectedFeature = null;
    let cleanText = text;

    if (text && !message.message?.imageMessage) {
      const { feature, cleanText: newCleanText } = detectFeature(text, customerFeatures);
      if (!feature && customerFeatures.length > 1) {
        return res.json({ reply: '❌ Anda terdaftar untuk lebih dari satu fitur. Harap gunakan pembeda: ...' });
      }
      selectedFeature = feature;
      cleanText = newCleanText;
    }

    if (message.message?.imageMessage || imageBufferBase64) {
      const caption = (message.message?.imageMessage?.caption || '').replace(/\r?\n/g, ' ').trim();
      const { feature, cleanText: newCleanCaption } = detectFeature(caption, customerFeatures);
      if (!feature && customerFeatures.length > 1) {
        return res.json({ reply: '❌ Anda terdaftar untuk lebih dari satu fitur. Harap gunakan pembeda pada caption: ...' });
      }
      selectedFeature = feature;
      cleanText = newCleanCaption;
    }

    if (!selectedFeature) {
      return res.json({ reply: '❌ Pesan tidak dikenali. Kirim teks transaksi atau gambar struk.' });
    }

    await checkCustomerStatus(from, config, selectedFeature);
    config = await updateLastActive(from, config);

    if (text && !message.message?.imageMessage) {
      if (selectedFeature === 'logam_mulia') {
        const result = await handleLogamMuliaText(sheets, customer, cleanText);
        return res.json({ reply: result.reply });
      } else if (selectedFeature === 'keuangan') {

        const lowerText = text.toLowerCase();  // Tambahkan ini di awal blok 'if (selectedFeature === 'keuangan')'
        if (lowerText === 'hapus terakhir' || lowerText === 'hapus_transaksi_terakhir') {
          const result = await handleHapusTerakhirKeuangan(sheets, customer);
          return res.json({ reply: result.reply });
        }

        const result = await handleKeuanganText(sheets, customer, cleanText);
        return res.json({ reply: result.reply });
      }
    }

    if (imageBufferBase64) {
      if (selectedFeature === 'logam_mulia') {
        const result = await handleLogamMuliaImage(sheets, customer, imageBufferBase64, cleanText);
        return res.json({ reply: result.reply });
      } else if (selectedFeature === 'keuangan') {
        const result = await handleKeuanganImage(sheets, customer, imageBufferBase64, cleanText);
        return res.json({ reply: result.reply });
      }
    }
  
 

    return res.json({ reply: '❌ Pesan tidak dikenali. Kirim teks transaksi atau gambar struk.' });
  } catch (error) {
    console.error('Error saat memproses pesan:', error.message);
    return res.json({ reply: `❌ ` + error.message });
  }
});

app.listen(3002, () => console.log(`Worker running on port 3002`));
