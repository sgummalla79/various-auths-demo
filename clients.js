// Registry of trusted clients.
// Each client has a unique id (matched against the JWT assertion `iss` claim)
// and the PEM content of its certificate (used to verify the assertion signature).
//
// Add a new client:
//   1. Generate a cert signed by your CA
//   2. Add an entry below with its cert loaded from an env var
//   3. Set the secret on Fly:
//      fly secrets set <ENV_VAR>="$(cat certs/<file>.crt | awk 'NF {printf "%s\\n", $0}')"

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

/**
 * Look up a client by its issuer id and return its public key.
 * Throws if the client is unknown or its cert env var is not set.
 */
function getClientPublicKey(issuerId) {
  const crypto = require('crypto');

  const client = CLIENTS[issuerId];
  if (!client) {
    throw new Error(`Unknown client issuer: '${issuerId}'`);
  }

  const pem = process.env[client.certEnvVar];
  if (!pem) {
    throw new Error(`Cert env var '${client.certEnvVar}' is not set for client '${issuerId}'`);
  }

  return crypto.createPublicKey({ key: pem.replace(/\\n/g, '\n'), format: 'pem' });
}

module.exports = { CLIENTS, getClientPublicKey };