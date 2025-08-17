// src/services/questionService.js
const pool = require('../config/database');

async function listQuestions(filters = {}) {
  const { subject, difficulty, search } = filters;
  let sql = `
    SELECT id, question_text AS "text", question_type AS "type",
           options, created_at AS "createdAt"
    FROM questions
    WHERE 1=1`;
  const params = [];
  if (subject) {
    params.push(subject);
    sql += ` AND subject = $${params.length}`;
  }
  if (difficulty) {
    params.push(difficulty);
    sql += ` AND difficulty = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND question_text ILIKE $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getQuestion(id) {
  const { rows } = await pool.query(
    `SELECT id, question_text AS "text", question_type AS "type",
     options, created_at AS "createdAt"
     FROM questions WHERE id = $1`, [id]
  );
  if (!rows.length) throw { status: 404, message: 'Question not found' };
  return rows[0];
}

async function createQuestion(data) {
  const { text, type, options, subject = null, difficulty = null } = data;
  const { rows } = await pool.query(`
    INSERT INTO questions (question_text, question_type, options, subject, difficulty, created_at)
    VALUES ($1,$2,$3,$4,$5, now())
    RETURNING id, question_text AS "text", question_type AS "type", options, created_at AS "createdAt"
  `, [text, type, options, subject, difficulty]);
  return rows[0];
}

async function updateQuestion(id, data) {
  const fields = [];
  const params = [];
  if (data.text !== undefined)        { params.push(data.text); fields.push(`question_text = $${params.length}`); }
  if (data.type !== undefined)        { params.push(data.type); fields.push(`question_type = $${params.length}`); }
  if (data.options !== undefined)     { params.push(data.options); fields.push(`options = $${params.length}`); }
  if (data.subject !== undefined)     { params.push(data.subject); fields.push(`subject = $${params.length}`); }
  if (data.difficulty !== undefined)  { params.push(data.difficulty); fields.push(`difficulty = $${params.length}`); }
  if (!fields.length) throw { status: 400, message: 'No fields to update' };
  params.push(id);
  const sql = `
    UPDATE questions SET ${fields.join(', ')}, updated_at = now()
    WHERE id = $${params.length}
    RETURNING id, question_text AS "text", question_type AS "type", options, updated_at AS "updatedAt"`;
  const { rows } = await pool.query(sql, params);
  if (!rows.length) throw { status: 404, message: 'Question not found' };
  return rows[0];
}

async function deleteQuestion(id) {
  const { rows } = await pool.query(
    `DELETE FROM questions WHERE id = $1 RETURNING id`, [id]
  );
  if (!rows.length) throw { status: 404, message: 'Question not found' };
  return rows[0];
}

module.exports = {
  listQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion
};
