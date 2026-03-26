FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source — explicit list ensures nothing is silently excluded
COPY server.js     ./server.js
COPY src/          ./src/

# Validate critical files exist at build time — fail fast if missing
RUN node --check server.js && \
    node --check src/routes/auth.js && \
    node --check src/routes/users.js && \
    node --check src/routes/clients.js && \
    node --check src/routes/resource.js && \
    node --check src/middleware/index.js && \
    node --check src/config/clients.js && \
    node --check src/data/users.js && \
    node --check src/data/registeredClients.js && \
    node --check src/config/db.js && \
    node --check src/models/User.js && \
    node --check src/models/Patient.js && \
    node --check src/models/Client.js && \
    echo "✅ All files validated"

EXPOSE 8080
EXPOSE 8443

CMD ["node", "server.js"]