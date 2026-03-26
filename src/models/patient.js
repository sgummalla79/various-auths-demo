const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  dob:       { type: String, required: true },
  gender:    { type: String, required: true },
  bloodType: { type: String, default: null },
  phone:     { type: String, default: null },
  email:     { type: String, default: null },
  diagnosis: { type: String, default: null },
  createdBy: { type: String, required: true },
  createdAt: { type: String },
  updatedAt: { type: String },
});

module.exports = mongoose.model('Patient', patientSchema);