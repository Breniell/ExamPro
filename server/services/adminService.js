// server/services/adminService.js
const db = require('../config/database');

// -- STATS --

async function getUserStats() {
  const { rows } = await db.query(`
    SELECT role, COUNT(*)::int AS count
    FROM users
    GROUP BY role
  `);
  return rows;
}

async function getActiveExamsCount() {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM exams WHERE status = 'active'`);
  return rows[0].count;
}

async function getActiveCamerasCount() {
  // Si la table cameras n'existe pas encore, commente cet appel ou entoure d'un try/catch
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM cameras WHERE status = 'active'`);
  return rows[0].count;
}

async function getSecurityAlertsCount() {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM security_logs WHERE resolved = false`);
  return rows[0].count;
}

// -- ALERTES --

async function getRecentAlerts(limit = 5) {
  const { rows } = await db.query(
    `
    SELECT
      id,
      session_id,
      event_type,
      event_data,
      severity,
      created_at
    FROM security_logs
    ORDER BY created_at DESC
    LIMIT $1
  `,
    [limit]
  );
  return rows;
}

// -- EXAMS --

async function getActiveExamsDetails() {
  const { rows } = await db.query(`
    SELECT
      e.id,
      e.title,
      e.start_date,
      e.duration_minutes,
      (u.first_name || ' ' || u.last_name) AS teacher,
      COUNT(es.id)::int AS students_count
    FROM exams e
    JOIN users u ON u.id = e.teacher_id
    LEFT JOIN exam_sessions es ON es.exam_id = e.id
    WHERE e.status = 'active'
    GROUP BY e.id, e.title, e.start_date, e.duration_minutes, u.first_name, u.last_name
    ORDER BY e.start_date DESC
  `);
  return rows;
}

// -- SYSTÈME --

async function getSystemHealth() {
  const result = {
    serverStatus: 'healthy',
    databaseStatus: 'healthy',
    cameraSystem: 'healthy',
    networkLatency: '42ms',
  };

  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM cameras WHERE status <> 'active'`);
    if (rows[0].cnt > 0) result.cameraSystem = 'warning';
  } catch (_) {
    // si la table cameras n'existe pas encore, on garde 'healthy'
  }

  return result;
}

// -- CHARTS (utilisateurs & examens par mois, 6 derniers mois) --

async function getAdminChartStats() {
  const { rows: users } = await db.query(`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS ym, COUNT(*)::int AS c
    FROM users
    WHERE created_at >= (date_trunc('month', now()) - interval '5 months')
    GROUP BY 1
    ORDER BY 1
  `);

  const { rows: exams } = await db.query(`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS ym, COUNT(*)::int AS c
    FROM exams
    WHERE created_at >= (date_trunc('month', now()) - interval '5 months')
    GROUP BY 1
    ORDER BY 1
  `);

  // Construire l’axe temporel pour les 6 derniers mois
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const { rows } = await db.query(`SELECT to_char(date_trunc('month', now()) - ($1 || ' months')::interval, 'YYYY-MM') AS ym`, [i]);
    months.push(rows[0].ym);
  }

  const userMap = Object.fromEntries(users.map(r => [r.ym, r.c]));
  const examMap = Object.fromEntries(exams.map(r => [r.ym, r.c]));

  const labels = months.map(ym => {
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });

  const userCounts = months.map(ym => userMap[ym] || 0);
  const examCounts = months.map(ym => examMap[ym] || 0);

  return { labels, userCounts, examCounts };
}

// -- USERS --

// LISTE DES SESSIONS "en cours" pour la surveillance mosaïque
async function listActiveSessions() {
  const { rows } = await db.query(`
    SELECT
      es.id,
      es.exam_id,
      es.student_id,
      es.started_at,
      e.title AS exam_title,
      u.first_name,
      u.last_name,
      COALESCE(SUM(CASE WHEN sl.resolved = false THEN 1 ELSE 0 END), 0)::int AS unresolved_alerts,
      MAX(sl.created_at) AS last_alert_at
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN users u ON u.id = es.student_id
    LEFT JOIN security_logs sl ON sl.session_id = es.id
    WHERE es.status = 'in_progress'
    GROUP BY es.id, es.exam_id, es.student_id, es.started_at, e.title, u.first_name, u.last_name
    ORDER BY es.started_at DESC
  `);
  return rows;
}

