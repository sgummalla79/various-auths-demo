const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const express = require('express');
const cors    = require('cors');

const authRouter          = require('./src/routes/auth');
const resourceRouter      = require('./src/routes/resource');
const usersRouter         = require('./src/routes/users');
const clientsRouter       = require('./src/routes/clients');
const patientsRouter      = require('./src/routes/patients');
const subscriptionsRouter = require('./src/routes/subscriptions');
const { requestLogger }   = require('./src/middleware');
const { connectDB }       = require('./src/config/db');
const { addClient, broadcast } = require('./src/sse');
const { startCDCSubscriber }   = require('./src/salesforce');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Salesforce sends form-encoded token requests
app.use(requestLogger);

// -----------------------------------------------
// CORS
// Covers all Salesforce Lightning origins —
// production, scratch orgs, sandboxes, communities
// -----------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl / Postman / server-to-server

    const allowed = [
      /\.salesforce\.com$/,
      /\.force\.com$/,        // covers *.lightning.force.com, *.scratch.lightning.force.com etc.
      /\.cloudforce\.com$/,
    ];

    const isAllowed = allowed.some((pattern) => pattern.test(origin));
    console.log(`CORS — origin: ${origin} → ${isAllowed ? '✅ allowed' : '❌ blocked'}`);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

// -----------------------------------------------
// Env validation
// -----------------------------------------------
[
  'SERVER_KEY', 'SERVER_CERT', 'CLIENT_CA_CERT',   // mTLS / TLS
  'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY',  // Salesforce CDC
  'SSE_SECRET',                                      // SSE fanout auth
].forEach((envVar) => {
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
// Inject reloadCDCSubscriber into req so that
// subscription CRUD routes can trigger a live
// reload without importing broadcast directly
// -----------------------------------------------
app.use((req, res, next) => {
  req.reloadCDCSubscriber = () => startCDCSubscriber(broadcast);
  next();
});

// -----------------------------------------------
// SSE bearer token auth middleware
// Only guards /events — all other routes use
// their own auth (requireUserToken, requireMTLS)
// -----------------------------------------------
function requireSSESecret(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${process.env.SSE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// -----------------------------------------------
// Routes — existing unchanged
// -----------------------------------------------
app.use('/auth',          authRouter);       // POST /auth/token        — JWT assertion / client_credentials
app.use('/clients',       clientsRouter);    // POST /clients/register  — register clients (admin)
app.use('/users',         usersRouter);      // CRUD /users             — Bearer token, role-based
app.use('/patients',      patientsRouter);   // CRUD /patients          — Bearer token, role-based
app.use('/resource',      resourceRouter);   // GET  /resource          — mTLS + Bearer token
app.use('/subscriptions', subscriptionsRouter); // CRUD /subscriptions  — CDC topic management (admin)

// CDC fanout endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/events',  requireSSESecret, (req, res) => addClient(res));

// -----------------------------------------------
// DB connect → start servers → start CDC
//
// Servers start first — health check responds
// immediately regardless of CDC status.
// CDC runs independently and never blocks the
// HTTP / mTLS servers even if Salesforce is down.
// -----------------------------------------------
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

  // -----------------------------------------------
  // CDC subscriber — fully isolated from servers.
  // If Salesforce auth fails or topics are empty,
  // only the CDC subscriber is affected — HTTP and
  // mTLS servers keep running and serving traffic.
  // -----------------------------------------------
  startCDCSubscriber(broadcast).catch((err) => {
    console.error('❌ CDC subscriber failed to start:', err.message);
    // intentionally no process.exit() here
  });

}).catch((err) => {
  console.error('❌ DB Connection Error:', err.message);
  process.exit(1);
});