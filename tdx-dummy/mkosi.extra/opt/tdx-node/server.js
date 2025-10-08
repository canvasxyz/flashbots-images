const http = require('http');
const fs = require('fs');
const path = require('path');

const MESSAGE_FILE = '/run/metadata/message';

function readMessage() {
  try {
    const content = fs.readFileSync(MESSAGE_FILE, 'utf8');
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const message = readMessage();
    const body = JSON.stringify({ message });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
    return;
  }
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not Found');
});

const PORT = 80;
server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});
