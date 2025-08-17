// src/services/gradeService.js
const pool = require('../config/database');

async function listSessionsToGrade(teacherId, filters = {}) {
  const { examId, status } = filters;
  let query = `
    SELECT es.id AS session_id, es.exam_id, e.title AS exam_title,
           u.id AS student_id, u.first_name, u.last_name,
           COUNT(a.id) AS answers_count,
           COUNT(g.id) AS graded_count,
           es.submitted_at
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.id
    JOIN users u ON es.student_id = u.id
    LEFT JOIN answers a ON es.id = a.session_id
    LEFT JOIN grades g ON es.id = g.session_id
    WHERE e.teacher_id = $1
  `;
  const params = [teacherId];
  if (examId) {
    params.push(examId);
    query += ` AND es.exam_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND es.status = $${params.length}`;
  }
  query += `
    GROUP BY es.id, e.title, u.id, u.first_name, u.last_name
    ORDER BY es.submitted_at DESC
    LIMIT 100
  `;
  const { rows } = await pool.query(query, params);
  return rows;
}

async function getSessionForGrading(sessionId, teacherId) {
  // Verify session belongs to a teacher’s exam
  const sess = await pool.query(`
    SELECT es.id, es.exam_id, e.title AS exam_title
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.id
    WHERE es.id = $1 AND e.teacher_id = $2
  `, [sessionId, teacherId]);
  if (!sess.rows.length) throw { status: 404, message: 'Session not found or access denied' };

  // Fetch all questions, answers, and existing grades
  const q = await pool.query(`
    SELECT q.id AS question_id, q.question_text, q.points AS max_points,
           a.answer_text, a.selected_option, g.points_awarded, g.feedback
    FROM questions q
    LEFT JOIN answers a ON q.id = a.question_id AND a.session_id = $1
    LEFT JOIN grades g ON q.id = g.question_id AND g.session_id = $1
    WHERE q.exam_id = $2
    ORDER BY q.order_index
  `, [sessionId, sess.rows[0].exam_id]);

  return {
    session: sess.rows[0],
    questions: q.rows
  };
}

async function gradeQuestion({ sessionId, questionId, teacherId, pointsAwarded, feedback }) {
  // Verify teacher ownership & max points
  const v = await pool.query(`
    SELECT q.points AS max_points
    FROM grades g
    JOIN questions q ON q.id = $2 AND q.exam_id = g.exam_id
    JOIN exam_sessions es ON es.id = g.session_id
    WHERE g.session_id = $1
  `, [sessionId, questionId]);
  // Fallback: fetch max_points directly
  if (!v.rows.length) {
    const qmax = await pool.query(`SELECT points AS max_points FROM questions WHERE id = $1`, [questionId]);
    if (!qmax.rows.length) throw { status: 404, message: 'Question not found' };
    v.rows = qmax.rows;
  }
  const max = v.rows[0].max_points;
  if (pointsAwarded > max) throw { status: 400, message: 'Points exceed maximum' };

  // Upsert grade
  const { rows } = await pool.query(`
    INSERT INTO grades (session_id, question_id, points_awarded, max_points, feedback, graded_by, graded_at)
    VALUES ($1,$2,$3,$4,$5,$6, now())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
      points_awarded = EXCLUDED.points_awarded,
      feedback = EXCLUDED.feedback,
      graded_by = EXCLUDED.graded_by,
      graded_at = now()
    RETURNING *
  `, [sessionId, questionId, pointsAwarded, max, feedback, teacherId]);

  return rows[0];
}

async function finalizeGrading(sessionId, teacherId) {
  // Ensure all questions graded
  const chk = await pool.query(`
    SELECT COUNT(q.id) AS total, COUNT(g.id) AS graded
    FROM questions q
    JOIN exam_sessions es ON q.exam_id = es.exam_id
    LEFT JOIN grades g ON g.session_id = es.id AND g.question_id = q.id
    WHERE es.id = $1
  `, [sessionId]);
  if (!chk.rows.length) throw { status: 404, message: 'Session not found' };
  const { total, graded } = chk.rows[0];
  if (parseInt(total) !== parseInt(graded)) {
    throw { status: 400, message: 'All questions must be graded first' };
  }

  // Try update with graded_at; fallback sans la colonne
  try {
    const { rows } = await pool.query(`
      UPDATE exam_sessions
      SET status = 'graded', graded_at = now()
      WHERE id = $1
      RETURNING *
    `, [sessionId]);
    return rows[0];
  } catch (err) {
    // colonne graded_at absente → on fait sans
    if (err && err.code === '42703') { // undefined_column
      const { rows } = await pool.query(`
        UPDATE exam_sessions
        SET status = 'graded'
        WHERE id = $1
        RETURNING *
      `, [sessionId]);
      return rows[0];
    }
    throw err;
  }
}


module.exports = {
  listSessionsToGrade,
  getSessionForGrading,
  gradeQuestion,
  finalizeGrading
};
