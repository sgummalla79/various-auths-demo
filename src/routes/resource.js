const express = require('express');

const { requireUserToken } = require('../middleware');

const router = express.Router();

// -----------------------------------------------
// GET /resource
//
// mTLS is enforced globally in server.js for all routes.
// This route additionally requires a valid Bearer access_token.
// -----------------------------------------------
router.get('/', requireUserToken, (req, res) => {
  const cert = req.socket.getPeerCertificate();
  res.json({
    message:   'mTLS + JWT verified!',
    clientCN:  cert?.subject?.CN ?? 'unknown',
    user:      { id: req.user.userId, username: req.user.username, role: req.user.role },
    timestamp: new Date(),
  });
});

module.exports = router;