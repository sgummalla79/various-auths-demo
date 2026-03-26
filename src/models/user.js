const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  key:        { type: String, required: true, unique: true },
  id:         { type: String, required: true, unique: true },
  username:   { type: String, required: true, unique: true },
  role:       { type: String, enum: ['admin', 'viewer'], required: true },
  allowedCNs: { type: [String], default: ['MyClient'] },
});

module.exports = mongoose.model('User', userSchema);