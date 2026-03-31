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

// Tracks the active jsforce connection so we can
// cleanly close it before reconnecting on reload
let activeConnection = null;

// -----------------------------------------------
// Load private key from file path (local dev)
// or inline PEM with escaped newlines (fly.io)
// -----------------------------------------------
function loadPrivateKey() {
  const value = process.env.SF_PRIVATE_KEY;
  if (!value) throw new Error('SF_PRIVATE_KEY env var is not set');
  if (!value.includes('-----BEGIN')) {
    return fs.readFileSync(value, 'utf8');
  }
  return value.replace(/\\n/g, '\n');
}

// -----------------------------------------------
// Authenticate with Salesforce via JWT Bearer
// -----------------------------------------------
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

// -----------------------------------------------
// Load active topics from MongoDB
// -----------------------------------------------
async function getActiveTopics() {
  const subscriptions = await Subscription.find({ isActive: true });
  if (subscriptions.length === 0) {
    console.warn('⚠️  No active subscriptions found in DB — CDC subscriber idle');
  }
  return subscriptions.map((s) => s.topic);
}

// -----------------------------------------------
// Start (or restart) the CDC subscriber
// Called on startup and after any subscription CRUD
//
// Each failure point has its own try/catch so that
// a Salesforce auth failure or DB error never
// crashes the HTTP/mTLS servers
// -----------------------------------------------
async function startCDCSubscriber(broadcast) {

  // Clean up existing connection before reconnecting
  if (activeConnection) {
    try {
      activeConnection.streaming.disconnect();
      console.log('♻️  CDC subscriber stopped for reload');
    } catch (e) { /* ignore disconnect errors */ }
    activeConnection = null;
  }

  // Load topics from DB
  let topics = [];
  try {
    topics = await getActiveTopics();
  } catch (err) {
    console.error('❌ Failed to load topics from DB:', err.message);
    console.log('🔄 Retrying CDC in 30s...');
    setTimeout(() => startCDCSubscriber(broadcast), 30000);
    return;
  }

  if (topics.length === 0) {
    console.log('⏸️  CDC subscriber idle — no active subscriptions');
    return;
  }

  // Connect to Salesforce
  let conn;
  try {
    conn = await getSFConnection();
  } catch (err) {
    console.error('❌ Salesforce connection failed:', err.message);
    console.log('🔄 Retrying CDC connection in 30s...');
    setTimeout(() => startCDCSubscriber(broadcast), 30000);
    return;
  }

  activeConnection = conn;

  // Subscribe to each active topic
  topics.forEach((topic) => {
    try {
      conn.streaming.topic(topic).subscribe((event) => {
        console.log(`CDC event on ${topic}`, event.payload.ChangeEventHeader.changeType);
        broadcast({ topic, payload: event.payload });
      });
    } catch (err) {
      console.error(`❌ Failed to subscribe to ${topic}:`, err.message);
    }
  });

  // Handle streaming errors — reconnect after 30s
  conn.streaming.on('error', (err) => {
    console.error('❌ Streaming error:', err.message);
    console.log('🔄 Reconnecting CDC in 30s...');
    activeConnection = null;
    setTimeout(() => startCDCSubscriber(broadcast), 30000);
  });

  console.log(`✅ CDC subscriber active on ${topics.length} topic(s):`, topics);
}

module.exports = { startCDCSubscriber };