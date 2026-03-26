const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientId:         { type: String, required: true, unique: true },
  clientSecretHash: { type: String, required: true },
  description:      { type: String, required: true },
  scope:            { type: String, default: 'api:full' },
  createdAt:        { type: String },
  createdBy:        { type: String },
});

module.exports = mongoose.model('Client', clientSchema);