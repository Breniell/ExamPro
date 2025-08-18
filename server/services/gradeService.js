// src/services/gradeService.js
const pool = require('../config/database');

/**
 * Liste des sessions à corriger (ou corrigées) pour un prof.
 * ⚠️ COUNT(DISTINCT ...) pour éviter les doubles-comptes dus aux LEFT JOIN multiples.
 */
async function listSessionsToGrade(teacherId, filters = {}) {
  const { examId, status } = filters;
  let query = `
    SELECT
      es.id AS session_id,
      es.exam_id,
      e.title AS exam_title,
      u.id AS student_id,
      u.first_name,
      u.last_name,
      COUNT(DISTINCT a.id)          AS answers_count,
      COUNT(DISTINCT g.question_id) AS graded_count,
      es.submitted_at
    FROM exam_sessions es
    JOIN exams e   ON es.exam_id = e.id
    JOIN users u   ON es.student_id = u.id
    LEFT JOIN answers a ON es.id = a.session_id
    LEFT JOIN grades  g ON es.id = g.session_id
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
    ORDER BY es.submitted_at DESC NULLS LAST
    LIMIT 100
  `;
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Détail d’une session pour correction : questions, réponses, notes.
 * Vérifie que le teacher est bien propriétaire de l’examen.
 */
async function getSessionForGrading(sessionId, teacherId) {
  const sess = await pool.query(`
    SELECT es.id, es.exam_id, e.title AS exam_title
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.id
    WHERE es.id = $1 AND e.teacher_id = $2
  `, [sessionId, teacherId]);
  if (!sess.rows.length) throw { status: 404, message: 'Session not found or access denied' };
  const meta = sess.rows[0];

  const q = await pool.query(`
    SELECT
      q.id    AS question_id,
      q.question_text,
      q.points AS max_points,
      a.answer_text,
      a.selected_option,
      g.points_awarded,
      g.feedback
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.session_id = $1
    LEFT JOIN grades  g ON g.question_id = q.id AND g.session_id = $1
    WHERE q.exam_id = $2
    ORDER BY q.order_index NULLS LAST, q.created_at
  `, [sessionId, meta.exam_id]);

  return {
    session: { id: meta.id, exam_id: meta.exam_id, exam_title: meta.exam_title },
    questions: q.rows
  };
}

/**
 * Noter (upsert) une question d’une session.
 * - Vérifie que la session appartient à un exam du prof
 * - Vérifie que la question appartient au même exam que la session
 * - Ne dépasse pas le max
 * - Upsert avec ton schéma (max_points, graded_by)
 */
async function gradeQuestion({ sessionId, questionId, teacherId, pointsAwarded, feedback }) {
  // Autorisation + cohérence (question ↔ examen de la session)
  const verif = await pool.query(`
    SELECT q.points AS max_points
    FROM exam_sessions s
    JOIN exams e   ON e.id = s.exam_id AND e.teacher_id = $3
    JOIN questions q ON q.id = $2 AND q.exam_id = s.exam_id
    WHERE s.id = $1
  `, [sessionId, questionId, teacherId]);
  if (!verif.rows.length) throw { status: 403, message: 'Forbidden' };

  const max = Number(verif.rows[0].max_points || 0);
  const awarded = Math.max(0, Math.min(Number(pointsAwarded || 0), max));

  // Upsert note (schéma: max_points, graded_by)
  const { rows } = await pool.query(`
    INSERT INTO grades (session_id, question_id, points_awarded, max_points, feedback, graded_by, graded_at)
    VALUES ($1,$2,$3,$4,$5,$6, now())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
      points_awarded = EXCLUDED.points_awarded,
      max_points     = EXCLUDED.max_points,
      feedback       = EXCLUDED.feedback,
      graded_by      = EXCLUDED.graded_by,
      graded_at      = now()
    RETURNING session_id, question_id, points_awarded, max_points, feedback, graded_by, graded_at
  `, [sessionId, questionId, awarded, max, feedback ?? null, teacherId]);

  return rows[0];
}

/**
 * Finaliser la correction : toutes les questions de l’examen doivent être notées.
 * Vérifie aussi que le professeur est bien propriétaire.
 */
async function finalizeGrading(sessionId, teacherId) {
  // Vérifier droits prof + récupérer exam_id
  const sRes = await pool.query(`
    SELECT s.id, s.exam_id, s.status
    FROM exam_sessions s
    JOIN exams e ON e.id = s.exam_id
    WHERE s.id = $1 AND e.teacher_id = $2
  `, [sessionId, teacherId]);
  if (!sRes.rows.length) throw { status: 403, message: 'Forbidden' };
  const { exam_id: examId } = sRes.rows[0];

  // Toutes les questions sont-elles notées ?
  const chk = await pool.query(`
    SELECT
      COUNT(q.id)::int                         AS total,
      COUNT(DISTINCT g.question_id)::int       AS graded
    FROM questions q
    JOIN exam_sessions es ON q.exam_id = es.exam_id
    LEFT JOIN grades g    ON g.session_id = es.id AND g.question_id = q.id
    WHERE es.id = $1
  `, [sessionId]);

  if (!chk.rows.length) throw { status: 404, message: 'Session not found' };
  const { total, graded } = chk.rows[0];
  if (graded < total) throw { status: 400, message: 'All questions must be graded first' };

  // Mise à jour statut → 'graded' (avec fallback si colonne graded_at absente)
  try {
    const { rows } = await pool.query(`
      UPDATE exam_sessions
      SET status = 'graded', graded_at = now()
      WHERE id = $1
      RETURNING id, status, graded_at
    `, [sessionId]);
    return rows[0];
  } catch (err) {
    if (err && err.code === '42703') {
      const { rows } = await pool.query(`
        UPDATE exam_sessions
        SET status = 'graded'
        WHERE id = $1
        RETURNING id, status
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
