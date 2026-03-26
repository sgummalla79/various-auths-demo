const crypto  = require('crypto');
const express = require('express');

const { PATIENTS }                      = require('../data/patients');
const { requireUserToken, requireRole } = require('../middleware');

const router = express.Router();

const REQUIRED_FIELDS = ['firstName', 'lastName', 'dob', 'gender'];

// -----------------------------------------------
// Helper — format a patient record for responses
// -----------------------------------------------
function formatPatient(p) {
  return {
    id:        p.id,
    firstName: p.firstName,
    lastName:  p.lastName,
    dob:       p.dob,
    gender:    p.gender,
    bloodType: p.bloodType,
    phone:     p.phone,
    email:     p.email,
    diagnosis: p.diagnosis,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// -----------------------------------------------
// GET /patients
//
// admin  → all records
// viewer → only records they created
// -----------------------------------------------
router.get('/', requireUserToken, (req, res) => {
  const all = Object.values(PATIENTS);

  const list = req.user.role === 'admin'
    ? all
    : all.filter(p => p.createdBy === req.user.username);

  res.json({ patients: list.map(formatPatient), total: list.length });
});

// -----------------------------------------------
// GET /patients/:id
//
// admin  → any record
// viewer → only their own record
// -----------------------------------------------
router.get('/:id', requireUserToken, (req, res) => {
  const patient = PATIENTS[req.params.id];

  if (!patient) {
    return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  }

  if (req.user.role !== 'admin' && patient.createdBy !== req.user.username) {
    return res.status(403).json({ error: 'Access denied — you can only view your own patients' });
  }

  res.json({ patient: formatPatient(patient) });
});

// -----------------------------------------------
// POST /patients — any authenticated user
//
// createdBy is always set from the token — cannot be spoofed.
// -----------------------------------------------
router.post('/', requireUserToken, (req, res) => {
  const { firstName, lastName, dob, gender, bloodType, phone, email, diagnosis } = req.body;

  const missing = REQUIRED_FIELDS.filter(f => !req.body[f]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const id  = `pat-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  PATIENTS[id] = {
    id,
    firstName,
    lastName,
    dob,
    gender,
    bloodType: bloodType || null,
    phone:     phone     || null,
    email:     email     || null,
    diagnosis: diagnosis || null,
    createdBy: req.user.username,   // always from token
    createdAt: now,
    updatedAt: now,
  };

  console.log(`✅ Patient created: ${id} by ${req.user.username}`);
  res.status(201).json({ patient: formatPatient(PATIENTS[id]) });
});

// -----------------------------------------------
// PUT /patients/:id
//
// admin  → can update any record
// viewer → can only update their own records
// -----------------------------------------------
router.put('/:id', requireUserToken, (req, res) => {
  const patient = PATIENTS[req.params.id];

  if (!patient) {
    return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  }

  if (req.user.role !== 'admin' && patient.createdBy !== req.user.username) {
    return res.status(403).json({ error: 'Access denied — you can only update your own patients' });
  }

  const updatable = ['firstName', 'lastName', 'dob', 'gender', 'bloodType', 'phone', 'email', 'diagnosis'];
  updatable.forEach(field => {
    if (req.body[field] !== undefined) {
      patient[field] = req.body[field];
    }
  });
  patient.updatedAt = new Date().toISOString();

  console.log(`✅ Patient updated: ${req.params.id} by ${req.user.username}`);
  res.json({ patient: formatPatient(patient) });
});

// -----------------------------------------------
// DELETE /patients/:id — admin only
// -----------------------------------------------
router.delete('/:id', requireUserToken, requireRole('admin'), (req, res) => {
  const patient = PATIENTS[req.params.id];

  if (!patient) {
    return res.status(404).json({ error: `Patient '${req.params.id}' not found` });
  }

  delete PATIENTS[req.params.id];
  console.log(`✅ Patient deleted: ${req.params.id} by ${req.user.username}`);
  res.json({ message: 'Patient deleted', id: req.params.id });
});

module.exports = router;