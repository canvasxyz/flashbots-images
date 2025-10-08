# TDX Metadata Server

A Node.js server that runs on port 80 and integrates with GCP and Azure metadata services.

## Features

- **HTTP Server**: Serves GET requests to '/' path, returning JSON `{ message }`
- **Cloud Metadata Client**: Queries GCP and Azure metadata services for configuration
- **Deterministic Builds**: Uses `npm ci` with `package-lock.json` for reproducible builds
- **Automatic SSH Configuration**: Sets up SSH access when ROOT_PW is provided via metadata

## Architecture

- `server.js` - Main HTTP server that serves requests on port 80
- `metadata-client.js` - Cloud metadata client that queries GCP and Azure
- `package.json` - Node.js package configuration
- `package-lock.json` - Locked dependencies for deterministic builds

## Metadata Fields

The server queries cloud metadata services for these optional fields:

### MESSAGE
If present in metadata, this value is returned in the JSON response:
```json
{ "message": "value from metadata" }
```

If not present, returns:
```json
{ "message": null }
```

### ROOT_PW
If present, the server will:
1. Set the root password to this value
2. Configure SSH to accept root login with password authentication
3. Restart the SSH service

## Cloud Provider Support

The metadata client queries providers in this order:
1. **GCP** - Queries individual metadata attributes at `http://169.254.169.254/computeMetadata/v1/instance/attributes/`
2. **Azure** - Queries tags list at `http://169.254.169.254/metadata/instance/compute/tagsList`

## Editing the Server

All files in this directory (`/workspace/tdx-dummy/nodejs-server/`) can be edited directly from the flashbots-images repository.

### Adding New NPM Packages

1. Edit `package.json` and add your dependency:
```json
{
  "dependencies": {
    "your-package": "^1.0.0"
  }
}
```

2. Update `package-lock.json` by running locally (or let the build system regenerate it):
```bash
cd /workspace/tdx-dummy/nodejs-server
npm install
```

3. The build system will use `npm ci` to install dependencies deterministically during image creation.

### Modifying Server Behavior

Edit `server.js` to change HTTP request handling, or `metadata-client.js` to modify metadata querying logic.

## Build Integration

This server is built into the TDX image using mkosi:
- `mkosi.postinst` copies files to `/opt/nodejs-server` in the image
- `npm ci --omit=dev --production` installs exact versions from `package-lock.json`
- Systemd service `nodejs-metadata-server.service` starts the server on boot

## Development

To test locally:
```bash
cd /workspace/tdx-dummy/nodejs-server
npm install
sudo node server.js
```

Note: Metadata services will only be available when running in actual GCP/Azure VMs.