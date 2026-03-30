const clients = new Set();

function addClient(res) {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on fly.io
  res.flushHeaders();

  // Send a heartbeat every 25s to keep the connection alive through proxies
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);

  clients.add(res);
  console.log(`SSE client connected. Total: ${clients.size}`);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`SSE client disconnected. Total: ${clients.size}`);
  });
}

// Fan out to all connected Lightning clients
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try { client.write(payload); }
    catch (e) { clients.delete(client); }
  });
}

module.exports = { addClient, broadcast };