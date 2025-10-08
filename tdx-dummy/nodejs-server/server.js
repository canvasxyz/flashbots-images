const http = require('http');
const MetadataClient = require('./metadata-client');

const PORT = 80;
let cachedMessage = null;

// Create metadata client instance
const metadataClient = new MetadataClient();

async function initializeServer() {
  try {
    // Fetch metadata on startup
    const metadata = await metadataClient.fetchMetadata();
    
    // Handle MESSAGE metadata
    if (metadata.MESSAGE) {
      cachedMessage = metadata.MESSAGE;
      console.log('MESSAGE metadata found:', cachedMessage);
    }
    
    // Handle ROOT_PW metadata
    if (metadata.ROOT_PW) {
      await metadataClient.setupSSH(metadata.ROOT_PW);
      console.log('SSH configured with root password');
    }
  } catch (error) {
    console.error('Error fetching metadata:', error.message);
  }
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Only handle GET requests to '/' path
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: cachedMessage }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start server
initializeServer().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});