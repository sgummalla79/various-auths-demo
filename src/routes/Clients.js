const crypto  = require('crypto');
const express = require('express');

const { registeredClients }          = require('../data/registeredClients');
const { requireUserToken, requireRole } = require('../middleware');

const router = express.Router();

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function formatClient(c) {
  return {
    clientId:    c.clientId,
    description: c.description,
    scope:       c.scope,
    createdAt:   c.createdAt,
    createdBy:   c.createdBy,
  };
}

// -----------------------------------------------
// POST /clients/register — admin only
//
// Registers a new client application and issues a client_id + client_secret.
// The client_secret is returned ONCE and never stored in plain text.
//
// Body: { description, scope? }
// Returns: { client_id, client_secret, scope, description }
// -----------------------------------------------
router.post('/register', requireUserToken, requireRole('admin'), (req, res) => {
  const { description, scope = 'api:full' } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const clientId     = `client_${crypto.randomUUID()}`;
  const clientSecret = crypto.randomBytes(32).toString('hex');

  registeredClients[clientId] = {
    clientId,
    clientSecretHash: hashSecret(clientSecret),
    description,
    scope,
    createdAt: new Date().toISOString(),
    createdBy: req.user.username || req.user.clientId,
  };

  console.log(`✅ Client registered: ${clientId} (${description}) by ${req.user.username || req.user.clientId}`);

  // Return the plain secret ONCE — it cannot be retrieved again
  res.status(201).json({
    client_id:     clientId,
    client_secret: clientSecret,
    description,
    scope,
    token_endpoint: '/auth/token',
    grant_type:     'client_credentials',
    warning: 'Store the client_secret securely — it will not be shown again.',
  });
});

// -----------------------------------------------
// GET /clients — admin only
// Lists all registered clients (secrets never returned)
// -----------------------------------------------
router.get('/', requireUserToken, requireRole('admin'), (req, res) => {
  const list = Object.values(registeredClients).map(formatClient);
  res.json({ clients: list, total: list.length });
});

// -----------------------------------------------
// DELETE /clients/:clientId — admin only
// Revokes a registered client immediately
// -----------------------------------------------
router.delete('/:clientId', requireUserToken, requireRole('admin'), (req, res) => {
  const { clientId } = req.params;

  if (!registeredClients[clientId]) {
    return res.status(404).json({ error: `Client '${clientId}' not found` });
  }

  const description = registeredClients[clientId].description;
  delete registeredClients[clientId];

  console.log(`✅ Client revoked: ${clientId} (${description}) by ${req.user.username || req.user.clientId}`);
  res.json({ message: 'Client revoked', clientId });
});

module.exports = router;