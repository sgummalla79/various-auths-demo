const crypto  = require('crypto');
const express = require('express');
const User    = require('../models/user');
const { requireUserToken, requireRole } = require('../middleware');

const router     = express.Router();
const VALID_ROLES = ['admin', 'viewer'];

function formatUser(u) {
  return { key: u.key, id: u.id, username: u.username, role: u.role };
}

router.get('/', requireUserToken, async (req, res) => {
  if (req.user.role === 'admin') {
    const users = await User.find();
    return res.json({ users: users.map(formatUser) });
  }
  const u = await User.findOne({ username: req.user.username });
  if (!u) return res.status(404).json({ error: 'User record not found' });
  res.json({ users: [formatUser(u)] });
});

router.get('/:username', requireUserToken, async (req, res) => {
  const u = await User.findOne({ username: req.params.username });
  if (!u) return res.status(404).json({ error: `User '${req.params.username}' not found` });
  if (req.user.role !== 'admin' && req.user.username !== req.params.username) {
    return res.status(403).json({ error: 'Access denied — you can only view your own profile' });
  }
  res.json({ user: formatUser(u) });
});

router.post('/', requireUserToken, requireRole('admin'), async (req, res) => {
  const { key, username, role, allowedCNs } = req.body;
  if (!key || !username || !role) return res.status(400).json({ error: 'key, username, and role are required' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  if (await User.findOne({ key }))      return res.status(409).json({ error: `User key '${key}' already exists` });
  if (await User.findOne({ username })) return res.status(409).json({ error: `Username '${username}' already exists` });

  const id   = `user-${crypto.randomUUID()}`;
  const user = await User.create({ key, id, username, role, allowedCNs: Array.isArray(allowedCNs) ? allowedCNs : ['MyClient'] });
  console.log(`✅ User created: ${username} (${role}) by ${req.user.username}`);
  res.status(201).json({ message: 'User created', user: formatUser(user) });
});

router.put('/:username', requireUserToken, requireRole('admin'), async (req, res) => {
  const u = await User.findOne({ username: req.params.username });
  if (!u) return res.status(404).json({ error: `User '${req.params.username}' not found` });
  const { role, allowedCNs } = req.body;
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    u.role = role;
  }
  if (allowedCNs) u.allowedCNs = allowedCNs;
  await u.save();
  console.log(`✅ User updated: ${req.params.username} by ${req.user.username}`);
  res.json({ message: 'User updated', user: formatUser(u) });
});

router.delete('/:username', requireUserToken, requireRole('admin'), async (req, res) => {
  if (req.user.username === req.params.username) return res.status(400).json({ error: 'Cannot delete your own account' });
  const u = await User.findOneAndDelete({ username: req.params.username });
  if (!u) return res.status(404).json({ error: `User '${req.params.username}' not found` });
  console.log(`✅ User deleted: ${req.params.username} by ${req.user.username}`);
  res.json({ message: 'User deleted', username: req.params.username });
});

module.exports = router;