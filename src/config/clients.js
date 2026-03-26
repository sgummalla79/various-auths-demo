const crypto = require('crypto');
const fs     = require('fs');

// -----------------------------------------------
// Client Registry
//
// jwt-bearer flow:     clients authenticate via JWT assertion (cert-based)
// client_credentials:  clients authenticate via client_id + client_secret
//
// Each client entry has:
//   description   — human-readable label
//   certEnvVar    — env var holding the client cert PEM (for jwt-bearer)
//   clientId      — unique client identifier (for client_credentials)
//   secretEnvVar  — env var holding the hashed client secret (for client_credentials)
//
// To add a new client:
//   1. Generate a secret:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   2. Hash it:            node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YOUR_SECRET').digest('hex'))"
//   3. Add entry below
//   4. Set env vars:
//      Local:      add to .env
//      Production: fly secrets set <ENV_VAR>="<value>"
// -----------------------------------------------

const CLIENTS = {
  'postman-client': {
    description: 'Postman / curl testing',
    certEnvVar:  'CLIENT_CERT',                // jwt-bearer cert
    clientId:    'postman-client',             // client_credentials id
    secretEnvVar: 'POSTMAN_CLIENT_SECRET',     // client_credentials secret (hashed)
  },
  'salesforce-mtls-client': {
    description: 'Salesforce External Credential',
    certEnvVar:  'SF_CLIENT_CERT',
    clientId:    'salesforce-mtls-client',
    secretEnvVar: 'SF_CLIENT_SECRET',
  },
};

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function loadCertPem(envVar) {
  const value = process.env[envVar];
  if (!value) return null;
  if (!value.includes('-----BEGIN')) {
    return fs.readFileSync(value, 'utf8');
  }
  return value.replace(/\\n/g, '\n');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Look up a client by iss claim and return its public key.
 * Used by the jwt-bearer flow.
 */
function getClientPublicKey(issuerId) {
  const client = CLIENTS[issuerId];
  if (!client) {
    throw new Error(`Unknown client issuer: '${issuerId}'`);
  }
  const pem = loadCertPem(client.certEnvVar);
  if (!pem) {
    throw new Error(`Cert env var '${client.certEnvVar}' is not set for client '${issuerId}'`);
  }
  return crypto.createPublicKey({ key: pem, format: 'pem' });
}

/**
 * Verify a client_id + client_secret pair.
 * Used by the client_credentials flow.
 * Returns the client entry on success, throws on failure.
 */
function verifyClientCredentials(clientId, clientSecret) {
  const client = Object.values(CLIENTS).find(c => c.clientId === clientId);
  if (!client) {
    throw new Error(`Unknown client_id: '${clientId}'`);
  }

  const storedHash = process.env[client.secretEnvVar];
  if (!storedHash) {
    throw new Error(`Secret env var '${client.secretEnvVar}' is not set for client '${clientId}'`);
  }

  // Constant-time comparison to prevent timing attacks
  const providedHash = hashSecret(clientSecret);
  const storedBuf    = Buffer.from(storedHash,   'hex');
  const providedBuf  = Buffer.from(providedHash, 'hex');

  if (storedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(storedBuf, providedBuf)) {
    throw new Error('Invalid client_secret');
  }

  return client;
}

module.exports = { CLIENTS, getClientPublicKey, verifyClientCredentials, hashSecret };
