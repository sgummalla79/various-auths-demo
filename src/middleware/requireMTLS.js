// -----------------------------------------------
// mTLS Middleware
//
// Enforces client certificate on port 8443.
// Logs: CN + fingerprint prefix (cert identity, not PII)
// -----------------------------------------------
const requireMTLS = (req, res, next) => {
  if (!req.socket || typeof req.socket.getPeerCertificate !== 'function') {
    console.warn(`[${req.requestId}] mTLS ❌ — not connected via port 8443`);
    return res.status(401).json({ error: 'mTLS required — connect via port 8443 with a client certificate' });
  }

  const cert = req.socket.getPeerCertificate();

  if (!cert || Object.keys(cert).length === 0) {
    console.warn(`[${req.requestId}] mTLS ❌ — no client certificate provided`);
    return res.status(401).json({ error: 'No client certificate provided' });
  }

  if (!req.client.authorized) {
    console.warn(`[${req.requestId}] mTLS ❌ — cert not authorized: ${req.client.authorizationError}`);
    return res.status(401).json({ error: 'Client certificate not authorized', reason: req.client.authorizationError });
  }

  req.clientCert = cert;
  console.log(`[${req.requestId}] mTLS ✅ CN=${cert.subject?.CN} fingerprint=${cert.fingerprint?.slice(0, 16)}...`);
  next();
};

module.exports = requireMTLS;