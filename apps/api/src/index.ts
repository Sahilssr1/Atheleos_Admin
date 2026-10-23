import 'dotenv/config';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';

const cfg = loadEnv();
const app = createApp(undefined, cfg);
if (typeof cfg.PORT === 'number') {
  app.listen(cfg.PORT, '0.0.0.0', () => {
    console.log(`Atheleos Admin API listening on port ${cfg.PORT} (data mode: ${cfg.DATA_MODE})`);
  });
} else {
  app.listen(cfg.PORT, () => {
    console.log(`Atheleos Admin API listening on socket ${cfg.PORT} (data mode: ${cfg.DATA_MODE})`);
  });
}