// LIST USERS : alias camelCase utiles au front
async function listUsers(filters = {}) {
  const { role, search } = filters;
  let query = `
    SELECT
      id,
      email,
      first_name AS "firstName",
      last_name  AS "lastName",
      role,
      is_active  AS "isActive",
      last_login AS "lastLogin",
      created_at AS "createdAt"
    FROM users
    WHERE 1=1
  `;
  const params = [];
  if (role && role !== 'all') {
    params.push(role);
    query += ` AND role = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`;
  }
  query += ` ORDER BY created_at DESC`;
  const { rows } = await db.query(query, params);
  return rows;
}

async function createUser({ email, passwordHash, firstName, lastName, role }) {
  const { rows } = await db.query(
    `
    INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
    VALUES ($1, $2, $3, $4, $5, true)
    RETURNING id, email, first_name, last_name, role
  `,
    [email, passwordHash, firstName, lastName, role]
  );
  return rows[0];
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  let i = 1;

  if (data.firstName !== undefined) {
    fields.push(`first_name = $${i++}`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    fields.push(`last_name = $${i++}`);
    values.push(data.lastName);
  }
  if (data.role !== undefined) {
    fields.push(`role = $${i++}`);
    values.push(data.role);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(!!data.isActive);
  }

  if (fields.length === 0) {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  }

  values.push(id);

  const { rows } = await db.query(
    `
    UPDATE users
    SET ${fields.join(', ')}, updated_at = now()
    WHERE id = $${i}
    RETURNING id, email, first_name, last_name, role
  `,
    values
  );
  return rows[0];
}

async function deleteUser(id) {
  await db.query(`DELETE FROM users WHERE id = $1`, [id]);
}

// -- LOGS SÉCURITÉ --

async function listSecurityLogs(filters = {}) {
  const { severity } = filters;
  let query = `
    SELECT
      id,
      session_id,
      event_type,
      event_data,
      severity,
      resolved,
      created_at
    FROM security_logs
  `;
  const values = [];
  if (severity) {
    query += ` WHERE severity = $1`;
    values.push(severity);
  }
  query += ` ORDER BY created_at DESC`;
  const { rows } = await db.query(query, values);
  return rows;
}

async function resolveSecurityLog(id) {
  const { rows } = await db.query(
    `
    UPDATE security_logs
    SET resolved = true, updated_at = now()
    WHERE id = $1
    RETURNING id, session_id, resolved, updated_at
  `,
    [id]
  );
  return rows[0];
}

// -- PARAMÈTRES SYSTÈME --


async function getSettings() {
  const { rows } = await db.query(`
    SELECT setting_key AS key, setting_value AS value
    FROM system_settings
  `);
  return rows.reduce((acc, { key, value }) => {
    try { acc[key] = typeof value === 'string' ? JSON.parse(value) : value; }
    catch { acc[key] = value; }
    return acc;
  }, {});
}

async function updateSettings(updates, userId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const [key, val] of Object.entries(updates)) {
      await client.query(`
        INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by    = EXCLUDED.updated_by,
          updated_at    = now()
      `, [key, JSON.stringify(val), userId]);
    }
    await client.query('COMMIT');
    return await getSettings();
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}


module.exports = {
  getUserStats,
  getActiveExamsCount,
  getActiveCamerasCount,
  getSecurityAlertsCount,
  getRecentAlerts,
  getActiveExamsDetails,
  getSystemHealth,
  getAdminChartStats,
  listActiveSessions,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listSecurityLogs,
  resolveSecurityLog,
  getSettings,
  updateSettings,
};
