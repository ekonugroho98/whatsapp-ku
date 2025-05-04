const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const CONFIG_COLLECTION = 'botConfig';
const CONFIG_DOC = 'mainConfig';

// Tentukan jalur absolut ke file credentials_fb.json
const credentialsPath = path.join(__dirname, 'credentials_fb.json');

// Konfigurasi default tanpa googleSheets
const defaultConfig = {
  admin: {
    phoneNumber: process.env.ADMIN_PHONE_NUMBER || '6281519624321'
  },
  customers: [],
  ai: {
    endpoint: process.env.AI_ENDPOINT || 'http://ai-service:8000/process_expense',
    imageEndpoint: process.env.AI_IMAGE_ENDPOINT || 'http://ai-service:8000/process_image_expense'
  }
};

function initializeFirebase() {
  if (!admin.apps.length) {
    try {
      // Muat file credentials_fb.json secara langsung
      const serviceAccount = require(credentialsPath);

      // Validasi bahwa serviceAccount memiliki project_id
      if (!serviceAccount.project_id || typeof serviceAccount.project_id !== 'string') {
        throw new Error('Service account object must contain a string "project_id" property.');
      }

      // Inisialisasi Firebase Admin SDK (hanya untuk Firestore, tidak perlu databaseURL)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (error) {
      console.error('Failed to initialize Firebase:', error.message);
      throw error;
    }
  }
  return admin.firestore();
}

async function getConfig() {
  const db = initializeFirebase();
  try {
    const doc = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
    if (doc.exists) {
      return doc.data();
    } else {
      console.log('No config found in Firestore, creating new config...');
      await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(defaultConfig);
      return defaultConfig;
    }
  } catch (error) {
    console.error('Error initializing config from Firestore:', error);
    throw error;
  }
}

async function registerCustomer(newNumber, registeredBy, config) {
  const db = initializeFirebase();
  const exists = config.customers.some(c => c.phoneNumber === newNumber);
  if (exists) {
    throw new Error(`Nomor ${newNumber} sudah terdaftar sebagai pelanggan.`);
  }

  config.customers.push({
    phoneNumber: newNumber,
    spreadsheets: {}, // Ganti spreadsheetId menjadi spreadsheets
    whitelisted: true,
    subscriptionExp: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 hari dari sekarang
    registeredAt: admin.firestore.Timestamp.fromDate(new Date()),
    lastActive: admin.firestore.Timestamp.fromDate(new Date()),
    registeredBy: registeredBy,
    features: ['logam_mulia'] // Default hanya logam mulia
  });

  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
  return config;
}

async function updateSpreadsheetId(phoneNumber, feature, spreadsheetId, config) {
  const db = initializeFirebase();
  const customer = config.customers.find(c => c.phoneNumber === phoneNumber);
  
  if (!customer) {
    throw new Error('Nomor tidak ditemukan dalam daftar pelanggan.');
  }

  // Inisialisasi spreadsheets jika belum ada
  customer.spreadsheets = customer.spreadsheets || {};
  customer.spreadsheets[feature] = spreadsheetId; // Simpan spreadsheetId berdasarkan fitur
  customer.lastActive = admin.firestore.Timestamp.fromDate(new Date());
  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
  return config;
}

async function updateLastActive(phoneNumber, config) {
  const db = initializeFirebase();
  const customer = config.customers.find(c => c.phoneNumber === phoneNumber);
  
  if (customer) {
    customer.lastActive = admin.firestore.Timestamp.fromDate(new Date());
    await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
  }
  return config;
}

async function updateCustomerFeatures(phoneNumber, features, config) {
  const db = initializeFirebase();
  const customer = config.customers.find(c => c.phoneNumber === phoneNumber);
  
  if (!customer) {
    throw new Error('Nomor tidak ditemukan dalam daftar pelanggan.');
  }

  customer.features = features; // Update fitur
  customer.lastActive = admin.firestore.Timestamp.fromDate(new Date());
  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
  return config;
}

module.exports = { 
  initializeFirebase, 
  getConfig, 
  registerCustomer, 
  updateSpreadsheetId, 
  updateLastActive,
  updateCustomerFeatures
};