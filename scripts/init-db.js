// scripts/init-db.js
// Chạy một lần để tạo tables trong Supabase
// npm run init-db

import 'dotenv/config';
import { initSchema } from '../api/_lib/db.js';

console.log('Initializing Supabase database schema...');
initSchema()
  .then(() => {
    console.log('✅ Database schema initialized successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Failed to initialize schema:', err.message);
    process.exit(1);
  });
