// src/services/profileService.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function getProfile(userId) {
  const { rows } = await pool.query(`
    SELECT id, email, first_name AS "firstName", last_name AS "lastName",
           role, avatar_url AS "avatar", created_at AS "createdAt"
    FROM users WHERE id = $1`, [userId]);
  if (!rows.length) throw { status: 404, message: 'User not found' };
  return rows[0];
}

async function updateProfile(userId, data) {
  const fields = [], params = [];
  if (data.firstName) { params.push(data.firstName); fields.push(`first_name=$${params.length}`); }
  if (data.lastName)  { params.push(data.lastName);  fields.push(`last_name=$${params.length}`);  }
  if (data.avatar)    { params.push(data.avatar);    fields.push(`avatar_url=$${params.length}`); }
  if (!fields.length) throw { status: 400, message: 'No data to update' };
  params.push(userId);
  const sql = `
    UPDATE users SET ${fields.join(', ')}, updated_at=now()
    WHERE id=$${params.length}
    RETURNING id, email, first_name AS "firstName", last_name AS "lastName", avatar_url AS "avatar"
  `;
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function changePassword(userId, oldPassword, newPassword) {
  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE id=$1`, [userId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found' };
  const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!valid) throw { status: 400, message: 'Old password incorrect' };
  // Utiliser une valeur par défaut pour les tours bcrypt si la variable n'est pas définie
  const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
  const hash = await bcrypt.hash(newPassword, rounds);
  await pool.query(`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, userId]);
  return;
}

module.exports = { getProfile, updateProfile, changePassword };
