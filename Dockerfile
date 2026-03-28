FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY server.js     ./server.js
COPY src/          ./src/

# Validate all files exist at build time — fail fast if missing
RUN node --check server.js && \
    node --check src/config/db.js && \
    node --check src/config/clients.js && \
    node --check src/models/user.js && \
    node --check src/models/patient.js && \
    node --check src/models/client.js && \
    node --check src/routes/auth.js && \
    node --check src/routes/users.js && \
    node --check src/routes/clients.js && \
    node --check src/routes/resource.js && \
    node --check src/routes/patients.js && \
    node --check src/middleware/index.js && \
    node --check src/middleware/requestLogger.js && \
    node --check src/middleware/requireMTLS.js && \
    node --check src/middleware/requireUserToken.js && \
    node --check src/middleware/requireRole.js && \
    echo "✅ All files validated"

EXPOSE 8443

CMD ["node", "server.js"]