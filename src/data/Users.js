// In-memory user store — replace with a database in production

const USERS = {
  sgummalla: {
    id:         '001',
    username:   'sgummalla@exp-cloud.org',
    role:       'admin',
    allowedCNs: ['MyClient'],
  },
  abhiram: {
    id:         '002',
    username:   'abhiram@exp-cloud.org',
    role:       'viewer',
    allowedCNs: ['MyClient'],
  },
  akhila: {
    id:         '003',
    username:   'akhila@exp-cloud.org',
    role:       'viewer',
    allowedCNs: ['MyClient'],
  },
  rajanipriya: {
    id:         '004',
    username:   'rajanipriya@exp-cloud.org',
    role:       'admin',
    allowedCNs: ['MyClient'],
  },
};

module.exports = { USERS };