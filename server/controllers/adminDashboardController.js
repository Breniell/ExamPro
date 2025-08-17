// server/controllers/adminDashboardController.js
const pool = require('../config/database');
const { getProctorSnapshot } = require('../socket/proctor');

exports.getActiveExamsCount = async (req, res, next) => {
  try {
    const sql = `
      SELECT COUNT(DISTINCT es.exam_id)::int AS count
      FROM exam_sessions es
      WHERE es.status IN ('in_progress','submitted')
    `;
    const { rows } = await pool.query(sql);
    res.json({ count: rows[0]?.count || 0 });
  } catch (e) { next(e); }
};

exports.getActiveExams = async (req, res, next) => {
  try {
    const sql = `
      SELECT
        e.id,
        e.title,
        COUNT(es.id)::int AS active_sessions,
        MIN(es.started_at) AS first_started_at
      FROM exam_sessions es
      JOIN exams e ON e.id = es.exam_id
      WHERE es.status IN ('in_progress','submitted')
      GROUP BY e.id, e.title
      ORDER BY active_sessions DESC
    `;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) { next(e); }
};

exports.getActiveCamerasCount = async (req, res, next) => {
  try {
    const snap = getProctorSnapshot();
    res.json({ count: snap.activeStudents || 0 });
  } catch (e) { next(e); }
};

exports.getSystemHealth = async (req, res, next) => {
  try {
    // DB ping
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const snap = getProctorSnapshot();
    const payload = {
      status: dbOk && snap.ioReady ? 'OK' : 'DEGRADED',
      db: { ok: dbOk },
      sockets: {
        ok: snap.ioReady,
        rooms: (snap.rooms || []).length,
        activeCameras: snap.activeStudents || 0,
      },
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION || 'dev',
    };
    res.json(payload);
  } catch (e) { next(e); }
};
