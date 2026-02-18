const https = require('https');
const fs = require('fs');
const express = require('express');

const app = express();
app.use(express.json());

// --- Load certs from environment variables (Fly.io secrets) ---
// The .replace() is needed because env vars store \n as literal string, not newline
const tlsOptions = {
  key:  process.env.SERVER_KEY.replace(/\\n/g, '\n'),
  cert: process.env.SERVER_CERT.replace(/\\n/g, '\n'),

  // Accept both your original CA and Salesforce's self-signed cert
  ca: [
    process.env.CA_CERT.replace(/\\n/g, '\n'),
    process.env.SF_CLIENT_CERT.replace(/\\n/g, '\n'),
  ],

  requestCert: true,
  rejectUnauthorized: true,
};

// --- Validate certs are present on startup ---
['SERVER_KEY', 'SERVER_CERT', 'CA_CERT', 'SF_CLIENT_CERT'].forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});

// --- Routes ---

app.get('/', (req, res) => {
  const clientCert = req.socket.getPeerCertificate();
  res.json({
    message: 'mTLS handshake successful!',
    clientCN: clientCert?.subject?.CN ?? 'unknown',
  });
});

app.get('/data', (req, res) => {
  res.json({ secret: 'Here is your protected data', timestamp: new Date() });
});

// --- Middleware: Enforce client cert on every request ---
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();

  if (!req.client.authorized) {
    return res.status(401).json({ error: 'Client certificate not authorized' });
  }

  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({ error: 'No client certificate provided' });
  }

  console.log(`Authenticated client: ${cert.subject.CN}`);
  next();
});

// --- Start Server ---
const PORT = process.env.PORT || 8443;

https.createServer(tlsOptions, app).listen(PORT, () => {
  console.log(`mTLS server running on port ${PORT}`);
});