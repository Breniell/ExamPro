// src/services/ticketService.js
const pool = require('../config/database');

async function listTickets(user) {
  if (user.role === 'admin') {
    const { rows } = await pool.query(`SELECT * FROM tickets ORDER BY created_at DESC`);
    return rows;
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM tickets WHERE created_by = $1 ORDER BY created_at DESC`, [user.id]
    );
    return rows;
  }
}

async function getTicket(id, user) {
  const { rows } = await pool.query(`SELECT * FROM tickets WHERE id = $1`, [id]);
  if (!rows.length) throw { status: 404, message: 'Ticket not found' };
  const ticket = rows[0];
  if (user.role !== 'admin' && ticket.created_by !== user.id) {
    throw { status: 403, message: 'Access denied' };
  }
  return ticket;
}

async function createTicket({ subject, description, createdBy }) {
  const { rows } = await pool.query(`
    INSERT INTO tickets (subject, description, created_by, status, created_at)
    VALUES ($1,$2,$3,'open', now())
    RETURNING *
  `, [subject, description, createdBy]);
  return rows[0];
}

async function updateTicket(id, data, user) {
  // Vérifier que l'utilisateur peut mettre à jour le ticket : soit administrateur, soit créateur
  const { rows: ticketRows } = await pool.query('SELECT created_by FROM tickets WHERE id = $1', [id]);
  if (!ticketRows.length) throw { status: 404, message: 'Ticket not found' };
  const creatorId = ticketRows[0].created_by;
  if (user.role !== 'admin' && creatorId !== user.id) {
    throw { status: 403, message: 'Access denied' };
  }

  const fields = [], params = [];
  if (data.subject)     { params.push(data.subject);     fields.push(`subject = $${params.length}`); }
  if (data.description) { params.push(data.description); fields.push(`description = $${params.length}`); }
  if (data.status)      { params.push(data.status);      fields.push(`status = $${params.length}`); }
  if (!fields.length) throw { status: 400, message: 'No fields to update' };
  params.push(id);
  const sql = `
    UPDATE tickets SET ${fields.join(', ')}, updated_at=now()
    WHERE id = $${params.length}
    RETURNING *
  `;
  const { rows } = await pool.query(sql, params);
  if (!rows.length) throw { status: 404, message: 'Ticket not found' };
  return rows[0];
}

async function deleteTicket(id, user) {
  // Admin or creator can delete
  const cond = user.role === 'admin' ? '' : ' AND created_by = $2';
  const params = user.role === 'admin' ? [id] : [id, user.id];
  const { rows } = await pool.query(
    `DELETE FROM tickets WHERE id = $1${cond} RETURNING id`, params
  );
  if (!rows.length) throw { status: 404, message: 'Ticket not found or access denied' };
  return rows[0];
}

module.exports = { listTickets, getTicket, createTicket, updateTicket, deleteTicket };
