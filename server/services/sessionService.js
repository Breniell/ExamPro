// src/services/sessionService.js
const pool = require('../config/database');

async function startSession({ examId, studentId, ip, ua }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier disponibilité de l’examen
    const examRes = await client.query(`
      SELECT * FROM exams
      WHERE id = $1
        AND status IN ('published','active')
        AND start_date <= now()
        AND end_date > now()
    `, [examId]);
    if (!examRes.rows.length) throw { status: 404, message: 'Exam not available' };

    // Vérifier session existante
    const existRes = await client.query(`
      SELECT * FROM exam_sessions
      WHERE exam_id = $1 AND student_id = $2
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
  // Autoriser student, teacher, admin
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
    // teacher peut voir si il a créé l’exam
    query += ` AND e.teacher_id = $2`;
  }
  // admin voit tout

  const { rows } = await pool.query(query, params);
  if (!rows.length) throw { status: 404, message: 'Session not found or access denied' };
  return rows[0];
}

async function submitAnswer({ sessionId, questionId, answerText, selectedOption, timeSpent, studentId }) {
  // Vérifier session active
  const sessRes = await pool.query(`
    SELECT * FROM exam_sessions
    WHERE id = $1 AND student_id = $2 AND status = 'in_progress'
  `, [sessionId, studentId]);
  if (!sessRes.rows.length) throw { status: 404, message: 'No active session' };

  // Upsert réponse
  const { rows } = await pool.query(`
    INSERT INTO answers (session_id, question_id, answer_text, selected_option, time_spent, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, now(), now())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET 
      answer_text = EXCLUDED.answer_text,
      selected_option = EXCLUDED.selected_option,
      time_spent = EXCLUDED.time_spent,
      updated_at = now()
    RETURNING *
  `, [sessionId, questionId, answerText, selectedOption, timeSpent]);

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
  const { rows } = await pool.query(
    `INSERT INTO security_logs (session_id, event_type, event_data, severity, resolved)
     VALUES ($1,$2,$3,$4,false)
     RETURNING id, session_id, event_type, event_data, severity, resolved, created_at`,
    [sessionId, eventType, eventData, severity]
  );
  return rows[0]; // ✅ indispensable pour l’émission live & la réponse HTTP
}

module.exports = {
  startSession,
  getSession,
  submitAnswer,
  submitExam,
  logSecurityEvent,
};
