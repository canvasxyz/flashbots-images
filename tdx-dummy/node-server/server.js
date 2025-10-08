import http from 'node:http';

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'tdx-dummy-node', path: req.url }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`tdx-dummy-node listening on port ${port}`);
});
