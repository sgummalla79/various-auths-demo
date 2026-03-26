const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Missing env var: MONGODB_URI');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB Atlas connected:', mongoose.connection.host);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };