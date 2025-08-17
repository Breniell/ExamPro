// src/services/notificationService.js
const pool = require('../config/database');

async function listNotifications(userId) {
  const { rows } = await pool.query(`
    SELECT id, type, message, is_read AS "isRead", created_at AS "createdAt"
    FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC`, [userId]);
  return rows;
}

async function createNotification({ userId, type, message }) {
  const { rows } = await pool.query(`
    INSERT INTO notifications (user_id, type, message, is_read, created_at)
    VALUES ($1,$2,$3,false, now())
    RETURNING id, type, message, is_read AS "isRead", created_at AS "createdAt"
  `, [userId, type, message]);
  return rows[0];
}

async function markAsRead(id, userId) {
  const { rows } = await pool.query(`
    UPDATE notifications
    SET is_read = true
    WHERE id = $1 AND user_id = $2
    RETURNING id, is_read AS "isRead"
  `, [id, userId]);
  if (!rows.length) throw { status: 404, message: 'Notification not found' };
  return rows[0];
}

async function deleteNotification(id, userId) {
  const { rows } = await pool.query(`
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `, [id, userId]);
  if (!rows.length) throw { status: 404, message: 'Notification not found' };
  return rows[0];
}

module.exports = { listNotifications, createNotification, markAsRead, deleteNotification };
