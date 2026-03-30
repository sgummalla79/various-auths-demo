const jsforce  = require('jsforce');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const { Subscription } = require('./models/subscription');

// -----------------------------------------------
// Read loginUrl directly from env
// https://test.salesforce.com  → sandbox / scratch org
// https://login.salesforce.com → production (default)
// -----------------------------------------------
const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
console.log(`✅ Salesforce loginUrl: ${LOGIN_URL}`);

let activeConnection = null;

function loadPrivateKey() {
  const value = process.env.SF_PRIVATE_KEY;
  if (!value) throw new Error('SF_PRIVATE_KEY env var is not set');
  if (!value.includes('-----BEGIN')) return fs.readFileSync(value, 'utf8');
  return value.replace(/\\n/g, '\n');
}

async function getSFConnection() {
  const privateKey = loadPrivateKey();

  const token = jwt.sign(
    {
      iss: process.env.SF_CLIENT_ID,
      sub: process.env.SF_USERNAME,
      aud: LOGIN_URL,
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );

  const conn = new jsforce.Connection({ loginUrl: LOGIN_URL });
  await conn.authorize({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:  token,
  });
  return conn;
}

async function getActiveTopics() {
  const subscriptions = await Subscription.find({ isActive: true });
  if (subscriptions.length === 0) {
    console.warn('⚠️  No active subscriptions found in DB — CDC subscriber idle');
  }
  return subscriptions.map((s) => s.topic);
}

async function startCDCSubscriber(broadcast) {
  if (activeConnection) {
    try {
      activeConnection.streaming.disconnect();
      console.log('♻️  CDC subscriber stopped for reload');
    } catch (e) { /* ignore */ }
    activeConnection = null;
  }

  const topics = await getActiveTopics();
  if (topics.length === 0) {
    console.log('⏸️  CDC subscriber idle — no active subscriptions');
    return;
  }

  const conn = await getSFConnection();
  activeConnection = conn;

  topics.forEach((topic) => {
      conn.streaming.topic(topic).subscribe((event) => {    // ← remove -1
          console.log(`CDC event on ${topic}`, event.payload.ChangeEventHeader.changeType);
          broadcast({ topic, payload: event.payload });
      });
  });

  conn.streaming.on('error', async (err) => {
    console.error('Streaming error, reconnecting in 5s...', err.message);
    activeConnection = null;
    setTimeout(() => startCDCSubscriber(broadcast), 5000);
  });

  console.log(`✅ CDC subscriber active on ${topics.length} topic(s):`, topics);
}

module.exports = { startCDCSubscriber };