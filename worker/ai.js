const axios = require('axios');

if (!process.env.AI_ENDPOINT_KEUANGAN) {
  throw new Error("❌ Env AI_ENDPOINT_KEUANGAN belum diset");
}

if (!process.env.AI_IMAGE_ENDPOINT_KEUANGAN) {
  throw new Error("❌ Env AI_IMAGE_ENDPOINT_KEUANGAN belum diset");
}
if (!process.env.AI_ENDPOINT_LM) {
  throw new Error("❌ Env AI_ENDPOINT_LM belum diset");
}

if (!process.env.AI_IMAGE_ENDPOINT_LM) {
  throw new Error("❌ Env AI_IMAGE_ENDPOINT_LM belum diset");
}

// Endpoint AI untuk kedua fitur
const AI_ENDPOINT_LM = process.env.AI_ENDPOINT_LM;
const AI_IMAGE_ENDPOINT_LM = process.env.AI_IMAGE_ENDPOINT_LM;
const AI_ENDPOINT_KEUANGAN = process.env.AI_ENDPOINT_KEUANGAN;
const AI_IMAGE_ENDPOINT_KEUANGAN = process.env.AI_IMAGE_ENDPOINT_KEUANGAN;

// Get category from AI untuk Logam Mulia
async function getCategoryFromAILM(text) {
  try {
    const response = await axios.post(AI_ENDPOINT_LM, { text }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error('Error calling AI endpoint for Logam Mulia:', error.message);
    throw new Error(error.response?.data?.detail || "Invalid format. Gunakan format: [Jenis LM] [Berat]g [Nominal] [Qty] [Tujuan Savings]. Contoh: Antam 5g 5000k 1 Dana Darurat");
  }
}

// Get category from AI untuk Keuangan
async function getCategoryFromAIKeuangan(text) {
  try {
    const response = await axios.post(AI_ENDPOINT_KEUANGAN, { text }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error('Error calling AI endpoint for Keuangan:', error.message);
    throw new Error(error.response?.data?.detail || "Invalid format. Gunakan format: Makan 100k atau Rp30.000");
  }
}

// Process image with AI untuk Logam Mulia
async function processImageWithAILM(imageBuffer, caption) {
  try {
    const response = await axios.post(AI_IMAGE_ENDPOINT_LM, { 
      image: imageBuffer.toString('base64'),
      caption: caption
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data.transactions;
  } catch (error) {
    console.error('Error calling AI image endpoint for Logam Mulia:', error.message);
    throw new Error('Failed to process image with AI for Logam Mulia.');
  }
}

// Process image with AI untuk Keuangan
async function processImageWithAIKeuangan(imageBuffer) {

  console.log('Processing image with AI for Keuangan...', AI_IMAGE_ENDPOINT_KEUANGAN);
  try {
    const response = await axios.post(AI_IMAGE_ENDPOINT_KEUANGAN, { 
      image: imageBuffer.toString('base64')
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return response.data.transactions;
  } catch (error) {
    console.error('Error calling AI image endpoint for Keuangan:', error.message);
    throw new Error('Failed to process image with AI for Keuangan.');
  }
}

module.exports = {
  getCategoryFromAILM,
  getCategoryFromAIKeuangan,
  processImageWithAILM,
  processImageWithAIKeuangan
};