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
};

module.exports = { USERS };