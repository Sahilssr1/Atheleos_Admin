// Atheleos Admin — Server entry point for Hostinger Web App / Node.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiEntry = path.join(__dirname, 'apps/api/dist/src/index.js');

console.log('[Server] Starting Atheleos Admin...');
console.log('[Server] Node version:', process.version);
console.log('[Server] Process PORT:', process.env.PORT || 'not set (defaulting to 4000)');
console.log('[Server] Working dir:', process.cwd());

if (!fs.existsSync(apiEntry)) {
  console.log('[Server] Build output not found at', apiEntry);
  console.log('[Server] Running "npm run build" automatically...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('[Server] Build completed successfully.');
  } catch (err) {
    console.error('[Server] Automatic build failed:', err);
    process.exit(1);
  }
}

// In Node.js, dynamic import loads ES modules cleanly from CommonJS
import('./apps/api/dist/src/index.js').catch((err) => {
  console.error('[Server] Failed to load Atheleos Admin API:', err);
  process.exit(1);
});
