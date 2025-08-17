// services/reportsService.js
const pool = require('../config/database');
const { PassThrough } = require('stream');

// Lazy-loaders pour éviter crash si les deps ne sont pas installées
let _PDFDocument = null;
function getPDFDocumentCtor() {
  if (_PDFDocument) return _PDFDocument;
  try {
    _PDFDocument = require('pdfkit');
    return _PDFDocument;
  } catch {
    const e = new Error('PDF export requires "pdfkit". Installez-la: npm i pdfkit');
    e.status = 500;
    throw e;
  }
}

let _ExcelJS = null;
function getExcelJS() {
  if (_ExcelJS) return _ExcelJS;
  try {
    _ExcelJS = require('exceljs');
    return _ExcelJS;
  } catch {
    const e = new Error('XLSX export requires "exceljs". Installez-la: npm i exceljs');
    e.status = 500;
    throw e;
  }
}

function buildWhere(teacherId, { examId, status, from, to, q }) {
  const wh = ['e.teacher_id = $1'];
  const params = [teacherId];

  if (examId) {
    params.push(examId);
    wh.push(`es.exam_id = $${params.length}`);
  }

  // filtre statut (on n’utilise pas es.graded_at côté table sessions)
  if (status === 'submitted') {
    wh.push(`es.status = 'submitted'`);
  } else if (status === 'graded') {
    wh.push(`es.status = 'graded'`);
  }

  // bornes sur la date de soumission (fallback raisonnable)
  if (from) {
    params.push(from);
    wh.push(`(es.submitted_at IS NULL OR es.submitted_at >= $${params.length})`);
  }
  if (to) {
    params.push(to);
    wh.push(`(es.submitted_at IS NULL OR es.submitted_at <= $${params.length})`);
  }

  if (q) {
    params.push(`%${q}%`);
    params.push(`%${q}%`);
    wh.push(
      `((u.first_name || ' ' || u.last_name) ILIKE $${params.length - 1} OR e.title ILIKE $${params.length})`
    );
  }

  return { whereSql: wh.length ? `WHERE ${wh.join(' AND ')}` : '', params };
}

