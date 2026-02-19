const https = require('https');
const express = require('express');

const app = express();
app.use(express.json());

// Validate env vars
['SERVER_KEY', 'SERVER_CERT', 'CLIENT_CA_CERT'].forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});

// Parse certs
let tlsOptions;
try {
  tlsOptions = {
    key:  process.env.SERVER_KEY.replace(/\\n/g, '\n'),
    cert: process.env.SERVER_CERT.replace(/\\n/g, '\n'),
    ca:   process.env.CLIENT_CA_CERT.replace(/\\n/g, '\n'),
    requestCert: true,
    rejectUnauthorized: true,
  };
  console.log('✅ Certs loaded successfully');
} catch (e) {
  console.error('❌ Failed to parse certs:', e.message);
  process.exit(1);
}

// Middleware
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();

  if (!req.client.authorized) {
    console.log(`❌ Unauthorized: ${req.client.authorizationError}`);
    return res.status(401).json({ error: 'Client certificate not authorized' });
  }

  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({ error: 'No client certificate provided' });
  }

  console.log(`✅ Authenticated client: ${cert.subject.CN}`);
  next();
});

// Routes
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

// Always listen on 8443
const PORT = 8443;

const server = https.createServer(tlsOptions, app);

server.on('tlsClientError', (err) => {
  console.error('❌ TLS Client Error:', err.message);
});

server.on('error', (err) => {
  console.error('❌ Server Error:', err.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ mTLS server running on port ${PORT}`);
});