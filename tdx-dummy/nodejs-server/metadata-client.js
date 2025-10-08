const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class MetadataClient {
  constructor() {
    // GCP metadata service configuration
    this.gcpMetadataUrl = 'http://169.254.169.254/computeMetadata/v1/instance/attributes/';
    this.gcpHeaders = { 'Metadata-Flavor': 'Google' };
    
    // Azure metadata service configuration
    this.azureMetadataUrl = 'http://169.254.169.254/metadata/instance/compute/tagsList';
    this.azureHeaders = { 'Metadata': 'true' };
    this.azureApiVersion = '2021-02-01';
  }

  /**
   * Make an HTTP GET request
   */
  httpGet(url, headers, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: headers,
        timeout: timeout
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Attempt to fetch metadata from GCP
   */
  async fetchGCPMetadata() {
    const metadata = {};
    const fields = ['ROOT_PW', 'MESSAGE'];
    
    for (const field of fields) {
      try {
        const url = `${this.gcpMetadataUrl}${field}`;
        const value = await this.httpGet(url, this.gcpHeaders);
        metadata[field] = value;
      } catch (error) {
        // Field not present or error fetching, continue
      }
    }
    
    return metadata;
  }

  /**
   * Attempt to fetch metadata from Azure
   */
  async fetchAzureMetadata() {
    const metadata = {};
    
    try {
      const url = `${this.azureMetadataUrl}?api-version=${this.azureApiVersion}&format=json`;
      const response = await this.httpGet(url, this.azureHeaders);
      const tags = JSON.parse(response);
      
      // Azure returns tags as an array of objects with name and value properties
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (tag.name === 'ROOT_PW' || tag.name === 'MESSAGE') {
            metadata[tag.name] = tag.value;
          }
        }
      }
    } catch (error) {
      // Azure metadata not available or error parsing
    }
    
    return metadata;
  }

  /**
   * Fetch metadata from either GCP or Azure
   */
  async fetchMetadata() {
    // Try GCP first
    try {
      const gcpMetadata = await this.fetchGCPMetadata();
      if (Object.keys(gcpMetadata).length > 0) {
        console.log('Successfully fetched metadata from GCP');
        return gcpMetadata;
      }
    } catch (error) {
      console.log('GCP metadata service not available, trying Azure');
    }
    
    // Try Azure if GCP failed or returned no data
    try {
      const azureMetadata = await this.fetchAzureMetadata();
      if (Object.keys(azureMetadata).length > 0) {
        console.log('Successfully fetched metadata from Azure');
        return azureMetadata;
      }
    } catch (error) {
      console.log('Azure metadata service not available');
    }
    
    console.log('No metadata services available or no metadata fields present');
    return {};
  }

  /**
   * Configure SSH to accept root password authentication
   */
  async setupSSH(rootPassword) {
    try {
      // Set the root password
      await execAsync(`echo "root:${rootPassword}" | chpasswd`);
      
      // Configure sshd to allow root login with password
      const sshdConfigPath = '/etc/ssh/sshd_config';
      
      // Read current config
      let config;
      try {
        config = await fs.readFile(sshdConfigPath, 'utf8');
      } catch (error) {
        console.error('Could not read sshd_config, creating new one');
        config = '';
      }
      
      // Modify configuration
      const lines = config.split('\n');
      const newLines = [];
      let foundPermitRootLogin = false;
      let foundPasswordAuth = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('PermitRootLogin')) {
          newLines.push('PermitRootLogin yes');
          foundPermitRootLogin = true;
        } else if (trimmed.startsWith('PasswordAuthentication')) {
          newLines.push('PasswordAuthentication yes');
          foundPasswordAuth = true;
        } else {
          newLines.push(line);
        }
      }
      
      // Add missing directives
      if (!foundPermitRootLogin) {
        newLines.push('PermitRootLogin yes');
      }
      if (!foundPasswordAuth) {
        newLines.push('PasswordAuthentication yes');
      }
      
      // Write updated config
      await fs.writeFile(sshdConfigPath, newLines.join('\n'), 'utf8');
      
      // Restart sshd service
      try {
        await execAsync('systemctl restart sshd || systemctl restart ssh');
      } catch (error) {
        console.error('Could not restart sshd:', error.message);
      }
      
      console.log('SSH configured successfully');
    } catch (error) {
      console.error('Error configuring SSH:', error.message);
      throw error;
    }
  }
}

module.exports = MetadataClient;