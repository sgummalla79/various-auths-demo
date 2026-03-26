const crypto = require('crypto');

// -----------------------------------------------
// Request Logger
//
// Logs: requestId, method, sanitized path, status, duration
// Safe: no query params, no body, no PII
// -----------------------------------------------
const requestLogger = (req, res, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  // Attach requestId so downstream middleware/routes can reference it
  req.requestId = requestId;

  // Sanitize path — strip PII from dynamic segments
  const safePath = req.path
    .replace(/\/[^/]+@[^/]+/g, '/:username')   // email-like segments
    .replace(/\/pat-[^/]+/g,    '/pat-:id')     // patient IDs
    .replace(/\/client_[^/]+/g, '/client_:id'); // client IDs

  console.log(`→ [${requestId}] ${req.method} ${safePath}`);

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const level    = res.statusCode >= 500 ? '❌' :
                     res.statusCode >= 400 ? '⚠️' : '✅';
    console.log(`← [${requestId}] ${level} ${res.statusCode} ${req.method} ${safePath} (${duration}ms)`);
  });

  next();
};

module.exports = requestLogger;