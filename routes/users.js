const crypto = require('crypto');
const express = require('express');
const { USERS } = require('../data/users');
const { requireUserToken, requireRole } = require('../middleware');

const router = express.Router();

const VALID_ROLES = ['admin', 'viewer'];

/** GET /users — list all users */
router.get('/', requireUserToken, requireRole('admin'), (req, res) => {
  const list = Object.entries(USERS).map(([usercode, u]) => ({
    usercode,
    id:         u.id,
    role:       u.role,
    username:   u.username,
    allowedCNs: u.allowedCNs,
  }));
  res.json({ users: list });
});

/** POST /users — create a user */
router.post('/', requireUserToken, requireRole('admin'), (req, res) => {
  const { username, role, allowedCNs } = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: 'username and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (USERS[username]) {
    return res.status(409).json({ error: `User '${username}' already exists` });
  }

  const id = `user-${crypto.randomUUID()}`;
  USERS[username] = {
    id,
    role,
    allowedCNs: Array.isArray(allowedCNs) ? allowedCNs : ['MyClient'],
  };

  console.log(`✅ User created: ${username} (${role}) by ${req.user.username}`);
  res.status(201).json({ message: 'User created', user: { id, username, role } });
});

/** PUT /users/:username — update role or allowedCNs */
router.put('/:username', requireUserToken, requireRole('admin'), (req, res) => {
  const { username } = req.params;
  const { role, allowedCNs } = req.body;

  if (!USERS[username]) {
    return res.status(404).json({ error: `User '${username}' not found` });
  }

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    USERS[username].role = role;
  }

  if (allowedCNs) USERS[username].allowedCNs = allowedCNs;

  console.log(`✅ User updated: ${username} by ${req.user.username}`);
  res.json({ message: 'User updated', username });
});

/** DELETE /users/:username */
router.delete('/:username', requireUserToken, requireRole('admin'), (req, res) => {
  const { username } = req.params;

  if (!USERS[username]) {
    return res.status(404).json({ error: `User '${username}' not found` });
  }
  if (username === req.user.username) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  delete USERS[username];
  console.log(`✅ User deleted: ${username} by ${req.user.username}`);
  res.json({ message: 'User deleted', username });
});

module.exports = router;