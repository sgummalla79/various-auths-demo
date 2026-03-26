const jwt = require('jsonwebtoken');
const fs  = require('fs');
const { randomUUID } = require('crypto');

const assertion = jwt.sign(
  {
    iss: 'salesforce-mtls-client',
    sub: 'salesforce-mtls-client',
    aud: 'https://mtls-api.fly.dev/',
    jti: randomUUID(),
    username: 'sgummalla@exp-cloud.org'
  },
  fs.readFileSync('certs/sf_client.key'),
  { algorithm: 'RS256', expiresIn: '5m' }
);
console.log(assertion);