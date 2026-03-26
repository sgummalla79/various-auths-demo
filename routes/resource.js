const express = require('express');

const { requireMTLS, requireUserToken } = require('../middleware');

const router = express.Router();

// -----------------------------------------------
// GET /resource
//
// Double-protected: requires both mTLS client certificate (port 8443)
// and a valid Bearer access_token in the Authorization header.
// -----------------------------------------------
router.get('/', requireMTLS, requireUserToken, (req, res) => {
  const cert = req.socket.getPeerCertificate();
  res.json({
    message:   'mTLS + JWT verified!',
    clientCN:  cert?.subject?.CN ?? 'unknown',
    user:      { id: req.user.userId, username: req.user.username, role: req.user.role },
    timestamp: new Date(),
  });
});

module.exports = router;