#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { detectAndFetchMetadata } = require('./metadata');

const SERVER_PORT = 80;
const REQUEST_TIMEOUT_MS = 2_000;
const METADATA_REFRESH_MS = 30_000;

let cachedMetadata = { message: null, rootPw: null };
let lastRefreshAt = 0;

function nowMs() {
  return Date.now();
}

function ensureSshdConfiguredForPasswordAuth() {
  const sshdConfigPath = '/etc/ssh/sshd_config';
  try {
    let config = '';
    try {
      config = fs.readFileSync(sshdConfigPath, 'utf8');
    } catch (readErr) {
      // If file doesn't exist, create a minimal one.
      config = '';
    }

    const lines = config.split(/\r?\n/);

    function upsertDirective(name, value) {
      const idx = lines.findIndex((line) => line.trim().toLowerCase().startsWith(name.toLowerCase() + ' '));
      const directive = `${name} ${value}`;
      if (idx >= 0) {
        lines[idx] = directive;
      } else {
        lines.push(directive);
      }
    }

    upsertDirective('PermitRootLogin', 'yes');
    upsertDirective('PasswordAuthentication', 'yes');

    fs.writeFileSync(sshdConfigPath, lines.filter(Boolean).join('\n') + '\n', { mode: 0o600 });

    try {
      execFileSync('systemctl', ['enable', 'ssh.service'], { stdio: 'ignore' });
      execFileSync('systemctl', ['unmask', 'ssh.service', 'ssh.socket'], { stdio: 'ignore' });
    } catch (_) {
      // Best effort
    }

    try {
      execFileSync('systemctl', ['restart', 'ssh.service'], { stdio: 'ignore' });
    } catch (_) {
      // Best effort
    }
  } catch (err) {
    // Best effort; do not crash the HTTP server
  }
}

let appliedRootPwHash = null;
function applyRootPasswordIfPresent(rootPw) {
  if (!rootPw) return;
  try {
    const newHash = Buffer.from(rootPw, 'utf8').toString('base64');
    if (appliedRootPwHash === newHash) return; // avoid repeated chpasswd

    // Set root password using chpasswd
    execFileSync('chpasswd', { input: `root:${rootPw}` });

    ensureSshdConfiguredForPasswordAuth();
    appliedRootPwHash = newHash;
  } catch (err) {
    // Best effort; avoid throwing
  }
}

async function refreshMetadataIfStale() {
  if (nowMs() - lastRefreshAt < METADATA_REFRESH_MS) return;
  lastRefreshAt = nowMs();
  try {
    const result = await detectAndFetchMetadata(REQUEST_TIMEOUT_MS);
    cachedMetadata = { message: result.message ?? null, rootPw: result.rootPw ?? null };
    applyRootPasswordIfPresent(cachedMetadata.rootPw);
  } catch (_) {
    // Keep previous cache
  }
}

const server = http.createServer(async (req, res) => {
  // Only GET / supported
  if (req.method !== 'GET' || req.url !== '/') {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  await refreshMetadataIfStale();

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ message: cachedMetadata.message ?? null }));
});

server.listen(SERVER_PORT, '0.0.0.0', () => {
  // Warm metadata on startup
  refreshMetadataIfStale().catch(() => {});
});
