const https   = require('https');
const fs      = require('fs');
const express = require('express');

const authRouter     = require('./src/routes/auth');
const resourceRouter = require('./src/routes/resource');
const usersRouter    = require('./src/routes/users');
const clientsRouter  = require('./src/routes/clients');
const patientsRouter = require('./src/routes/patients');
const { requestLogger, requireMTLS } = require('./src/middleware');
const { connectDB } = require('./src/config/db');

const app  = express();
const PORT = parseInt(process.env.PORT || '8443', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Salesforce sends form-encoded token requests
app.use(requestLogger);

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
// TLS options (mTLS)
//
// In production (Fly): env vars contain the full PEM string (newlines as \n)
// In local dev:        env vars contain file paths, read directly from disk
// -----------------------------------------------
function loadCert(envVar) {
  const value = process.env[envVar];
  if (!value.includes('-----BEGIN')) {
    return fs.readFileSync(value, 'utf8');
  }
  return value.replace(/\\n/g, '\n');
}

let tlsOptions;
try {
  tlsOptions = {
    key:                loadCert('SERVER_KEY'),
    cert:               loadCert('SERVER_CERT'),
    ca:                 loadCert('CLIENT_CA_CERT'),
    requestCert:        true,
    rejectUnauthorized: false, // TLS handshake completes; requireMTLS middleware returns JSON 401
  };
  console.log('✅ Certs loaded');
} catch (e) {
  console.error('❌ Cert load error:', e.message);
  process.exit(1);
}

// -----------------------------------------------
// Routes
//
// /auth/token is exempt from mTLS — Salesforce OAuth client_credentials
// flow cannot attach a client certificate. All other routes require mTLS.
// -----------------------------------------------
app.use('/auth',     authRouter);      // POST /auth/token — mTLS exempt (client_credentials + jwt-bearer)
app.use('/clients',  requireMTLS, clientsRouter);
app.use('/users',    requireMTLS, usersRouter);
app.use('/patients', requireMTLS, patientsRouter);
app.use('/resource', requireMTLS, resourceRouter);

connectDB().then(() => {
  // -----------------------------------------------
  // Single mTLS HTTPS server
  //
  // Fly.io: external port 8443 → raw TCP passthrough (handlers = []) → here
  // Local:  https://localhost:8443 (with --cert / --key / --cacert)
  // -----------------------------------------------
  const httpsServer = https.createServer(tlsOptions, app);
  httpsServer.on('tlsClientError', (err) => console.error('❌ TLS Error:', err.message));
  httpsServer.on('error',          (err) => console.error('❌ HTTPS Error:', err.message));
  httpsServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ mTLS server → https://localhost:${PORT}`);
  });
}).catch((err) => { console.error('❌ DB Connection Error:', err.message); process.exit(1); });