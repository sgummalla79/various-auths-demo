const jwt = require('jsonwebtoken');

const JWT_SECRET        = process.env.JWT_SECRET || 'change-me-in-production-use-a-long-random-secret';
const VALID_TOKEN_TYPES = ['access_token', 'client_credentials_token'];

// -----------------------------------------------
// Bearer Token Middleware
//
// Verifies JWT and populates req.user.
// Logs: token type, role, userId — NOT username/email (PII)
// -----------------------------------------------
const requireUserToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    console.warn(`[${req.requestId}] Auth ❌ — no Bearer token`);
    return res.status(401).json({ error: 'Authorization: Bearer <token> required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (!VALID_TOKEN_TYPES.includes(payload.type)) {
      console.warn(`[${req.requestId}] Auth ❌ — invalid token type: ${payload.type}`);
      return res.status(401).json({ error: 'Invalid token type', expected: VALID_TOKEN_TYPES });
    }

    req.user = payload;

    // Log role and userId only — never username (PII)
    const identity = payload.type === 'client_credentials_token'
      ? `clientId=${payload.clientId}`
      : `userId=${payload.userId} role=${payload.role}`;

    console.log(`[${req.requestId}] Auth ✅ type=${payload.type} ${identity}`);
    next();
  } catch (e) {
    console.warn(`[${req.requestId}] Auth ❌ — token verification failed: ${e.message}`);
    return res.status(401).json({ error: 'Invalid or expired token', detail: e.message });
  }
};

module.exports = { requireUserToken, JWT_SECRET };