const express = require('express');
const jwt     = require('jsonwebtoken');

const { USERS }              = require('../data/users');
const { JWT_SECRET }         = require('../middleware');
const { getClientPublicKey } = require('../clients');

const router = express.Router();

const ACCESS_TOKEN_EXPIRY = '1h';

// Replay prevention — in-memory (use Redis in production)
const usedJtis = new Set();

// -----------------------------------------------
// Helper — verify JWT assertion signature
//
// Decodes the `iss` claim from the assertion without verifying,
// looks up the matching client certificate from the registry,
// then verifies the signature against that certificate's public key.
// -----------------------------------------------
function verifyAssertion(assertion) {
  // Decode payload first (unverified) to extract issuer for cert lookup
  const [headerB64, payloadB64] = assertion.split('.');
  const header  = JSON.parse(Buffer.from(headerB64,  'base64url').toString());
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  if (!payload.iss) {
    throw new Error('Assertion missing iss claim');
  }

  // Look up the registered client cert by issuer id
  const clientPublicKey = getClientPublicKey(payload.iss);

  return jwt.verify(assertion, clientPublicKey, { algorithms: [header.alg || 'RS256'] });
}

// -----------------------------------------------
// POST /auth/token
//
// No mTLS required — reachable on port 443 (Salesforce) and 8443 (Postman).
// Client proves identity via JWT assertion signed with its private key.
// The `iss` claim identifies which registered client is asserting.
// The `username` claim selects which API user to issue a token for.
//
// Accepts:
//   JSON body:         { "assertion": "<signed-jwt>" }
//   Form-encoded (SF): client_assertion=<signed-jwt>
//
// Returns standard OAuth 2.0 response:
//   { access_token, token_type, expires_in }
// -----------------------------------------------
router.post('/token', (req, res) => {
  const assertion = req.body.client_assertion || req.body.assertion;

  if (!assertion) {
    return res.status(400).json({ error: 'assertion or client_assertion is required' });
  }

  let claims;
  try {
    claims = verifyAssertion(assertion);
  } catch (e) {
    console.warn('❌ Assertion verification failed:', e.message);
    return res.status(401).json({ error: 'Invalid assertion', detail: e.message });
  }

  if (!claims.iss || !claims.sub || !claims.aud || !claims.jti || !claims.username) {
    return res.status(400).json({ error: 'Assertion must include: iss, sub, aud, jti, username' });
  }

  if (usedJtis.has(claims.jti)) {
    return res.status(401).json({ error: 'Assertion already used (replay detected)' });
  }
  usedJtis.add(claims.jti);
  setTimeout(() => usedJtis.delete(claims.jti), 60 * 60 * 1000);

  // Look up by the username field value (e.g. 'sgummalla@exp-cloud.org')
  const user = Object.values(USERS).find(u => u.username === claims.username);
  if (!user) {
    return res.status(404).json({ error: `User '${claims.username}' not found` });
  }

  const access_token = jwt.sign(
    { type: 'access_token', userId: user.id, username: claims.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  console.log(`✅ Issued access_token — user=${claims.username} role=${user.role} client=${claims.iss}`);
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600 });
});

module.exports = router;