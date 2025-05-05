const redis = require('redis');
const { promisify } = require('util');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    prefix: 'keuangan:'
  });

client.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

(async () => {
  await client.connect();
})();

async function saveLastTransactionsToRedis(userId, data, ttlSeconds = 86400) {
  const key = `last_transactions:${userId}`;

  console.log('Saving to Redis:', key, data);
  await client.setEx(key, ttlSeconds, JSON.stringify(data));
}

async function getLastTransactionsFromRedis(userId) {
    const key = `last_transactions:${userId}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

async function deleteLastTransactionsFromRedis(userId) {
    const key = `last_transactions:${userId}`;
    console.log('Deleting to Redis:', key, key);
    await client.del(key);
  }

module.exports = {
  saveLastTransactionsToRedis,
  getLastTransactionsFromRedis,
  deleteLastTransactionsFromRedis,
};