/** Liste paginée des sessions (copies) */
async function listSessions({ teacherId, examId, status, from, to, q, page = 1, pageSize = 15 }) {
  const { whereSql, params } = buildWhere(teacherId, { examId, status, from, to, q });

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN users u ON u.id = es.student_id
    ${whereSql}
  `;
  const { rows: countRows } = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;

  const offset = (page - 1) * pageSize;

  // gsum: somme des points ; gmax: dernière date de notation (remplace es.graded_at)
  const dataSql = `
    WITH gsum AS (
      SELECT session_id, SUM(points_awarded)::float AS awarded, SUM(max_points)::float AS max
      FROM grades
      GROUP BY session_id
    ),
    gmax AS (
      SELECT session_id, MAX(graded_at) AS graded_at
      FROM grades
      GROUP BY session_id
    )
    SELECT
      es.id AS session_id, es.exam_id, e.title AS exam_title,
      u.id AS student_id, u.first_name, u.last_name,
      es.status, es.submitted_at,
      gmax.graded_at,
      ROUND(((gs.awarded / NULLIF(gs.max,0)) * 20.0)::numeric, 1) AS score_on20,
      ((gs.awarded / NULLIF(gs.max,0)) * 100.0)::numeric AS score_pct
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN users u ON u.id = es.student_id
    LEFT JOIN gsum gs   ON gs.session_id  = es.id
    LEFT JOIN gmax      ON gmax.session_id = es.id
    ${whereSql}
    ORDER BY es.submitted_at DESC NULLS LAST, es.id DESC
    OFFSET $${params.length + 1} LIMIT $${params.length + 2}
  `;

  const { rows } = await pool.query(dataSql, [...params, offset, pageSize]);
  return { items: rows, total };
}

/** Détail d’une session + questions/notes, avec contrôle ownership */
async function getSessionDetail(sessionId, teacherId) {
  const ownSql = `
    SELECT es.id, es.exam_id, e.title AS exam_title
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    WHERE es.id = $1 AND e.teacher_id = $2
  `;
  const own = await pool.query(ownSql, [sessionId, teacherId]);
  if (!own.rows.length) throw { status: 404, message: 'Session not found or access denied' };

  const qSql = `
    SELECT q.id AS question_id, q.question_text, q.points AS max_points,
           a.answer_text, a.selected_option,
           g.points_awarded, g.feedback
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.session_id = $1
    LEFT JOIN grades  g ON g.question_id = q.id AND g.session_id = $1
    WHERE q.exam_id = $2
    ORDER BY q.order_index
  `;
  const q = await pool.query(qSql, [sessionId, own.rows[0].exam_id]);

  return { session: own.rows[0], questions: q.rows };
}

/** Agrégats globaux / per-exam / top-5 students */
async function getAggregates({ teacherId, examId, from, to }) {
  // On se base sur la présence de notes (grades) + dernière date de notation
  const where = [`e.teacher_id = $1`, `(es.status = 'graded' OR g.graded_at IS NOT NULL)`];
  const params = [teacherId];

  if (examId) { params.push(examId); where.push(`es.exam_id = $${params.length}`); }
  if (from)   { params.push(from);   where.push(`g.graded_at >= $${params.length}`); }
  if (to)     { params.push(to);     where.push(`g.graded_at <= $${params.length}`); }

  const baseJoin = `
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN (
      SELECT session_id,
             SUM(points_awarded)::float AS awarded,
             SUM(max_points)::float     AS max,
             MAX(graded_at)             AS graded_at
      FROM grades
      GROUP BY session_id
    ) g ON g.session_id = es.id
  `;
  const whereSql = `WHERE ${where.join(' AND ')}`;

  // Global
  const globalSql = `
    SELECT
      COALESCE(SUM(g.awarded),0) AS total_awarded,
      COALESCE(SUM(g.max),0)     AS total_max,
      COUNT(*)::int              AS graded_count
    ${baseJoin}
    ${whereSql}
  `;
  const g1 = await pool.query(globalSql, params);
  const totalAwarded = Number(g1.rows[0].total_awarded || 0);
  const totalMax     = Number(g1.rows[0].total_max || 0);
  const gradedCount  = Number(g1.rows[0].graded_count || 0);
  const avgOn20      = totalMax ? (totalAwarded / totalMax) * 20.0 : 0;

  // Pass rate (>= 50%)
  const passSql = `
    SELECT COUNT(*)::int AS pass
    ${baseJoin}
    ${whereSql} AND (g.awarded / NULLIF(g.max,0)) >= 0.5
  `;
  const p1 = await pool.query(passSql, params);
  const passRate = gradedCount ? Math.round((Number(p1.rows[0].pass || 0) / gradedCount) * 100) : 0;

  // Par examen
  const perExamSql = `
    SELECT
      e.id AS exam_id, e.title AS exam_title,
      COUNT(*)::int AS graded_count,
      (SUM(g.awarded)::float / NULLIF(SUM(g.max)::float,0)) * 20.0 AS avg_on20,
      ROUND(
        (100.0 * SUM(CASE WHEN (g.awarded / NULLIF(g.max,0)) >= 0.5 THEN 1 ELSE 0 END))::numeric
        / NULLIF(COUNT(*),0)
      ) AS pass_rate
    ${baseJoin}
    ${whereSql}
    GROUP BY e.id, e.title
    ORDER BY graded_count DESC
  `;
  const perExamRows = (await pool.query(perExamSql, params)).rows.map(r => ({
    examId: r.exam_id,
    examTitle: r.exam_title,
    gradedCount: Number(r.graded_count),
    avgOn20: Number(r.avg_on20 || 0),
    passRate: Number(r.pass_rate || 0),
  }));

  // Top étudiants
  const topSql = `
    SELECT
      (u.first_name || ' ' || u.last_name) AS name,
      (SUM(g.awarded)::float / NULLIF(SUM(g.max)::float,0)) * 20.0 AS avg_on20,
      COUNT(*)::int AS exams_count
    ${baseJoin}
    JOIN users u ON u.id = es.student_id
    ${whereSql}
    GROUP BY name
    HAVING COUNT(*) > 0
    ORDER BY avg_on20 DESC NULLS LAST
    LIMIT 5
  `;
  const topRows = (await pool.query(topSql, params)).rows.map(r => ({
    name: r.name,
    avgOn20: Number(r.avg_on20 || 0),
    examsCount: Number(r.exams_count || 0),
  }));

  return {
    avgOn20,
    passRate,
    gradedCount,
    totalMax,
    totalAwarded,
    perExam: perExamRows,
    topStudents: topRows,
  };
}

/** Export global (PDF ou XLSX) */
async function exportReport({ teacherId, format, examId, from, to, status, q }) {
  const all = await listSessions({
    teacherId, examId, status, from, to, q, page: 1, pageSize: 10000
  });

  if (format === 'xlsx') {
    const ExcelJS = getExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rapport');
    ws.columns = [
      { header: 'Session', key: 'session_id', width: 24 },
      { header: 'Examen', key: 'exam_title', width: 32 },
      { header: 'Étudiant', key: 'student', width: 28 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Soumise', key: 'submitted_at', width: 22 },
      { header: 'Corrigée', key: 'graded_at', width: 22 },
      { header: 'Note (/20)', key: 'score_on20', width: 12 },
      { header: 'Score (%)', key: 'score_pct', width: 12 },
    ];
    all.items.forEach(r => {
      ws.addRow({
        session_id: r.session_id,
        exam_title: r.exam_title,
        student: `${r.first_name} ${r.last_name}`,
        status: r.status,
        submitted_at: r.submitted_at,
        graded_at: r.graded_at,
        score_on20: r.score_on20 ?? '',
        score_pct: r.score_pct != null ? Math.round(Number(r.score_pct)) : '',
      });
    });

    const stream = new PassThrough();
    wb.xlsx.write(stream)
      .then(() => stream.end())
      .catch(err => stream.emit('error', err));

    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    return {
      stream,
      filename: `rapport-${stamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // PDF
  const PDFDocument = getPDFDocumentCtor();
  const doc = new PDFDocument({ margin: 40 });
  const stream = new PassThrough();
  doc.pipe(stream);

  doc.fontSize(18).text('Rapport des sessions', { underline: true });
  doc.moveDown();
  if (examId) doc.fontSize(10).text(`Examen filtré: ${examId}`);
  if (from || to) doc.fontSize(10).text(`Période: ${from || '—'} -> ${to || '—'}`);
  if (status) doc.fontSize(10).text(`Statut: ${status}`);
  if (q) doc.fontSize(10).text(`Recherche: ${q}`);
  doc.moveDown();

  doc.fontSize(12).text(`Total: ${all.total} sessions`);
  doc.moveDown(0.5);

  // Grid simple
  const w = { session: 120, exam: 150, student: 140, note: 50, sub: 120, grad: 120 };
  const startX = doc.x;

  const drawRow = (r, isHeader = false) => {
    const y = doc.y;
    doc.fontSize(isHeader ? 10 : 9);
    const cells = isHeader
      ? ['Session','Examen','Étudiant','Note','Soumise','Corrigée']
      : [
          r.session_id,
          r.exam_title,
          `${r.first_name} ${r.last_name}`,
          r.status === 'graded' ? `${Number(r.score_on20 ?? 0).toFixed(1)}` : '—',
          r.submitted_at || '—',
          r.graded_at || '—'
        ];
    let x = startX;
    const widths = [w.session, w.exam, w.student, w.note, w.sub, w.grad];
    cells.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: widths[i], ellipsis: true });
      x += widths[i] + 6;
    });
    doc.moveDown(isHeader ? 0.2 : 0.1);
  };

  drawRow(null, true);
  doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke();
  all.items.forEach(r => drawRow(r));
  doc.end();

  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  return { stream, filename: `rapport-${stamp}.pdf`, contentType: 'application/pdf' };
}

