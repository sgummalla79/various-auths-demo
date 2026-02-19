const https = require('https');
const http = require('http');
const express = require('express');

const app = express();
app.use(express.json());

// Validate env vars
['SERVER_KEY', 'SERVER_CERT', 'CLIENT_CA_CERT'].forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`❌ Missing: ${envVar}`);
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
    rejectUnauthorized: false,
  };
  console.log('✅ Certs loaded');
} catch (e) {
  console.error('❌ Cert parse error:', e.message);
  process.exit(1);
}

// mTLS middleware
const requireMTLS = (req, res, next) => {
  // Reject if not a TLS connection (e.g. accessed via port 443 HTTP)
  if (!req.socket || typeof req.socket.getPeerCertificate !== 'function') {
    return res.status(401).json({
      error: 'mTLS required — connect via port 8443 with a client certificate'
    });
  }

  const cert = req.socket.getPeerCertificate();

  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({ error: 'No client certificate provided' });
  }

  if (!req.client.authorized) {
    return res.status(401).json({
      error: 'Client certificate not authorized',
      reason: req.client.authorizationError
    });
  }

  console.log(`✅ Authenticated: ${cert.subject.CN}`);
  next();
};

// -----------------------------------------------
// Routes
// -----------------------------------------------

// Public route
app.get('/', (req, res) => {
  res.json({ message: 'Public endpoint', status: 'ok' });
});

// Protected route — requires mTLS via port 8443
app.get('/resource', requireMTLS, (req, res) => {
  const cert = req.socket.getPeerCertificate();
  res.json({
    message: 'mTLS verified!',
    clientCN: cert?.subject?.CN ?? 'unknown',
    secret: 'Protected data',
    timestamp: new Date(),
  });
});

// -----------------------------------------------
// Server 1: Plain HTTP on 8080
// Fly handles TLS on port 443 → forwards to 8080
// -----------------------------------------------
const httpServer = http.createServer(app);

httpServer.on('error', (err) => {
  console.error('❌ HTTP Server Error:', err.message);
});

httpServer.listen(8080, '0.0.0.0', () => {
  console.log('✅ HTTP server on port 8080 (public via 443)');
});

// -----------------------------------------------
// Server 2: HTTPS on 8443
// Raw TCP passthrough — true mTLS
// -----------------------------------------------
const httpsServer = https.createServer(tlsOptions, app);

httpsServer.on('tlsClientError', (err) => {
  console.error('❌ TLS Error:', err.message);
});

httpsServer.on('error', (err) => {
  console.error('❌ HTTPS Server Error:', err.message);
});

httpsServer.listen(8443, '0.0.0.0', () => {
  console.log('✅ HTTPS mTLS server on port 8443 (protected)');
});