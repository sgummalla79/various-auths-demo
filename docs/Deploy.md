# Deploying to Fly.io

## Prerequisites

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Log in
fly auth login
```

---

## 1 — Verify your fly.toml

Your existing `fly.toml` is already correct. Confirm it looks like this:

```toml
app = "mtls-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 8080       # plain HTTP — Fly terminates TLS on port 443
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls"]
  [[services.ports]]
    port = 80
    handlers = ["http"]

[[services]]
  internal_port = 8443       # raw TCP passthrough — true mTLS
  protocol = "tcp"
  [[services.ports]]
    port = 8443
    handlers = []            # no handler = raw TCP, client cert reaches your app

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

---

## 2 — Set secrets (environment variables)

Fly secrets are injected as env vars at runtime. Never put these in fly.toml.

```bash
# Server TLS private key (single-line, newlines escaped as \n)
fly secrets set SERVER_KEY="$(cat certs/server.key | awk 'NF {printf "%s\\n", $0}')"

# Server TLS certificate (fullchain if using Let's Encrypt)
fly secrets set SERVER_CERT="$(cat certs/server.crt | awk 'NF {printf "%s\\n", $0}')"

# CA cert used to verify client certificates
fly secrets set CLIENT_CA_CERT="$(cat certs/ca.crt | awk 'NF {printf "%s\\n", $0}')"

# JWT signing secret — generate a strong one
fly secrets set JWT_SECRET="$(openssl rand -hex 64)"
```

Verify secrets are set (values are hidden):
```bash
fly secrets list
```

---

## 3 — Deploy

```bash
# First deploy — creates the app if it doesn't exist
fly deploy

# Subsequent deploys
fly deploy
```

Watch logs during deploy:
```bash
fly logs
```

---

## 4 — Verify the deployment

```bash
# Check app status
fly status

# Check running instances
fly scale show
```

Test the public endpoint (no mTLS):
```bash
curl https://mtls-api.fly.dev/
# Expected: {"message":"Public endpoint","status":"ok"}
```

Test the mTLS endpoint:
```bash
curl --cert certs/client.crt \
     --key  certs/client.key \
     --cacert certs/ca.crt \
     https://mtls-api.fly.dev:8443/
# Expected: {"message":"Public endpoint","status":"ok"}
```

---

## 5 — Troubleshooting

```bash
# Tail live logs
fly logs -a mtls-api

# SSH into the running VM
fly ssh console

# Check if port 8443 is reachable
openssl s_client \
  -connect mtls-api.fly.dev:8443 \
  -cert certs/client.crt \
  -key  certs/client.key \
  -CAfile certs/ca.crt

# Re-deploy without cache
fly deploy --no-cache
```

### Common issues

| Problem | Fix |
|---|---|
| `Missing: SERVER_KEY` in logs | Re-run `fly secrets set SERVER_KEY=...` and redeploy |
| Port 8443 connection refused | Check `fly.toml` has `handlers = []` (not `["tls"]`) for the 8443 service |
| `certificate verify failed` | Ensure `CLIENT_CA_CERT` matches the CA that signed your client cert |
| App crashes on start | Run `fly logs` — usually a missing secret or cert parse error |