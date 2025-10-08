#!/usr/bin/env node
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 80;
const HOST = process.env.HOST || '0.0.0.0';

// Simple TDX DCAP dummy server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'dummy-tdx-dcap',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Mock TDX attestation endpoint
  if (pathname === '/attestation/verify') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        verified: true,
        message: 'Attestation verified (dummy)',
        timestamp: new Date().toISOString()
      }));
    });
    return;
  }

  // Mock quote endpoint
  if (pathname === '/quote') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      quote: Buffer.from('dummy-tdx-quote').toString('base64'),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    path: pathname
  }));
});

server.listen(PORT, HOST, () => {
  console.log(`Dummy TDX DCAP server listening on ${HOST}:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET  /              - Health check`);
  console.log(`  GET  /health        - Health check`);
  console.log(`  POST /attestation/verify - Verify attestation`);
  console.log(`  GET  /quote         - Get quote`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});