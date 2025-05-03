const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const P = require('pino');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const axios = require('axios');
const express = require('express');
const dns = require('dns').promises;

dotenv.config();

(async () => {
  try {
    console.log('Resolving web.whatsapp.com...');
    const addresses = await dns.lookup('web.whatsapp.com');
    console.log('Resolved addresses:', addresses);
  } catch (error) {
    console.error('DNS resolution failed:', error);
  }
})();

const WORKER_ENDPOINT = process.env.WORKER_ENDPOINT || 'http://localhost:3002';
const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || '6281234567890';
const RELEASE_MODE = process.env.RELEASE_MODE === 'true';
const ALLOWED_DEV_NUMBER = '6281519624321';

const app = express();
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
app.listen(3001, () => console.log('Gateway health check server running on port 3001'));

function isValidTransactionText(text) {
  const nominalPattern = /\d+(rb|ribu|jt|juta|k|rbu|miliar)?/i;
  return nominalPattern.test(text);
}

function getTextFromMessage(message) {
  return message?.conversation || message?.extendedTextMessage?.text || '';
}

async function handleMessageWithValidation(msg, imageBase64, sock) {
  const sender = msg.key.remoteJid;
  const text = getTextFromMessage(msg.message);
  const caption = msg.message?.imageMessage?.caption || '';

  if (text && isValidTransactionText(text)) {
    return await forwardToWorker({ message: msg, imageBufferBase64: imageBase64 });
  }

  if (imageBase64) {
    return await forwardToWorker({ message: msg, imageBufferBase64: imageBase64 });
  }

  return {
    reply: `❌ Format pesan tidak dikenali.\nSilakan kirim teks seperti: \"Beli ayam geprek 18rb\" atau foto struk belanja.`
  };
}

async function forwardToWorker(payload) {
  const response = await axios.post(`${WORKER_ENDPOINT}/process-message`, payload);
  return response.data;
}

async function startGateway() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    logger: P({ level: 'debug' }),
    auth: state,
    printQRInTerminal: true,
    qrTimeout: 60000,
    connectTimeoutMs: 60000
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`QR Code for ${BOT_PHONE_NUMBER}...`);
      QRCode.toString(qr, { type: 'terminal' }, (err, string) => {
        if (err) console.error('Failed to display QR code:', err);
        else console.log(`Scan QR for ${BOT_PHONE_NUMBER}:\n${string}`);
      });

      QRCode.toDataURL(qr, (err, url) => {
        if (err) console.error('Failed to generate QR URL:', err);
        else console.log(`Open this URL to view QR code: ${url}`);
      });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed:`, lastDisconnect?.error, 'Reconnect:', shouldReconnect);
      if (shouldReconnect) startGateway();
    } else if (connection === 'open') {
      console.log(`Connected: ${BOT_PHONE_NUMBER}`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
    if (!RELEASE_MODE && sender !== ALLOWED_DEV_NUMBER) {
      console.log(`Pesan dari ${sender} diabaikan karena mode pengembangan.`);
      return;
    }

    try {
      let imageBufferBase64 = null;
      if (msg.message.imageMessage) {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        imageBufferBase64 = buffer.toString('base64');
      }

      console.log(`Received message from ${msg.key.remoteJid}: ${getTextFromMessage(msg.message)}`);
      const result = await handleMessageWithValidation(msg, imageBufferBase64, sock);

      if (result.reply) {
        await sock.sendMessage(msg.key.remoteJid, { text: result.reply });
        console.log(`Sent reply to ${msg.key.remoteJid}: ${result.reply}`);
      } else {
        console.warn('No reply received from worker');
      }
    } catch (error) {
      console.error('Error forwarding message to worker:', error.message);
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Server error. Silakan coba lagi nanti.' });
    }
  });
}

startGateway().catch(err => console.error('Error starting gateway:', err));
