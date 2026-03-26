const express = require('express');
const jwt     = require('jsonwebtoken');

const { JWT_SECRET }                                      = require('../middleware');
const { getClientPublicKey }                              = require('../config/clients');
const User                                                = require('../models/user');
const Client                                              = require('../models/client');

const router = express.Router();

const ACCESS_TOKEN_EXPIRY = '1h';

const GRANT_TYPE_JWT_BEARER         = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const GRANT_TYPE_CLIENT_CREDENTIALS = 'client_credentials';

// Replay prevention for jwt-bearer assertions (in-memory; use Redis in production)
const usedJtis = new Set();

// -----------------------------------------------
// Helper — verify JWT assertion signature (jwt-bearer only)
// -----------------------------------------------
function verifyAssertion(assertion) {
  const [headerB64, payloadB64] = assertion.split('.');
  const header  = JSON.parse(Buffer.from(headerB64,  'base64url').toString());
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  if (!payload.iss) throw new Error('Assertion missing iss claim');

  const clientPublicKey = getClientPublicKey(payload.iss);
  return jwt.verify(assertion, clientPublicKey, { algorithms: [header.alg || 'RS256'] });
}

// -----------------------------------------------
// POST /auth/token
//
// grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer  (default)
//   Body: { assertion, username }
//   Client proves identity via signed JWT assertion.
//   Token is scoped to the user — role-based authorization applies.
//
// grant_type=client_credentials
//   Body: { client_id, client_secret }
//   Client proves identity via shared secret.
//   Token is scoped to the client — system-level (admin) access.
// -----------------------------------------------
router.post('/token', async (req, res) => {
  const grantType = req.body.grant_type || GRANT_TYPE_JWT_BEARER;

  if (![GRANT_TYPE_JWT_BEARER, GRANT_TYPE_CLIENT_CREDENTIALS].includes(grantType)) {
    return res.status(400).json({
      error:             'unsupported_grant_type',
      error_description: `grant_type must be '${GRANT_TYPE_JWT_BEARER}' or '${GRANT_TYPE_CLIENT_CREDENTIALS}'`,
    });
  }

  // ── client_credentials ─────────────────────────────────────────
  // Salesforce External Credentials sends grant_type=client_credentials
  // BUT also sends client_assertion (JWT). If client_assertion is present,
  // route to the jwt-bearer handler regardless of grant_type.
  if (grantType === GRANT_TYPE_CLIENT_CREDENTIALS && !req.body.client_assertion) {
    const { client_id, client_secret } = req.body;

    if (!client_id || !client_secret) {
      return res.status(400).json({
        error:             'invalid_request',
        error_description: 'client_id and client_secret are required for client_credentials grant',
      });
    }

    const client = await Client.findOne({ clientId: client_id });
    if (!client) {
      console.warn(`❌ client_credentials — unknown client_id: '${client_id}'`);
      return res.status(401).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
    }

    // Constant-time comparison to prevent timing attacks
    const crypto = require('crypto');
    const providedHash = crypto.createHash('sha256').update(client_secret).digest('hex');
    const storedBuf = Buffer.from(client.clientSecretHash, 'hex');
    const providedBuf  = Buffer.from(providedHash,            'hex');

    if (storedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(storedBuf, providedBuf)) {
      console.warn(`❌ client_credentials — invalid secret for client_id: '${client_id}'`);
      return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client_secret' });
    }

    const access_token = jwt.sign(
      {
        type:     'client_credentials_token',
        clientId: client_id,
        role:     'admin',
        scope:    client.scope,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    console.log(`✅ Issued client_credentials token — client=${client_id} (${client.description})`);
    return res.json({ access_token, token_type: 'Bearer', expires_in: 3600, scope: client.scope });
  }

  // ── jwt-bearer ─────────────────────────────────────────────────
  const assertion = req.body.client_assertion || req.body.assertion;

  if (!assertion) {
    return res.status(400).json({
      error:             'invalid_request',
      error_description: 'assertion or client_assertion is required for jwt-bearer grant',
    });
  }

  let claims;
  try {
    claims = verifyAssertion(assertion);
  } catch (e) {
    console.warn('❌ Assertion verification failed:', e.message);
    return res.status(401).json({ error: 'invalid_client', error_description: e.message });
  }

  if (!claims.iss || !claims.sub || !claims.aud || !claims.jti) {
    return res.status(400).json({
      error:             'invalid_request',
      error_description: 'Assertion must include: iss, sub, aud, jti',
    });
  }

  if (usedJtis.has(claims.jti)) {
    return res.status(401).json({ error: 'invalid_grant', error_description: 'Assertion already used (replay detected)' });
  }
  usedJtis.add(claims.jti);
  setTimeout(() => usedJtis.delete(claims.jti), 60 * 60 * 1000);

  if (!claims.username) {
    return res.status(400).json({
      error:             'invalid_request',
      error_description: 'Assertion must include a username claim for jwt-bearer grant',
    });
  }

  const user = await User.findOne({ username: claims.username });
  if (!user) {
    return res.status(404).json({ error: 'invalid_grant', error_description: `User '${claims.username}' not found` });
  }

  const access_token = jwt.sign(
    {
      type:     'access_token',
      userId:   user.id,
      username: claims.username,
      role:     user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  console.log(`✅ Issued access_token — user=${claims.username} role=${user.role} client=${claims.iss}`);
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600 });
});

module.exports = router;
