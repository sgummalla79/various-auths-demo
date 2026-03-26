const https   = require('https');
const http    = require('http');
const express = require('express');

const authRouter     = require('./routes/auth');
const resourceRouter = require('./routes/resource');
const usersRouter    = require('./routes/users');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Salesforce sends form-encoded token requests

// -----------------------------------------------
// Env validation
// -----------------------------------------------
['SERVER_KEY', 'SERVER_CERT', 'CLIENT_CA_CERT'].forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`❌ Missing env var: ${envVar}`);
    process.exit(1);
  }
});

// -----------------------------------------------
// TLS options (mTLS server on 8443)
// -----------------------------------------------
let tlsOptions;
try {
  tlsOptions = {
    key:  process.env.SERVER_KEY.replace(/\\n/g, '\n'),
    cert: process.env.SERVER_CERT.replace(/\\n/g, '\n'),
    ca:   process.env.CLIENT_CA_CERT.replace(/\\n/g, '\n'),
    requestCert:        true,
    rejectUnauthorized: false,
  };
  console.log('✅ Certs loaded');
} catch (e) {
  console.error('❌ Cert parse error:', e.message);
  process.exit(1);
}

// -----------------------------------------------
// Routes
// -----------------------------------------------
app.use('/auth',     authRouter);      // POST /auth/token     — JWT assertion, no mTLS
app.use('/users',    usersRouter);     // CRUD /users          — Bearer token, admin only
app.use('/resource', resourceRouter);  // GET  /resource       — mTLS + Bearer token

// -----------------------------------------------
// Server 1 — HTTP on 8080
// Fly terminates public TLS on port 443 and forwards here.
// /auth/token and /users are reachable via port 443 (no mTLS).
// -----------------------------------------------
const httpServer = http.createServer(app);
httpServer.on('error', (err) => console.error('❌ HTTP Error:', err.message));
httpServer.listen(8080, '0.0.0.0', () => {
  console.log('✅ HTTP server listening on port 8080 (public via 443)');
});

// -----------------------------------------------
// Server 2 — mTLS HTTPS on 8443
// Raw TCP passthrough on Fly — client cert reaches the app.
// /resource enforces mTLS on this server.
// -----------------------------------------------
const httpsServer = https.createServer(tlsOptions, app);
httpsServer.on('tlsClientError', (err) => console.error('❌ TLS Error:', err.message));
httpsServer.on('error',          (err) => console.error('❌ HTTPS Error:', err.message));
httpsServer.listen(8443, '0.0.0.0', () => {
  console.log('✅ mTLS server listening on port 8443');
});