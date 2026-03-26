const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const express = require('express');

const authRouter     = require('./src/routes/auth');
const resourceRouter = require('./src/routes/resource');
const usersRouter    = require('./src/routes/users');
const clientsRouter   = require('./src/routes/clients');
const patientsRouter  = require('./src/routes/patients');
const { requestLogger } = require('./src/middleware');

const app = express();

// ADD these two lines at the top, after the require statements:
const { connectDB } = require('./src/config/db');

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
// TLS options (mTLS server on 8443)
//
// In production (Fly): env vars contain the full PEM string (newlines as \n)
// In local dev:        env vars contain file paths, read directly from disk
// -----------------------------------------------
function loadCert(envVar) {
  const value = process.env[envVar];
  // If it looks like a file path, read it — otherwise treat as inline PEM
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
    rejectUnauthorized: false,
  };
  console.log('✅ Certs loaded');
} catch (e) {
  console.error('❌ Cert load error:', e.message);
  process.exit(1);
}

// -----------------------------------------------
// Routes
// -----------------------------------------------
app.use('/auth',     authRouter);      // POST /auth/token        — JWT assertion / client_credentials
app.use('/clients',  clientsRouter);   // POST /clients/register  — register clients (admin)
app.use('/users',    usersRouter);     // CRUD /users             — Bearer token, role-based
app.use('/patients', patientsRouter);  // CRUD /patients          — Bearer token, role-based
app.use('/resource', resourceRouter);  // GET  /resource          — mTLS + Bearer token

connectDB().then(() => {
  // -----------------------------------------------
  // Server 1 — HTTP on 8080
  // Fly terminates public TLS on port 443 → forwards here.
  // Locally: http://localhost:8080
  // -----------------------------------------------
  const httpServer = http.createServer(app);
  httpServer.on('error', (err) => console.error('❌ HTTP Error:', err.message));
  httpServer.listen(8080, '0.0.0.0', () => {
    console.log('✅ HTTP  server → http://localhost:8080');
  });

  // -----------------------------------------------
  // Server 2 — mTLS HTTPS on 8443
  // Raw TCP passthrough on Fly — client cert reaches the app.
  // Locally: https://localhost:8443 (with client cert)
  // -----------------------------------------------
  const httpsServer = https.createServer(tlsOptions, app);
  httpsServer.on('tlsClientError', (err) => console.error('❌ TLS Error:', err.message));
  httpsServer.on('error',          (err) => console.error('❌ HTTPS Error:', err.message));
  httpsServer.listen(8443, '0.0.0.0', () => {
    console.log('✅ mTLS server → https://localhost:8443');
  });
}).catch((err) => {console.error('❌ DB Connection Error:', err.message); process.exit(1);});