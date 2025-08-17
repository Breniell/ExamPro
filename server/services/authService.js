// src/services/authService.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Utiliser une valeur par défaut (10) si la variable d'environnement n'est pas définie
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

async function registerUser({ email, password, firstName, lastName, role }) {
  // Vérifier existence
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (rows.length) throw { status: 400, message: 'User already exists' };

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Création
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
     VALUES ($1,$2,$3,$4,$5,true)
     RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role`,
    [email, passwordHash, firstName, lastName, role]
  );
  const user = result.rows[0];

  // Générer token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { user, token };
}

async function loginUser({ email, password }) {
  // Récupérer user
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, first_name AS "firstName", last_name AS "lastName", role, is_active
     FROM users WHERE email = $1`, [email]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw { status: 401, message: 'Invalid credentials or inactive account' };

  // Vérifier mot de passe
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw { status: 401, message: 'Invalid credentials' };

  // Mettre à jour last_login
  await pool.query(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);

  // Générer token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  delete user.password_hash;
  return { user, token };
}

async function getCurrentUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", role, is_active
     FROM users WHERE id = $1`, [userId]
  );
  const user = rows[0];
  if (!user) throw { status: 404, message: 'User not found' };
  return user;
}

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
};
