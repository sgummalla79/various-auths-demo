# mTLS + JWT Auth API

## New Environment Variable

| Variable | Description |
|---|---|
| `JWT_SECRET` | Long random string used to sign `auth_token` and `user_access_token` |

Generate one: `openssl rand -hex 64`

---

## Authentication Flow

```
Client                                  Server
  │                                        │
  │──── mTLS handshake (port 8443) ───────►│
  │◄─── TLS established ───────────────────│
  │                                        │
  │  Step 1: POST /auth/token              │
  │  Body: { assertion: "<signed-jwt>" }   │
  │────────────────────────────────────────►│
  │         (signed with client private key,│
  │          verified against mTLS cert)    │
  │◄── { auth_token, expires_in: 900 } ────│
  │                                        │
  │  Step 2: POST /auth/user-token         │
  │  Body: { auth_token, username, pass }  │
  │────────────────────────────────────────►│
  │◄── { user_access_token, expires_in: 3600, user } ──│
  │                                        │
  │  Step 3: GET /resource                 │
  │  mTLS + Authorization: Bearer <utoken> │
  │────────────────────────────────────────►│
  │◄── { message, user, secret } ──────────│
```

---

## Step 1 — POST /auth/token (requires mTLS on port 8443)

Build a JWT assertion signed with your **client private key**:

```js
const jwt = require('jsonwebtoken');
const fs  = require('fs');

const assertion = jwt.sign(
  {
    iss: 'my-client-app',
    sub: 'my-client-app',
    aud: 'https://api.sgummalla.net',
    jti: crypto.randomUUID(),   // unique per request — replay prevention
  },
  fs.readFileSync('certs/client.key'),  // RS256/EC private key
  { algorithm: 'RS256', expiresIn: '5m' }
);
```

Then call:

```bash
curl --cert certs/client.crt \
     --key  certs/client.key \
     --cacert certs/ca.crt \
     -X POST https://api.sgummalla.net:8443/auth/token \
     -H 'Content-Type: application/json' \
     -d '{ "assertion": "<signed-jwt>" }'
```

Response:
```json
{
  "auth_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

## Step 2 — POST /auth/user-token (no mTLS required)

```bash
curl -X POST https://api.sgummalla.net:8443/auth/user-token \
     -H 'Content-Type: application/json' \
     -d '{
       "auth_token": "<from step 1>",
       "username": "alice",
       "password": "alice123"
     }'
```

Response:
```json
{
  "user_access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": { "id": "user-001", "username": "alice", "role": "admin" }
}
```

---

## Step 3 — Access protected resource

```bash
curl --cert certs/client.crt \
     --key  certs/client.key \
     --cacert certs/ca.crt \
     -H 'Authorization: Bearer <user_access_token>' \
     https://api.sgummalla.net:8443/resource
```

---

## User Management Endpoints (admin role required)

All require `Authorization: Bearer <user_access_token>` with `role: admin`.

| Method | Path | Description |
|---|---|---|
| GET | `/users` | List all users |
| POST | `/users` | Create a user |
| PUT | `/users/:username` | Update password / role / allowedCNs |
| DELETE | `/users/:username` | Delete a user |

### Create a user
```bash
curl -X POST https://api.sgummalla.net:8443/users \
     -H 'Authorization: Bearer <admin_user_access_token>' \
     -H 'Content-Type: application/json' \
     -d '{
       "username": "carol",
       "password": "carol789",
       "role": "viewer",
       "allowedCNs": ["MyClient"]
     }'
```

---

## Default Users

| Username | Password | Role |
|---|---|---|
| alice | alice123 | admin |
| bob | bob456 | viewer |

> ⚠️ Change these before deploying to production.

---

## Security Notes

- **JWT assertions** are single-use (JTI replay prevention, in-memory — use Redis in production)
- **auth_token** expires in 15 minutes
- **user_access_token** expires in 1 hour  
- **allowedCNs** controls which mTLS client certificates can obtain tokens for a given user
- **JWT_SECRET** must be a long random value set via environment variable
- Passwords are SHA-256 hashed in-memory — use bcrypt + a real DB in production