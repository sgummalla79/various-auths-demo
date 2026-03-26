const crypto = require('crypto');
const express = require('express');
const { USERS } = require('../data/users');
const { requireUserToken, requireRole } = require('../middleware');

const router = express.Router();

const VALID_ROLES = ['admin', 'viewer'];

// -----------------------------------------------
// Helper — find a user by their username field value
// -----------------------------------------------
function findUserByUsername(username) {
  return Object.entries(USERS).find(([, u]) => u.username === username);
}

// -----------------------------------------------
// Helper — format a user entry for API responses
// -----------------------------------------------
function formatUser(key, u) {
  return { key, id: u.id, username: u.username, role: u.role, allowedCNs: u.allowedCNs };
}

// -----------------------------------------------
// GET /users
//
// admin  → returns all users
// viewer → returns only their own user record
// -----------------------------------------------
router.get('/', requireUserToken, (req, res) => {
  if (req.user.role === 'admin') {
    const list = Object.entries(USERS).map(([key, u]) => formatUser(key, u));
    return res.json({ users: list });
  }

  // viewer — return only their own record
  const entry = findUserByUsername(req.user.username);
  if (!entry) {
    return res.status(404).json({ error: 'User record not found' });
  }
  const [key, u] = entry;
  res.json({ users: [formatUser(key, u)] });
});

// -----------------------------------------------
// GET /users/:username — admin or self only
// -----------------------------------------------
router.get('/:username', requireUserToken, (req, res) => {
  const entry = findUserByUsername(req.params.username);
  if (!entry) {
    return res.status(404).json({ error: `User '${req.params.username}' not found` });
  }
  const [key, u] = entry;

  // viewer can only view their own record
  if (req.user.role !== 'admin' && req.user.username !== req.params.username) {
    return res.status(403).json({ error: 'Access denied — you can only view your own profile' });
  }

  res.json({ user: formatUser(key, u) });
});

// -----------------------------------------------
// POST /users — admin only
// -----------------------------------------------
router.post('/', requireUserToken, requireRole('admin'), (req, res) => {
  const { key, username, role, allowedCNs } = req.body;

  if (!key || !username || !role) {
    return res.status(400).json({ error: 'key, username, and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (USERS[key]) {
    return res.status(409).json({ error: `User key '${key}' already exists` });
  }
  if (Object.values(USERS).some(u => u.username === username)) {
    return res.status(409).json({ error: `Username '${username}' already exists` });
  }

  const id = `user-${crypto.randomUUID()}`;
  USERS[key] = {
    id,
    username,
    role,
    allowedCNs: Array.isArray(allowedCNs) ? allowedCNs : ['MyClient'],
  };

  console.log(`✅ User created: ${username} (${role}) by ${req.user.username}`);
  res.status(201).json({ message: 'User created', user: formatUser(key, USERS[key]) });
});

// -----------------------------------------------
// PUT /users/:username — admin only
// -----------------------------------------------
router.put('/:username', requireUserToken, requireRole('admin'), (req, res) => {
  const entry = findUserByUsername(req.params.username);
  if (!entry) {
    return res.status(404).json({ error: `User '${req.params.username}' not found` });
  }
  const [key, u] = entry;
  const { role, allowedCNs } = req.body;

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    u.role = role;
  }
  if (allowedCNs) u.allowedCNs = allowedCNs;

  console.log(`✅ User updated: ${req.params.username} by ${req.user.username}`);
  res.json({ message: 'User updated', user: formatUser(key, u) });
});

// -----------------------------------------------
// DELETE /users/:username — admin only
// -----------------------------------------------
router.delete('/:username', requireUserToken, requireRole('admin'), (req, res) => {
  const entry = findUserByUsername(req.params.username);
  if (!entry) {
    return res.status(404).json({ error: `User '${req.params.username}' not found` });
  }
  const [key] = entry;

  if (req.user.username === req.params.username) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  delete USERS[key];
  console.log(`✅ User deleted: ${req.params.username} by ${req.user.username}`);
  res.json({ message: 'User deleted', username: req.params.username });
});

module.exports = router;
