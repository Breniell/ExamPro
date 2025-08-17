// server/services/authService.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Bcrypt: par défaut 10 si non défini
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

/* -------- Helpers JWT -------- */
function normalizeExpiresIn(input) {
  // défaut: 24h
  if (!input) return '24h';
  const raw = String(input).trim();
  // nombre pur => secondes (ex: "86400")
  if (/^\d+$/.test(raw)) return Number(raw);
  // tolère "24 h" => "24h"
  const compact = raw.replace(/\s+/g, '');
  // formats supportés par jsonwebtoken: 60s, 10m, 24h, 7d, 1y...
  if (/^\d+[smhdwy]$/.test(compact)) return compact;
  // fallback safe
  return '24h';
}

function getJwtSecret() {
  const s = (process.env.JWT_SECRET || '').trim();
  if (!s) {
    const e = new Error('JWT_SECRET is not set');
    e.status = 500;
    throw e;
  }
  return s;
}

function signToken(payload) {
  const secret = getJwtSecret();
  const expiresIn = normalizeExpiresIn(process.env.JWT_EXPIRES_IN);
  return jwt.sign(payload, secret, { expiresIn });
}

/* -------- Services -------- */

async function registerUser({ email, password, firstName, lastName, role }) {
  // Vérifier unicité email
  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (existing.length) {
    const e = new Error('User already exists');
    e.status = 400;
    throw e;
  }

  // Rôle autorisé (par défaut student)
  const allowedRoles = new Set(['student', 'teacher', 'admin']);
  const safeRole = allowedRoles.has(role) ? role : 'student';

  // Hash du mot de passe
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Création
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified, is_active)
     VALUES ($1,$2,$3,$4,$5,true,true)
     RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role`,
    [email, passwordHash, firstName || '', lastName || '', safeRole]
  );
  const user = rows[0];

  // Token
  const token = signToken({ userId: user.id, role: user.role });

  return { user, token };
}

async function loginUser({ email, password }) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, first_name, last_name, role, is_active
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  const row = rows[0];

  // Compte inexistant ou explicitement désactivé
  if (!row || row.is_active === false) {
    const e = new Error('Invalid credentials or inactive account');
    e.status = 401;
    throw e;
  }

  const ok = await bcrypt.compare(password, row.password_hash || '');
  if (!ok) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }

  // Mettre à jour last_login (optionnel)
  pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [row.id]).catch(() => {});

  const token = signToken({ userId: row.id, role: row.role });

  const user = {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
  };

  return { user, token };
}

async function getCurrentUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, first_name, last_name, role, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.is_active === false) {
    const e = new Error('User not found or inactive');
    e.status = 404;
    throw e;
  }
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
  };
}

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
};
