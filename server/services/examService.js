// src/services/examService.js
const pool = require('../config/database');

/** Types autorisés côté DB (d'après la contrainte) */
const ALLOWED_DB_TYPES = new Set(['multiple_choice', 'text', 'essay', 'true_false']);

/** Normalisation des types venant du front */
function normalizeQuestionType(raw) {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  // QCM
  if (['qcm', 'mcq', 'multiple_choice', 'multiplechoice', 'multiple_choice_question'].includes(t)) {
    return 'multiple_choice';
  }
  // Vrai/Faux
  if (['true_false', 'truefalse', 'boolean', 'bool', 'vrai_faux', 'vraifaux', 'true_false_question'].includes(t)) {
    return 'true_false';
  }
  // Texte (réponse libre courte)
  if (['text', 'texte', 'free', 'open', 'open_ended', 'reponse_libre', 'short_answer'].includes(t)) {
    return 'text';
  }
  // Rédaction (essai)
  if (['essay', 'essai', 'long_answer', 'long_text'].includes(t)) {
    return 'essay';
  }
  // fallback prudent : texte
  return 'text';
}

/** Normaliser/valider les options selon le type */
function normalizeOptions(rawOptions, type) {
  // Uniquement pertinent pour multiple_choice et true_false
  if (!['multiple_choice', 'true_false'].includes(type)) return null;

  let opts = rawOptions;

  if (typeof opts === 'string') {
    const parts = opts
      .split(/\r?\n|,/)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : null;
  }

  if (Array.isArray(opts)) {
    const cleaned = opts
      .map(x => (typeof x === 'string' ? x.trim() : x))
      .filter(Boolean);
    return cleaned.length ? cleaned : null;
  }

  if (opts && typeof opts === 'object') {
    return opts;
  }

  return null;
}

async function listExamsForUser(user, { scope = 'available' } = {}) {
  let query, params = [];
  if (user.role === 'student') {
    let timeFilter = `e.start_date <= now() AND e.end_date > now()`;
    if (scope === 'upcoming') timeFilter = `e.start_date > now()`;
    if (scope === 'all')       timeFilter = `e.end_date > now()`;

    query = `
      SELECT e.*,
             u.first_name AS "teacherFirst", u.last_name AS "teacherLast",
             es.status AS sessionStatus
      FROM exams e
      JOIN users u ON e.teacher_id = u.id
      LEFT JOIN exam_sessions es ON e.id = es.exam_id AND es.student_id = $1
      WHERE e.status IN ('published','active')
        AND ${timeFilter}
      ORDER BY e.start_date`;
    params = [user.id];
  } else if (user.role === 'teacher') {
    query = `
      SELECT e.*, COUNT(es.id) AS sessionsCount
      FROM exams e
      LEFT JOIN exam_sessions es ON e.id = es.exam_id
      WHERE e.teacher_id = $1
      GROUP BY e.id
      ORDER BY e.created_at DESC`;
    params = [user.id];
  } else {
    query = `
      SELECT e.*, u.first_name AS "teacherFirst", u.last_name AS "teacherLast",
             COUNT(es.id) AS sessionsCount
      FROM exams e
      JOIN users u ON e.teacher_id = u.id
      LEFT JOIN exam_sessions es ON e.id = es.exam_id
      GROUP BY e.id, u.first_name, u.last_name
      ORDER BY e.created_at DESC`;
  }
  const { rows } = await pool.query(query, params);
  return rows;
}

async function getExamById(id, user) {
  const examRes = await pool.query(`
    SELECT e.*, u.first_name AS "teacherFirst", u.last_name AS "teacherLast"
    FROM exams e JOIN users u ON e.teacher_id = u.id
    WHERE e.id = $1`, [id]);
  if (!examRes.rows.length) throw { status: 404, message: 'Exam not found' };
  const exam = examRes.rows[0];

  if (user.role === 'student' && !['published','active'].includes(exam.status)) {
    throw { status: 403, message: 'Exam not available' };
  }
  // ✅ bugfix : utiliser "user.id" (et pas req.user.id)
  if (user.role === 'teacher' && exam.teacher_id !== user.id) {
    throw { status: 403, message: 'Access denied' };
  }

  // ✅ mapping "essay" -> "text" pour rester compatible FE (qcm | true_false | text)
  const qRes = await pool.query(`
    SELECT id,
           question_text AS "text",
           CASE
             WHEN question_type = 'multiple_choice' THEN 'qcm'
             WHEN question_type = 'essay'           THEN 'text'
             ELSE question_type
           END AS "type",
           points      AS "points",
           order_index AS "order",
           options
    FROM questions
    WHERE exam_id = $1
    ORDER BY order_index`, [id]);

  exam.questions = qRes.rows;
  return exam;
}

async function createExam(data, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      title,
      description = null,
      duration_minutes,
      start_date,
      questions = []
    } = data;

    if (!title || !duration_minutes || !start_date || !Array.isArray(questions) || questions.length === 0) {
      throw { status: 400, message: 'Missing required fields' };
    }

    const startDateObj = new Date(start_date);
    if (isNaN(startDateObj.getTime())) {
      throw { status: 400, message: 'Invalid start_date' };
    }
    const endDateObj = new Date(startDateObj.getTime() + Number(duration_minutes) * 60000);

    const ex = await client.query(`
      INSERT INTO exams (title, description, teacher_id, duration_minutes, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz)
      RETURNING *`,
      [title, description, user.id, duration_minutes, startDateObj, endDateObj]
    );
    const exam = ex.rows[0];

    for (let i = 0; i < questions.length; i++) {
      const raw = questions[i] || {};

      const qText = raw.text ?? raw.question ?? '';
      const normType = normalizeQuestionType(raw.type);

      if (!ALLOWED_DB_TYPES.has(normType)) {
        throw {
          status: 400,
          message: `Invalid question type "${raw.type}". Allowed: ${[...ALLOWED_DB_TYPES].join(', ')}`
        };
      }

      const qPoints = Number(raw.points ?? 0);
      const opts = normalizeOptions(raw.options, normType);

      await client.query(`
        INSERT INTO questions (exam_id, question_text, question_type, points, order_index, options)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      `, [exam.id, qText, normType, qPoints, i, opts ? JSON.stringify(opts) : null]);
    }

    await client.query('COMMIT');
    return exam;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateExamStatus(examId, status, user) {
  if (!['draft','published','active','completed','archived'].includes(status)) {
    throw { status: 400, message: 'Invalid status' };
  }
  const res = await pool.query(`
    UPDATE exams SET status=$1, updated_at=now()
    WHERE id=$2 AND (teacher_id=$3 OR $4='admin')
    RETURNING *`,
    [status, examId, user.id, user.role]
  );
  if (!res.rows.length) throw { status: 404, message: 'Exam not found or access denied' };
  return res.rows[0];
}

module.exports = {
  listExamsForUser,
  getExamById,
  createExam,
  updateExamStatus
};
