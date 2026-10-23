// Atheleos Admin — Server entry point for Hostinger Web App / Node.js
import('./apps/api/dist/src/index.js').catch((err) => {
  console.error('Failed to start Atheleos Admin API server:', err);
  process.exit(1);
});
