// src/services/sessionService.js
const pool = require('../config/database');

async function startSession({ examId, studentId, ip, ua }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const examRes = await client.query(
      `SELECT id, title, duration_minutes, start_date, end_date, status
       FROM exams
       WHERE id = $1
         AND status IN ('published','active')
         AND start_date <= now()
         AND end_date > now()`,
      [examId]
    );
    if (!examRes.rows.length) throw { status: 404, message: 'Exam not available' };

    const existRes = await client.query(
      `SELECT * FROM exam_sessions
       WHERE exam_id = $1 AND student_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [examId, studentId]
    );
    if (existRes.rows.length) {
      await client.query('COMMIT');
      return existRes.rows[0];
    }

    const insertRes = await client.query(
      `INSERT INTO exam_sessions (exam_id, student_id, ip_address, user_agent, status, started_at)
       VALUES ($1,$2,$3,$4,'in_progress', now())
       RETURNING *`,
      [examId, studentId, ip, ua]
    );

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getSession(sessionId, user) {
  const params = [sessionId];
  let whereAuth = '';

  if (user.role === 'student') {
    params.push(user.id);
    whereAuth = 'AND es.student_id = $2';
  } else if (user.role === 'teacher') {
    params.push(user.id);
    whereAuth = 'AND e.teacher_id = $2';
  }

  const { rows } = await pool.query(
    `SELECT es.*, e.title, e.duration_minutes, e.end_date, e.teacher_id
     FROM exam_sessions es
     JOIN exams e ON es.exam_id = e.id
     WHERE es.id = $1
     ${whereAuth}`,
    params
  );
  if (!rows.length) throw { status: 404, message: 'Session not found or access denied' };
  return rows[0];
}

/** 
 * Récupère {id,type,options} d'une question pour un exam donné,
 * quel que soit le schéma réel.
 */
async function getQuestionMeta(questionId, examId) {
  // 1) Essai exam_questions
  try {
    const r = await pool.query(
      `SELECT id, type, options
       FROM exam_questions
       WHERE id = $1 AND exam_id = $2`,
      [questionId, examId]
    );
    if (r.rows[0]) return r.rows[0];
  } catch (e) {
    // 42P01 = undefined_table -> on ignore et on tente la suite
    if (e.code && e.code !== '42P01') throw e;
  }

  // 2) Essai questions
  try {
    const r = await pool.query(
      `SELECT id, type, options
       FROM questions
       WHERE id = $1 AND exam_id = $2`,
      [questionId, examId]
    );
    if (r.rows[0]) return r.rows[0];
  } catch (e) {
    if (e.code && e.code !== '42P01') throw e;
  }

  // 3) Fallback JSON: exams.questions (array d'objets)
  try {
    const r = await pool.query(
      `SELECT questions
       FROM exams
       WHERE id = $1`,
      [examId]
    );
    const row = r.rows[0];
    if (row && row.questions) {
      const arr = Array.isArray(row.questions) ? row.questions : [];
      const found = arr.find(q => String(q.id) === String(questionId));
      if (found) {
        // normaliser pour l'appelant
        return {
          id: found.id,
          type: found.type,
          options: found.options ?? null,
        };
      }
    }
  } catch (e) {
    // si table/colonne absente, on tombera sur l'erreur plus lisible ci-dessous
  }

  return null;
}

/**
 * - Vérifie session
 * - Récupère meta question (table exam_questions OU questions OU JSON)
 * - QCM/TRUE_FALSE -> selected_option requis (+ contrôle liste si fournie)
 * - TEXT -> answer_text string
 * - Upsert + accumulation time_spent
 */
async function submitAnswer({ sessionId, questionId, answerText, selectedOption, timeSpent, studentId }) {
  const sessRes = await pool.query(
    `SELECT es.id, es.exam_id, es.student_id, es.status
     FROM exam_sessions es
     WHERE es.id = $1`,
    [sessionId]
  );
  const sess = sessRes.rows[0];
  if (!sess) throw { status: 404, message: 'Session introuvable' };
  if (sess.student_id !== studentId) throw { status: 403, message: 'Access denied' };
  if (sess.status !== 'in_progress') throw { status: 400, message: 'Session not in progress' };

  // ✅ meta question robuste
  const q = await getQuestionMeta(questionId, sess.exam_id);
  if (!q) throw { status: 400, message: 'Question inconnue pour cet examen' };

  const spent = Number.isFinite(+timeSpent) ? Math.max(0, parseInt(timeSpent, 10)) : 0;
  let _answerText = null;
  let _selectedOption = null;

  if (q.type === 'qcm' || q.type === 'true_false') {
    if (!selectedOption || typeof selectedOption !== 'string' || !selectedOption.trim()) {
      throw { status: 400, message: 'Une option doit être sélectionnée' };
    }
    if (q.options && Array.isArray(q.options) && q.options.length > 0) {
      const norm = (s) => String(s).trim().toLowerCase();
      const ok = q.options.map(norm).includes(norm(selectedOption));
      if (!ok) throw { status: 400, message: 'Option invalide pour cette question' };
    }
    _selectedOption = selectedOption;
    _answerText = null;
  } else {
    _answerText = (typeof answerText === 'string') ? answerText : (answerText == null ? '' : String(answerText));
    _selectedOption = null;
  }

  const { rows } = await pool.query(
    `INSERT INTO answers (session_id, question_id, answer_text, selected_option, time_spent, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5, now(), now())
     ON CONFLICT (session_id, question_id)
     DO UPDATE SET
       answer_text     = EXCLUDED.answer_text,
       selected_option = EXCLUDED.selected_option,
       time_spent      = GREATEST(0, answers.time_spent) + GREATEST(0, EXCLUDED.time_spent),
       updated_at      = now()
     RETURNING id, session_id, question_id, answer_text, selected_option, time_spent, updated_at`,
    [sessionId, questionId, _answerText, _selectedOption, spent]
  );

  return rows[0];
}

async function submitExam(sessionId, studentId) {
  const { rows } = await pool.query(
    `UPDATE exam_sessions
     SET status = 'submitted', submitted_at = now()
     WHERE id = $1 AND student_id = $2 AND status = 'in_progress'
     RETURNING *`,
    [sessionId, studentId]
  );
  if (!rows.length) throw { status: 404, message: 'Active session not found' };
  return rows[0];
}

async function logSecurityEvent({ sessionId, eventType, eventData, severity = 'low' }) {
  if (!['low','medium','high'].includes(severity)) severity = 'low';

  const s = await pool.query(`SELECT id FROM exam_sessions WHERE id = $1`, [sessionId]);
  if (!s.rows[0]) throw { status: 404, message: 'Session introuvable' };

  let dataForDb = null;
  try {
    if (eventData === null || eventData === undefined) {
      dataForDb = null;
    } else if (typeof eventData === 'object') {
      dataForDb = JSON.stringify(eventData);
    } else if (typeof eventData === 'string') {
      dataForDb = JSON.stringify({ message: eventData });
    } else {
      dataForDb = JSON.stringify({ value: eventData });
    }
  } catch {
    dataForDb = JSON.stringify({ _raw: String(eventData) });
  }

  const { rows } = await pool.query(
    `INSERT INTO security_logs (session_id, event_type, event_data, severity, resolved)
     VALUES ($1,$2,$3::jsonb,$4,false)
     RETURNING id, session_id, event_type, event_data, severity, resolved, created_at`,
    [sessionId, eventType, dataForDb, severity]
  );
  return rows[0];
}

module.exports = {
  startSession,
  getSession,
  submitAnswer,
  submitExam,
  logSecurityEvent,
};
