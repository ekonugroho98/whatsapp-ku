const express = require('express');
const dotenv = require('dotenv');
const { createSheetsClient } = require('./sheets');
const { handleRegistration, handleSpreadsheetLink, handleUpdateFeatures, checkCustomerStatus, updateLastActive } = require('./customer');
const { handleLogamMuliaText, handleLogamMuliaImage } = require('./handlers/logamMulia');
const { handleKeuanganText, handleKeuanganImage } = require('./handlers/keuangan');

dotenv.config();

const app = express();
app.use(express.json());

// Store last text message per user to avoid race conditions
const lastTextMessages = new Map();

/**
 * Detects the feature based on the message text or caption and customer features.
 * @param {string} text - The message text or caption.
 * @param {string[]} customerFeatures - Array of customer features.
 * @returns {{ feature: string | null, cleanText: string }} - The detected feature and cleaned text.
 */
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Message processing endpoint
app.post('/process-message', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('No message provided');

  try {
    let config = await require('./customer').getConfig();
    const sheets = await createSheetsClient();
    const from = message.key.remoteJid.split('@')[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const isAdmin = config.admin.phoneNumber === from;
    console.debug('req body:', req.body);
    console.log('Text:', text);

    // Handle admin commands
    if (text.startsWith('DAFTAR : ')) {
      try {
        const result = await handleRegistration(text, from, isAdmin, config);
        return res.json({ reply: result.reply });
      } catch (error) {
        return res.json({ reply: `❌ Gagal mendaftarkan nomor: ${error.message}` });
      }
    }

    if (text.startsWith('UPDATE_FITUR : ')) {
      try {
        const result = await handleUpdateFeatures(text, from, isAdmin, config);
        return res.json({ reply: result.reply });
      } catch (error) {
        return res.json({ reply: `❌ Gagal mengatur fitur: ${error.message}` });
      }
    }

    if (text.includes('docs.google.com/spreadsheets')) {
      try {
        const result = await handleSpreadsheetLink(text, from, isAdmin, config);
        return res.json({ reply: result.reply });
      } catch (error) {
        return res.json({ reply: `❌ Gagal update spreadsheet: ${error.message}` });
      }
    }

    // Determine the customer
    const customer = config.customers.find(c => c.phoneNumber === from);
    if (!customer) {
      return res.json({ reply: '❌ Nomor Anda tidak terdaftar sebagai pelanggan.\nHubungi admin untuk mendaftarkan nomor Anda.' });
    }

    const customerFeatures = customer.features || ['logam_mulia'];
    let selectedFeature = null;
    let cleanText = text;

    // Handle text messages
    if (text && !message.message?.imageMessage) {
      const { feature, cleanText: newCleanText } = detectFeature(text, customerFeatures);
      if (!feature && customerFeatures.length > 1) {
        return res.json({
          reply: '❌ Anda terdaftar untuk lebih dari satu fitur. Harap gunakan pembeda:\n- Untuk Logam Mulia: LM: [pesan]\n- Untuk Keuangan: KEUANGAN: [pesan]\n\nContoh:\nLM: Antam 5g 5000k 1 Dana Darurat\nKEUANGAN: Makan 100k'
        });
      }
      selectedFeature = feature;
      cleanText = newCleanText;
    }

    // Handle image messages
    if (message.message?.imageMessage) {
      let cleanCaption = (message.message.imageMessage.caption || '').replace(/[\r\n]+/g, ' ').trim();
      console.log('Caption gambar asli:', cleanCaption);

      const { feature, cleanText: newCleanCaption } = detectFeature(cleanCaption, customerFeatures);
      if (!feature && customerFeatures.length > 1) {
        return res.json({
          reply: '❌ Anda terdaftar untuk lebih dari satu fitur. Harap gunakan pembeda pada caption:\n- Untuk Logam Mulia: LM: [pesan]\n- Untuk Keuangan: KEUANGAN: [pesan]\n\nContoh:\nLM: Dana Darurat\nKEUANGAN: Makan'
        });
      }
      selectedFeature = feature;
      cleanText = newCleanCaption;
      console.log(`Fitur yang dipilih untuk gambar: ${selectedFeature}, Clean caption: ${cleanText}`);
    }

    // If no feature is selected (e.g., no text or image caption), return error
    if (!selectedFeature) {
      return res.json({ reply: '❌ Pesan tidak dikenali. Kirim teks transaksi atau gambar struk.' });
    }

    // Check customer status
    try {
      await checkCustomerStatus(from, config, selectedFeature);
    } catch (error) {
      return res.json({ reply: `❌ ${error.message}` });
    }

    // Update lastActive
    config = await updateLastActive(from, config);

    try {
      // Process text message
      if (text && !message.message?.imageMessage) {
        if (selectedFeature === 'logam_mulia') {
          const result = await handleLogamMuliaText(sheets, customer, cleanText);
          if (result.saveText) {
            lastTextMessages.set(from, result.saveText);
            console.log(`Pesan teks disimpan sebagai konteks untuk ${from}:`, result.saveText);
          }
          return res.json({ reply: result.reply });
        } else if (selectedFeature === 'keuangan') {
          console.log('Pesan teks untuk keuangan:', customer);
          const result = await handleKeuanganText(sheets, customer, cleanText);
          return res.json({ reply: result.reply });
        }
      }

      // Process image message
      if (message.message?.imageMessage) {
        if (selectedFeature === 'logam_mulia') {
          const result = await handleLogamMuliaImage(sheets, customer, message.message.imageMessage, cleanText);
          return res.json({ reply: result.reply });
        } else if (selectedFeature === 'keuangan') {
          const result = await handleKeuanganImage(sheets, customer, message.message.imageMessage);
          return res.json({ reply: result.reply });
        }
      }

      return res.json({ reply: '❌ Pesan tidak dikenali. Kirim teks transaksi atau gambar struk.' });
    } catch (error) {
      console.error('Error saat memproses pesan:', error.message);
      return res.json({
        reply: `❌ Error:\n${error.message}\n\nContoh format yang benar:\n- Logam Mulia: "Antam 5g 5000k 1 Dana Darurat"\n- Keuangan: "Makan 100k"`
      });
    }
  } catch (error) {
    console.error('Error saat menginisialisasi konfigurasi:', error.message);
    return res.status(500).json({ reply: '❌ Server error. Silakan coba lagi nanti.' });
  }
});

// Start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Worker running on port ${PORT}`));