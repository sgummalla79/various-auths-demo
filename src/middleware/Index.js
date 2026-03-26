const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-use-a-long-random-secret';

const VALID_TOKEN_TYPES = ['access_token', 'client_credentials_token'];

/** Require a valid mTLS peer certificate */
const requireMTLS = (req, res, next) => {
  if (!req.socket || typeof req.socket.getPeerCertificate !== 'function') {
    return res.status(401).json({ error: 'mTLS required — connect via port 8443 with a client certificate' });
  }
  const cert = req.socket.getPeerCertificate();
  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({ error: 'No client certificate provided' });
  }
  if (!req.client.authorized) {
    return res.status(401).json({ error: 'Client certificate not authorized', reason: req.client.authorizationError });
  }
  req.clientCert = cert;
  console.log(`✅ mTLS authenticated: ${cert.subject?.CN}`);
  next();
};

/**
 * Require a valid Bearer token — accepts both:
 *   access_token            (jwt-bearer flow — user-scoped, has username + role)
 *   client_credentials_token (client_credentials flow — client-scoped, role = admin)
 *
 * Populates req.user with token payload so downstream routes
 * can use req.user.role and req.user.username uniformly.
 */
const requireUserToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization: Bearer <token> required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!VALID_TOKEN_TYPES.includes(payload.type)) {
      return res.status(401).json({ error: 'Invalid token type', expected: VALID_TOKEN_TYPES });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token', detail: e.message });
  }
};

/** Require one of the specified roles */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: `Role required: ${roles.join(' or ')}` });
  }
  next();
};

module.exports = { requireMTLS, requireUserToken, requireRole, JWT_SECRET };