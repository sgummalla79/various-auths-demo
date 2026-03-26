const crypto  = require('crypto');
const express = require('express');
const Client  = require('../models/client');
const { requireUserToken, requireRole } = require('../middleware');

const router = express.Router();

function hashSecret(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function formatClient(c) {
  return { clientId: c.clientId, description: c.description, scope: c.scope, createdAt: c.createdAt, createdBy: c.createdBy };
}

router.post('/register', requireUserToken, requireRole('admin'), async (req, res) => {
  const { description, scope = 'api:full' } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });

  const clientId     = `client_${crypto.randomUUID()}`;
  const clientSecret = crypto.randomBytes(32).toString('hex');

  await Client.create({ clientId, clientSecretHash: hashSecret(clientSecret), description, scope,
    createdAt: new Date().toISOString(), createdBy: req.user.username || req.user.clientId });

  console.log(`✅ Client registered: ${clientId} (${description})`);
  res.status(201).json({ client_id: clientId, client_secret: clientSecret, description, scope,
    token_endpoint: '/auth/token', grant_type: 'client_credentials',
    warning: 'Store the client_secret securely — it will not be shown again.' });
});

router.get('/', requireUserToken, requireRole('admin'), async (req, res) => {
  const list = await Client.find();
  res.json({ clients: list.map(formatClient), total: list.length });
});

router.delete('/:clientId', requireUserToken, requireRole('admin'), async (req, res) => {
  const c = await Client.findOneAndDelete({ clientId: req.params.clientId });
  if (!c) return res.status(404).json({ error: `Client '${req.params.clientId}' not found` });
  console.log(`✅ Client revoked: ${req.params.clientId}`);
  res.json({ message: 'Client revoked', clientId: req.params.clientId });
});

module.exports = router;