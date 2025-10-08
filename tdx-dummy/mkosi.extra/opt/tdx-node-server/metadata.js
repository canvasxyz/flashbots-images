'use strict';

const http = require('http');

function httpGetJson(options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, timeout: timeoutMs }, (res) => {
      const { statusCode } = res;
      if (statusCode && statusCode >= 400) {
        res.resume(); // drain
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ ok: true, data: JSON.parse(body) });
        } catch (_) {
          resolve({ ok: true, data: body });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function fetchGcpMetadata(timeoutMs) {
  // GCP metadata requires header 'Metadata-Flavor: Google'
  const baseOptions = {
    hostname: '169.254.169.254',
    method: 'GET',
    headers: { 'Metadata-Flavor': 'Google' },
  };

  // Probe root
  try {
    const probe = await httpGetJson({ ...baseOptions, path: '/computeMetadata/v1/' }, timeoutMs);
    if (!probe.ok) throw new Error('no gcp');
  } catch (_) {
    throw new Error('not gcp');
  }

  const result = { message: null, rootPw: null };

  async function getText(path) {
    try {
      const resp = await httpGetJson({ ...baseOptions, path }, timeoutMs);
      if (!resp.ok) return null;
      if (typeof resp.data === 'string') return resp.data;
      return resp.data == null ? null : String(resp.data);
    } catch (_) {
      return null;
    }
  }

  // We use instance/attributes keys ROOT_PW and MESSAGE
  result.rootPw = await getText('/computeMetadata/v1/instance/attributes/ROOT_PW');
  result.message = await getText('/computeMetadata/v1/instance/attributes/MESSAGE');

  return result;
}

async function fetchAzureMetadata(timeoutMs) {
  // Azure metadata requires header Metadata: true
  const baseOptions = {
    hostname: '169.254.169.254',
    method: 'GET',
    headers: { Metadata: 'true' },
  };

  // Probe instance
  try {
    const probe = await httpGetJson({ ...baseOptions, path: '/metadata/instance?api-version=2021-02-01' }, timeoutMs);
    if (!probe.ok) throw new Error('no azure');
  } catch (_) {
    throw new Error('not azure');
  }

  const result = { message: null, rootPw: null };

  async function getAttr(name) {
    // Try tagsList (array of { name, value })
    try {
      const resp = await httpGetJson({ ...baseOptions, path: `/metadata/instance/compute/tagsList?api-version=2021-02-01` }, timeoutMs);
      if (resp && resp.ok && resp.data) {
        const maybeTags = Array.isArray(resp.data)
          ? resp.data
          : (resp.data.tags && Array.isArray(resp.data.tags) ? resp.data.tags : null);
        if (maybeTags) {
          const found = maybeTags.find((t) => t && t.name === name);
          if (found) return found.value ?? null;
        }
      }
    } catch (_) {}

    // Fallback to tags string: "k1=v1;k2=v2"
    try {
      const resp = await httpGetJson({ ...baseOptions, path: `/metadata/instance/compute/tags?api-version=2021-02-01` }, timeoutMs);
      if (resp && resp.ok && typeof resp.data === 'string') {
        const map = Object.create(null);
        resp.data.split(';').forEach((pair) => {
          const idx = pair.indexOf('=');
          if (idx > 0) {
            const k = pair.slice(0, idx);
            const v = pair.slice(idx + 1);
            map[k] = v;
          }
        });
        if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
      }
    } catch (_) {}

    return null;
  }

  result.rootPw = await getAttr('ROOT_PW');
  result.message = await getAttr('MESSAGE');

  return result;
}

async function detectAndFetchMetadata(timeoutMs) {
  try {
    return await fetchGcpMetadata(timeoutMs);
  } catch (_) {}
  try {
    return await fetchAzureMetadata(timeoutMs);
  } catch (_) {}
  return { message: null, rootPw: null };
}

module.exports = { detectAndFetchMetadata };
