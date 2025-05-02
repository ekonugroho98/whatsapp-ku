const admin = require('firebase-admin');
const path = require('path');

const credentialsPath = path.join(__dirname, 'credentials_fb.json');
const serviceAccount = require(credentialsPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CONFIG_COLLECTION = 'botConfig';
const CONFIG_DOC = 'mainConfig';

async function migrateData() {
  const doc = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
  if (!doc.exists) {
    console.log('No config found.');
    return;
  }

  const config = doc.data();
  const updatedCustomers = config.customers.map(customer => {
    if (customer.spreadsheetId) {
      const spreadsheets = {
        logam_mulia: customer.spreadsheetId // Asumsikan spreadsheetId lama untuk logam_mulia
      };
      delete customer.spreadsheetId;
      customer.spreadsheets = spreadsheets;
    }
    return customer;
  });

  config.customers = updatedCustomers;
  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(config);
  console.log('Data migration completed.');
}

migrateData().catch(error => {
  console.error('Error during migration:', error);
  process.exit(1);
});