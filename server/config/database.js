// server/config/database.js
const { Pool } = require('pg');

// Sommes-nous en prod ?
const isProd = process.env.NODE_ENV === 'production';

// DATABASE_URL proprement détectée
const rawConnStr = (process.env.DATABASE_URL || '').trim();
const hasConnStr =
  rawConnStr.startsWith('postgres://') || rawConnStr.startsWith('postgresql://');

// SSL: si DB_SSL=true OU (on est en prod et DB_SSL n'est pas renseigné) => activer SSL
const useSsl =
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  (isProd && !process.env.DB_SSL);

let pool;

if (hasConnStr) {
  // Chemin recommandé en prod (Render Postgres -> External Database URL)
  pool = new Pool({
    connectionString: rawConnStr,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.PGPOOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else {
  // Fallback variables séparées
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = parseInt(process.env.DB_PORT || '5432', 10);

  if (isProd && (!host || !database || !user)) {
    // En prod, on exige une conf DB valide
    throw new Error(
      'Database not configured. Set DATABASE_URL (recommended) OR DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in Render.'
    );
  }

  pool = new Pool({
    host: host || 'localhost',
    port,
    database: database || 'examsecure',
    user: user || 'postgres',
    password: password || '',
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.PGPOOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// Logs utiles
pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
pool.on('error', (err) => console.error('❌ Database error:', err));

// (Optionnel mais pratique) test au démarrage
pool
  .query('SELECT 1')
  .then(() => console.log('✅ DB test OK'))
  .catch((e) => console.error('❌ DB test failed:', e));

module.exports = pool;
