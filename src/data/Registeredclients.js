// Dynamic client registry — populated via POST /clients/register
// In-memory for now; replace with a database in production.

const registeredClients = {};

module.exports = { registeredClients };