/** Export PDF d’une session */
async function exportSessionPdf({ teacherId, sessionId }) {
  const d = await getSessionDetail(sessionId, teacherId);
  const PDFDocument = getPDFDocumentCtor();
  const doc = new PDFDocument({ margin: 40 });
  const stream = new PassThrough();
  doc.pipe(stream);

  doc.fontSize(18).text(`Copie #${sessionId}`, { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Examen : ${d.session.exam_title}`);
  doc.moveDown();

  d.questions.forEach((q, i) => {
    doc.fontSize(12).text(`Q${i+1}. (${q.max_points} pts) ${q.question_text}`);
    if (q.answer_text) {
      doc.fontSize(10).text(`Réponse (texte): ${q.answer_text}`);
    }
    if (q.selected_option) {
      doc.fontSize(10).text(`Réponse (option): ${q.selected_option}`);
    }
    if (q.points_awarded != null) {
      doc.fontSize(10).text(`Points attribués: ${q.points_awarded}${q.feedback ? ` — ${q.feedback}` : ''}`);
    }
    doc.moveDown(0.8);
  });

  doc.end();
  const filename = `copie-${sessionId}.pdf`;
  return { stream, filename };
}

module.exports = {
  listSessions,
  getSessionDetail,
  getAggregates,
  exportReport,
  exportSessionPdf,
};
