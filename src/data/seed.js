// Run once: node -r dotenv/config src/data/seed.js
const mongoose = require('mongoose');
const User    = require('../models/User');
const Patient = require('../models/Patient');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Seeding...');

  await User.deleteMany({});
  await User.insertMany([
    { key: 'sgummalla',   id: '001', username: 'sgummalla@exp-cloud.org',   role: 'admin',  allowedCNs: ['MyClient'] },
    { key: 'abhiram',     id: '002', username: 'abhiram@exp-cloud.org',     role: 'viewer', allowedCNs: ['MyClient'] },
    { key: 'akhila',      id: '003', username: 'akhila@exp-cloud.org',      role: 'viewer', allowedCNs: ['MyClient'] },
    { key: 'rajanipriya', id: '004', username: 'rajanipriya@exp-cloud.org', role: 'admin',  allowedCNs: ['MyClient'] },
  ]);
  console.log('✅ Users seeded');

  await Patient.deleteMany({});
  await Patient.insertMany([
    { id:'pat-001', firstName:'John',    lastName:'Doe',      dob:'1985-03-12', gender:'male',   bloodType:'O+',  phone:'555-101-2001', email:'john.doe@example.com',    diagnosis:'Hypertension',      createdBy:'sgummalla@exp-cloud.org',   createdAt:'2025-01-10T09:00:00.000Z', updatedAt:'2025-01-10T09:00:00.000Z' },
    { id:'pat-002', firstName:'Jane',    lastName:'Smith',    dob:'1990-07-25', gender:'female', bloodType:'A-',  phone:'555-101-2002', email:'jane.smith@example.com',   diagnosis:'Type 2 Diabetes',   createdBy:'sgummalla@exp-cloud.org',   createdAt:'2025-01-15T10:30:00.000Z', updatedAt:'2025-01-15T10:30:00.000Z' },
    { id:'pat-003', firstName:'Robert',  lastName:'Johnson',  dob:'1978-11-02', gender:'male',   bloodType:'B+',  phone:'555-101-2003', email:'robert.j@example.com',     diagnosis:'Asthma',            createdBy:'abhiram@exp-cloud.org',     createdAt:'2025-02-01T08:15:00.000Z', updatedAt:'2025-02-01T08:15:00.000Z' },
    { id:'pat-004', firstName:'Emily',   lastName:'Davis',    dob:'2000-04-18', gender:'female', bloodType:'AB+', phone:'555-101-2004', email:'emily.davis@example.com',  diagnosis:'Migraine',          createdBy:'abhiram@exp-cloud.org',     createdAt:'2025-02-10T14:00:00.000Z', updatedAt:'2025-02-10T14:00:00.000Z' },
    { id:'pat-005', firstName:'Michael', lastName:'Brown',    dob:'1965-09-30', gender:'male',   bloodType:'O-',  phone:'555-101-2005', email:'michael.b@example.com',    diagnosis:'Arthritis',         createdBy:'akhila@exp-cloud.org',      createdAt:'2025-03-05T11:00:00.000Z', updatedAt:'2025-03-05T11:00:00.000Z' },
    { id:'pat-006', firstName:'Sarah',   lastName:'Wilson',   dob:'1993-12-08', gender:'female', bloodType:'A+',  phone:'555-101-2006', email:'sarah.w@example.com',      diagnosis:'Anxiety Disorder',  createdBy:'akhila@exp-cloud.org',      createdAt:'2025-03-12T09:45:00.000Z', updatedAt:'2025-03-12T09:45:00.000Z' },
    { id:'pat-007', firstName:'David',   lastName:'Martinez', dob:'1970-06-14', gender:'male',   bloodType:'B-',  phone:'555-101-2007', email:'david.m@example.com',      diagnosis:'Chronic Back Pain', createdBy:'rajanipriya@exp-cloud.org', createdAt:'2025-04-01T13:20:00.000Z', updatedAt:'2025-04-01T13:20:00.000Z' },
    { id:'pat-008', firstName:'Lisa',    lastName:'Anderson', dob:'1988-02-22', gender:'female', bloodType:'AB-', phone:'555-101-2008', email:'lisa.a@example.com',       diagnosis:'Hypothyroidism',    createdBy:'rajanipriya@exp-cloud.org', createdAt:'2025-04-08T16:00:00.000Z', updatedAt:'2025-04-08T16:00:00.000Z' },
  ]);
  console.log('✅ Patients seeded');

  await mongoose.disconnect();
  console.log('Done!');
}

seed().catch(err => { console.error(err); process.exit(1); });