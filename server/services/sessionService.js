// src/services/sessionService.js
const pool = require('../config/database');

async function startSession({ examId, studentId, ip, ua }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier disponibilité de l’examen
    const examRes = await client.query(`
      SELECT id, title, duration_minutes, end_date
      FROM exams
      WHERE id = $1
        AND status IN ('published','active')
        AND start_date <= now()
        AND end_date > now()
    `, [examId]);
    if (!examRes.rows.length) throw { status: 404, message: 'Exam not available' };

    // Session existante ?
    const existRes = await client.query(`
      SELECT *
      FROM exam_sessions
      WHERE exam_id = $1 AND student_id = $2
      ORDER BY started_at DESC
      LIMIT 1
    `, [examId, studentId]);

    if (existRes.rows.length) {
      await client.query('COMMIT');
      return existRes.rows[0];
    }

    // Créer session
    const insertRes = await client.query(`
      INSERT INTO exam_sessions (exam_id, student_id, ip_address, user_agent, status, started_at)
      VALUES ($1,$2,$3,$4,'in_progress', now())
      RETURNING *
    `, [examId, studentId, ip, ua]);

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
  const params = [sessionId, user.id];
  let query = `
    SELECT es.*, e.title, e.duration_minutes, e.end_date, e.teacher_id
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.id
    WHERE es.id = $1
  `;

  if (user.role === 'student') {
    query += ` AND es.student_id = $2`;
  } else if (user.role === 'teacher') {
    query += ` AND e.teacher_id = $2`;
  }

  const { rows } = await pool.query(query, params);
  if (!rows.length) throw { status: 404, message: 'Session not found or access denied' };
  return rows[0];
}

async function submitAnswer({ sessionId, questionId, answerText, selectedOption, timeSpent, studentId }) {
  // 1) Session doit être en cours
  const sessRes = await pool.query(`
    SELECT id, exam_id, status
    FROM exam_sessions
    WHERE id = $1 AND student_id = $2
  `, [sessionId, studentId]);

  if (!sessRes.rows.length) throw { status: 404, message: 'Session not found' };
  const sess = sessRes.rows[0];
  if (sess.status !== 'in_progress') throw { status: 400, message: 'Session not in progress' };

  // 2) Récupérer type & options directement depuis questions (PAS de vue exam_questions)
  const qRes = await pool.query(`
    SELECT id, exam_id, question_type::text AS type, options
    FROM questions
    WHERE id = $1 AND exam_id = $2
  `, [questionId, sess.exam_id]);
  if (!qRes.rows.length) throw { status: 400, message: 'Question not in this exam' };

  const q = qRes.rows[0];
  const kind = (q.type || '').toLowerCase();

  // 3) Normaliser payload selon le type
  let answer_text = null;
  let selected_option = null;

  if (kind === 'qcm' || kind === 'true_false' || kind === 'mcq' || kind === 'truefalse') {
    const val = (selectedOption ?? '').trim();
    selected_option = val || null;

    // si options existent, on peut valider l’option
    if (selected_option && Array.isArray(q.options)) {
      const ok = q.options.includes(selected_option);
      if (!ok) throw { status: 400, message: 'Invalid option' };
    }
  } else {
    // réponses libres
    const val = (answerText ?? '').toString();
    answer_text = val;
  }

  const time_spent = Math.max(0, parseInt(timeSpent || 0, 10) || 0);

  // 4) Upsert réponse
  const { rows } = await pool.query(`
    INSERT INTO answers (session_id, question_id, answer_text, selected_option, time_spent, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, now(), now())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
      answer_text = EXCLUDED.answer_text,
      selected_option = EXCLUDED.selected_option,
      time_spent = EXCLUDED.time_spent,
      updated_at = now()
    RETURNING id, session_id, question_id, answer_text, selected_option, time_spent, updated_at
  `, [sessionId, questionId, answer_text, selected_option, time_spent]);

  return rows[0];
}

async function submitExam(sessionId, studentId) {
  const { rows } = await pool.query(`
    UPDATE exam_sessions
    SET status = 'submitted', submitted_at = now()
    WHERE id = $1 AND student_id = $2 AND status = 'in_progress'
    RETURNING *
  `, [sessionId, studentId]);
  if (!rows.length) throw { status: 404, message: 'Active session not found' };
  return rows[0];
}

async function logSecurityEvent({ sessionId, eventType, eventData, severity = 'low' }) {
  // Toujours stocker event_data en JSON (jsonb)
  const payload = (typeof eventData === 'string')
    ? eventData
    : JSON.stringify(eventData ?? {});

  const { rows } = await pool.query(
    `INSERT INTO security_logs (session_id, event_type, event_data, severity, resolved, created_at)
     VALUES ($1,$2,$3::jsonb,$4,false, now())
     RETURNING id, session_id, event_type, event_data, severity, resolved, created_at`,
    [sessionId, eventType, payload, severity]
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
