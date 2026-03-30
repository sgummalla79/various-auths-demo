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
const subscriptionsRouter = require('./src/routes/subscriptions');  // ← NEW
const { requestLogger }   = require('./src/middleware');
const { connectDB }       = require('./src/config/db');
const { addClient, broadcast }     = require('./src/sse');
const { startCDCSubscriber }       = require('./src/salesforce');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

app.use(cors({
  origin: [
    /\.salesforce\.com$/,
    /\.lightning\.force\.com$/,       // production lightning
    /\.scratch\.lightning\.force\.com$/,  // ← NEW scratch orgs
    /\.my\.salesforce\.com$/,
    /\.cloudforce\.com$/,
  ],
  credentials: true,
}));

// -----------------------------------------------
// Env validation
// -----------------------------------------------
[
  'SERVER_KEY', 'SERVER_CERT', 'CLIENT_CA_CERT',
  'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY',
  'SSE_SECRET',
].forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`❌ Missing env var: ${envVar}`);
    process.exit(1);
  }
});

// -----------------------------------------------
// TLS options — UNCHANGED
// -----------------------------------------------
function loadCert(envVar) {
  const value = process.env[envVar];
  if (!value.includes('-----BEGIN')) return fs.readFileSync(value, 'utf8');
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
// Inject reloadCDCSubscriber into req so routes
// can trigger a live reload after any mutation
// without importing broadcast directly
// -----------------------------------------------
app.use((req, res, next) => {                                    // ← NEW
  req.reloadCDCSubscriber = () => startCDCSubscriber(broadcast);
  next();
});

// -----------------------------------------------
// SSE bearer token auth
// -----------------------------------------------
function requireSSESecret(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${process.env.SSE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// -----------------------------------------------
// Routes
// -----------------------------------------------
app.use('/auth',          authRouter);
app.use('/clients',       clientsRouter);
app.use('/users',         usersRouter);
app.use('/patients',      patientsRouter);
app.use('/resource',      resourceRouter);
app.use('/subscriptions', subscriptionsRouter);                  // ← NEW

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/events',  requireSSESecret, (req, res) => addClient(res));

// -----------------------------------------------
// DB connect → start servers → start CDC
// -----------------------------------------------
connectDB().then(() => {
  const httpServer = http.createServer(app);
  httpServer.on('error', (err) => console.error('❌ HTTP Error:', err.message));
  httpServer.listen(8080, '0.0.0.0', () => {
    console.log('✅ HTTP  server → http://localhost:8080');
  });

  const httpsServer = https.createServer(tlsOptions, app);
  httpsServer.on('tlsClientError', (err) => console.error('❌ TLS Error:', err.message));
  httpsServer.on('error',          (err) => console.error('❌ HTTPS Error:', err.message));
  httpsServer.listen(8443, '0.0.0.0', () => {
    console.log('✅ mTLS server → https://localhost:8443');
  });

  startCDCSubscriber(broadcast).catch((err) => {
    console.error('❌ CDC subscriber failed to start:', err.message);
  });

}).catch((err) => { console.error('❌ DB Connection Error:', err.message); process.exit(1); });