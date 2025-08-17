// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Déterminer si on est en production
const isProduction = process.env.NODE_ENV === 'production';

// Si DATABASE_URL est défini (ex. Heroku), on l’utilise
if (isProduction && !process.env.DATABASE_URL) {
  console.warn(
    '⚠️  NODE_ENV=production mais VARIABLE DATABASE_URL absente, je retombe sur les DB_* classiques'
  );
}

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction
        ? { rejectUnauthorized: false }
        : false
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME     || 'examsecure',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl:      false
    };

const pool = new Pool(poolConfig);

// Notifications de connexion
pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
pool.on('error', err => console.error('❌ Database error:', err));

module.exports = pool;
