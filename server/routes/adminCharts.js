// server/routes/adminCharts.js
const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// Retourne des séries mensuelles (6 derniers mois) pour users & exams.
// Si la requête SQL échoue, renvoie des tableaux vides (pas d'erreur 500).
router.get('/overview', async (req, res) => {
  try {
    const months = 6;
    const now = new Date();
    const labels = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      labels.push(d.toISOString().slice(0, 7)); // "YYYY-MM"
    }

    const usersQ = await pool.query(`
      SELECT to_char(created_at, 'YYYY-MM') AS m, COUNT(*)::int AS c
      FROM users
      GROUP BY 1
    `);

    const examsQ = await pool.query(`
      SELECT to_char(created_at, 'YYYY-MM') AS m, COUNT(*)::int AS c
      FROM exams
      GROUP BY 1
    `);

    const toMap = (rows) => Object.fromEntries(rows.map(r => [r.m, Number(r.c || 0)]));
    const um = toMap(usersQ.rows || []);
    const em = toMap(examsQ.rows || []);

    const userCounts = labels.map(m => um[m] || 0);
    const examCounts = labels.map(m => em[m] || 0);

    res.json({ labels, userCounts, examCounts });
  } catch (e) {
    res.json({ labels: [], userCounts: [], examCounts: [] });
  }
});

module.exports = router;
