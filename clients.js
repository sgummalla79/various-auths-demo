const crypto = require('crypto');
const fs     = require('fs');

// Registry of trusted clients.
// Each entry maps an `iss` claim value to the cert used to verify that client's assertions.
//
// certEnvVar can point to:
//   - a file path  (local dev):   CLIENT_CERT=certs/client.crt
//   - an inline PEM (production): CLIENT_CERT="-----BEGIN CERTIFICATE-----\n..."
//
// To add a new client:
//   1. Generate a cert signed by your CA
//   2. Add an entry below
//   3. Set the env var:
//      Local:      add to .env
//      Production: fly secrets set <ENV_VAR>="$(cat certs/<file>.crt | awk 'NF {printf "%s\\n", $0}')"

const CLIENTS = {
  'postman-client': {
    description: 'Postman / curl testing',
    certEnvVar:  'CLIENT_CERT',
  },
  'salesforce-mtls-client': {
    description: 'Salesforce External Credential',
    certEnvVar:  'SF_CLIENT_CERT',
  },
};

function loadCertPem(envVar) {
  const value = process.env[envVar];
  if (!value) return null;
  // File path or inline PEM
  if (!value.includes('-----BEGIN')) {
    return fs.readFileSync(value, 'utf8');
  }
  return value.replace(/\\n/g, '\n');
}

/**
 * Look up a client by its issuer id and return its public key.
 * Throws if the client is unknown or its cert env var is not set.
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

module.exports = { CLIENTS, getClientPublicKey };