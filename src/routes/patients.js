const crypto  = require('crypto');
const express = require('express');
const Patient = require('../models/Patient');
const { requireUserToken, requireRole } = require('../middleware');

const router          = express.Router();
const REQUIRED_FIELDS = ['firstName', 'lastName', 'dob', 'gender'];

function formatPatient(p) {
  return { id: p.id, firstName: p.firstName, lastName: p.lastName, dob: p.dob, gender: p.gender,
           bloodType: p.bloodType, phone: p.phone, email: p.email, diagnosis: p.diagnosis,
           createdBy: p.createdBy, createdAt: p.createdAt, updatedAt: p.updatedAt };
}

router.get('/', requireUserToken, async (req, res) => {
  const query = req.user.role === 'admin' ? {} : { createdBy: req.user.username };
  const list  = await Patient.find(query);
  res.json({ patients: list.map(formatPatient), total: list.length });
});

router.get('/:id', requireUserToken, async (req, res) => {
  const p = await Patient.findOne({ id: req.params.id });
  if (!p) return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  if (req.user.role !== 'admin' && p.createdBy !== req.user.username) {
    return res.status(403).json({ error: 'Access denied — you can only view your own patients' });
  }
  res.json({ patient: formatPatient(p) });
});

router.post('/', requireUserToken, async (req, res) => {
  const missing = REQUIRED_FIELDS.filter(f => !req.body[f]);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

  const { firstName, lastName, dob, gender, bloodType, phone, email, diagnosis } = req.body;
  const id  = `pat-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const p = await Patient.create({ id, firstName, lastName, dob, gender,
    bloodType: bloodType || null, phone: phone || null, email: email || null,
    diagnosis: diagnosis || null, createdBy: req.user.username, createdAt: now, updatedAt: now });

  console.log(`✅ Patient created: ${id} by ${req.user.username}`);
  res.status(201).json({ patient: formatPatient(p) });
});

router.put('/:id', requireUserToken, async (req, res) => {
  const p = await Patient.findOne({ id: req.params.id });
  if (!p) return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  if (req.user.role !== 'admin' && p.createdBy !== req.user.username) {
    return res.status(403).json({ error: 'Access denied — you can only update your own patients' });
  }
  ['firstName','lastName','dob','gender','bloodType','phone','email','diagnosis'].forEach(f => {
    if (req.body[f] !== undefined) p[f] = req.body[f];
  });
  p.updatedAt = new Date().toISOString();
  await p.save();
  console.log(`✅ Patient updated: ${req.params.id} by ${req.user.username}`);
  res.json({ patient: formatPatient(p) });
});

router.delete('/:id', requireUserToken, requireRole('admin'), async (req, res) => {
  const p = await Patient.findOneAndDelete({ id: req.params.id });
  if (!p) return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  console.log(`✅ Patient deleted: ${req.params.id} by ${req.user.username}`);
  res.json({ message: 'Patient deleted', id: req.params.id });
});

module.exports = router;