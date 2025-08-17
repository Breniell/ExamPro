// src/pages/teacher/Reports.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import {
  BarChart3, Download, Users, Trophy, Clock, TrendingUp, Filter, Loader2, Search, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ===================== TYPES ===================== */

type Exam = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'archived';
  start_date?: string;
  sessionscount?: number;
  sessionsCount?: number;
};

type SessionRow = {
  session_id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  first_name: string;
  last_name: string;
  status: 'submitted' | 'graded';
  submitted_at: string | null;
  graded_at: string | null;
  // si graded:
  score_on20?: number | null;
  score_pct?: number | null;
};

type GradingQuestion = { question_id: string; max_points: number; points_awarded: number | null; };
type SessionDetail = { session: { id: string; exam_id: string; exam_title: string }, questions: GradingQuestion[] };

type DateRangeKey = 'week' | 'month' | 'quarter' | 'year' | 'custom';

type Aggregates = {
  avgOn20: number;
  passRate: number;
  gradedCount: number;
  totalMax: number;
  totalAwarded: number;
  perExam: Array<{ examId: string; examTitle: string; gradedCount: number; avgOn20: number; passRate: number }>;
  topStudents: Array<{ name: string; avgOn20: number; examsCount: number }>;
};

/* ===================== HELPERS ===================== */

const fmt = (d?: string | null) => d ? new Date(d).toLocaleString('fr-FR') : '—';
const pct = (v: number) => `${Math.round(v)}%`;

function rangeFor(key: DateRangeKey) {
  const end = new Date(); // maintenant
  const start = new Date();
  if (key === 'week')  start.setDate(end.getDate() - 7);
  if (key === 'month') start.setMonth(end.getMonth() - 1);
  if (key === 'quarter') start.setMonth(end.getMonth() - 3);
  if (key === 'year') start.setFullYear(end.getFullYear() - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

/* ===================== PAGE ===================== */

export default function Reports() {
  const navigate = useNavigate();

  // Filtres
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<'all' | string>('all');
  const [dateKey, setDateKey] = useState<DateRangeKey>('month');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [status, setStatus] = useState<'all' | 'submitted' | 'graded'>('all');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');

  // Données
  const [loading, setLoading] = useState(true);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates>({
    avgOn20: 0, passRate: 0, gradedCount: 0, totalMax: 0, totalAwarded: 0, perExam: [], topStudents: []
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);

  // Charge examens (du prof)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list: Exam[] = await apiService.getExams();
        if (!mounted) return;
        setExams(list);
      } catch (e: any) {
        toast.error(e?.message || 'Impossible de charger les examens.');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Applique la plage de dates
  useEffect(() => {
    if (dateKey === 'custom') return; // piloté par inputs
    const r = rangeFor(dateKey);
    setFrom(r.from);
    setTo(r.to);
  }, [dateKey]);

  // Requête sessions (table) — pas de mock : 100% backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiService.getGradingSessions({
          status: status === 'all' ? undefined : status,
          examId: examId === 'all' ? undefined : examId,
          from,
          to,
          q,
          page,
          pageSize
        });
        if (!mounted) return;
        setSessions(res.items || []);
        setTotal(res.total || 0);
      } catch (e: any) {
        toast.error(e?.message || 'Erreur chargement des copies.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [status, examId, from, to, q, page, pageSize]);

  // Requête agrégats — si l’endpoint existe on l’utilise; sinon fallback réel (sans mock) en calculant à partir des sessions graded
  useEffect(() => {
    let mounted = true;
    (async () => {
      setKpisLoading(true);
      try {
        // 1) On tente l’endpoint d’agrégats (recommandé)
        if (apiService.getReportAggregates) {
          const agg: Aggregates = await apiService.getReportAggregates({
            examId: examId === 'all' ? undefined : examId,
            from, to
          });
          if (mounted) setAggregates(agg);
        } else {
          // 2) Fallback: calculer sur un échantillon graded (pas de mock, on appelle le backend)
          const graded = await apiService.getGradingSessions({
            status: 'graded',
            examId: examId === 'all' ? undefined : examId,
            from, to,
            page: 1,
            pageSize: 50
          });

          // on récupère le détail des 50 premières sessions graded pour sommer les points
          const details: SessionDetail[] = await Promise.all(
            (graded.items || []).map((s: SessionRow) => apiService.getGradingSession(s.session_id))
          );

          let totalAwarded = 0, totalMax = 0;
          const perExamMap = new Map<string, { title: string; totals: number; maxes: number; count: number }>();
          const perStudentMap = new Map<string, { name: string; totals: number; maxes: number; exams: number }>();

          details.forEach((d, i) => {
            const s = graded.items[i];
            const awarded = d.questions.reduce((a, q) => a + (q.points_awarded || 0), 0);
            const max = d.questions.reduce((a, q) => a + (q.max_points || 0), 0);
            totalAwarded += awarded; totalMax += max;

            const ex = perExamMap.get(d.session.exam_id) || { title: d.session.exam_title, totals: 0, maxes: 0, count: 0 };
            ex.totals += awarded; ex.maxes += max; ex.count += 1;
            perExamMap.set(d.session.exam_id, ex);

            const key = `${s.first_name} ${s.last_name}`;
            const st = perStudentMap.get(key) || { name: key, totals: 0, maxes: 0, exams: 0 };
            st.totals += awarded; st.maxes += max; st.exams += 1;
            perStudentMap.set(key, st);
          });

          const perExam = Array.from(perExamMap.entries()).map(([examId, e]) => ({
            examId, examTitle: e.title,
            gradedCount: e.count,
            avgOn20: e.maxes ? (e.totals / e.maxes) * 20 : 0,
            passRate: e.maxes ? Math.round((e.totals / e.maxes) * 100) : 0
          }));

          const topStudents = Array.from(perStudentMap.values())
            .map(s => ({ name: s.name, avgOn20: s.maxes ? (s.totals / s.maxes) * 20 : 0, examsCount: s.exams }))
            .sort((a, b) => b.avgOn20 - a.avgOn20)
            .slice(0, 5);

          if (mounted) {
            setAggregates({
              avgOn20: totalMax ? (totalAwarded / totalMax) * 20 : 0,
              passRate: totalMax ? Math.round((totalAwarded / totalMax) * 100) : 0,
              gradedCount: details.length,
              totalMax, totalAwarded, perExam, topStudents
            });
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'Erreur calcul des statistiques.');
      } finally {
        if (mounted) setKpisLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [examId, from, to]);

  // KPIs d’en-tête supplémentaires
  const kpis = useMemo(() => {
    const totalExams = exams.length;
    const activeExams = exams.filter(e => e.status === 'active').length;
    const totalSessions = exams.reduce((s, e) => s + Number(e.sessionsCount ?? e.sessionscount ?? 0), 0);
    return { totalExams, activeExams, totalSessions };
  }, [exams]);

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // Export
  async function exportReport(format: 'pdf'|'xlsx') {
    try {
      const blob = await apiService.exportReport({
        format,
        examId: examId === 'all' ? undefined : examId,
        from, to,
        status: status === 'all' ? undefined : status,
        q
      });
      const name = `rapport_${format}_${new Date().toISOString().slice(0,19)}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || 'Export impossible.');
    }
  }

  async function exportSessionPDF(sessionId: string) {
    try {
      const blob = await apiService.exportSessionPdf(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `copie_${sessionId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Export de la copie impossible.');
    }
  }

  /* ===================== RENDER ===================== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Rapports & Statistiques</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportReport('pdf')}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
            <Download className="h-4 w-4 mr-2" /> PDF
          </button>
          <button onClick={() => exportReport('xlsx')}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            <Download className="h-4 w-4 mr-2" /> Excel
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Exam */}
          <label className="text-sm text-gray-700">
            Examen
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={examId}
              onChange={e => { setExamId(e.target.value as any); setPage(1); }}
            >
              <option value="all">Tous</option>
              {exams.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </label>

          {/* Statut */}
          <label className="text-sm text-gray-700">
            Statut copie
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={status}
              onChange={e => { setStatus(e.target.value as any); setPage(1); }}
            >
              <option value="all">Tous</option>
              <option value="submitted">Soumises (à corriger)</option>
              <option value="graded">Corrigées</option>
            </select>
          </label>

          {/* Date range */}
          <label className="text-sm text-gray-700">
            Période
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={dateKey}
              onChange={e => setDateKey(e.target.value as DateRangeKey)}
            >
              <option value="week">Semaine</option>
              <option value="month">Mois</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Année</option>
              <option value="custom">Personnalisée</option>
            </select>
          </label>

          {/* Custom dates */}
          <label className={classNames("text-sm text-gray-700", dateKey !== 'custom' && 'opacity-50 pointer-events-none')}>
            Du
            <input type="datetime-local"
                   className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                   value={from ? new Date(from).toISOString().slice(0,16) : ''}
                   onChange={e => setFrom(new Date(e.target.value).toISOString())} />
          </label>
          <label className={classNames("text-sm text-gray-700", dateKey !== 'custom' && 'opacity-50 pointer-events-none')}>
            Au
            <input type="datetime-local"
                   className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                   value={to ? new Date(to).toISOString().slice(0,16) : ''}
                   onChange={e => setTo(new Date(e.target.value).toISOString())} />
          </label>
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              placeholder="Rechercher un étudiant (nom, prénom) ou un examen…"
              className="w-full pl-9 pr-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              value={qDraft}
              onChange={e => setQDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setQ(qDraft.trim()); setPage(1); } }}
            />
          </div>
          <button
            onClick={() => { setQ(qDraft.trim()); setPage(1); }}
            className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Filtrer
          </button>
          <button
            onClick={() => { setQ(''); setQDraft(''); setPage(1); }}
            className="px-3 py-2 bg-gray-100 rounded-md"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* KPI Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPI icon={<BarChart3 className="h-8 w-8 text-blue-600" />} label="Total Examens" value={kpis.totalExams} color="border-blue-500" loading={kpisLoading} />
        <KPI icon={<Clock className="h-8 w-8 text-green-600" />} label="Examens Actifs" value={kpis.activeExams} color="border-green-500" loading={kpisLoading} />
        <KPI icon={<Users className="h-8 w-8 text-orange-600" />} label="Copies corrigées" value={aggregates.gradedCount} color="border-orange-500" loading={kpisLoading} />
        <KPI icon={<TrendingUp className="h-8 w-8 text-purple-600" />} label="Score moyen" value={`${aggregates.avgOn20.toFixed(1)}/20`} color="border-purple-500" loading={kpisLoading} />
      </div>

      {/* Résultats par examen + Top étudiants */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Résultats par Examen" icon={<BarChart3 className="h-5 w-5 text-indigo-600" />}>
          {!aggregates.perExam.length ? (
            <Empty text="Pas encore de copies corrigées sur la période." />
          ) : (
            <div className="space-y-4">
              {aggregates.perExam.map(r => (
                <div key={r.examId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{r.examTitle}</div>
                    <div className="text-sm text-gray-500">{r.gradedCount} corrigée(s)</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div><div className="text-gray-600">Moyenne</div><div className="font-semibold">{r.avgOn20.toFixed(1)}/20</div></div>
                    <div><div className="text-gray-600">Réussite</div><div className="font-semibold">{pct(r.passRate)}</div></div>
                    <div><div className="text-gray-600">Indice</div><div className="font-semibold">{Math.round(r.avgOn20 * 5)}</div></div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${(r.avgOn20 / 20) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Meilleurs Étudiants" icon={<Trophy className="h-5 w-5 text-yellow-600" />}>
          {!aggregates.topStudents.length ? (
            <Empty text="Pas de classement sur la période." />
          ) : (
            <div className="space-y-3">
              {aggregates.topStudents.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={classNames(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm",
                      i === 0 && "bg-yellow-500", i === 1 && "bg-gray-400", i === 2 && "bg-orange-600", i > 2 && "bg-gray-300"
                    )}>{i + 1}</div>
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-sm text-gray-600">{s.examsCount} examen(s)</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{s.avgOn20.toFixed(1)}/20</div>
                    <div className="text-sm text-gray-600">{pct((s.avgOn20 / 20) * 100)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Tableau des sessions */}
      <Card title="Copies (sessions candidats)" right={
        <div className="text-sm text-gray-600">
          {total} résultat(s) • Page {page}/{totalPages}
        </div>
      }>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-gray-600">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Étudiant</Th>
                    <Th>Examen</Th>
                    <Th>Soumise</Th>
                    <Th>Corrigée</Th>
                    <Th>Note</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sessions.map(s => (
                    <tr key={s.session_id} className="hover:bg-gray-50">
                      <Td>
                        <div className="font-medium text-gray-900">
                          {s.first_name} {s.last_name}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-gray-900">{s.exam_title}</div>
                      </Td>
                      <Td className="text-gray-700">{fmt(s.submitted_at)}</Td>
                      <Td className="text-gray-700">{fmt(s.graded_at)}</Td>
                      <Td>
                        {s.status === 'graded'
                          ? <div className="font-semibold text-gray-900">{(s.score_on20 ?? 0).toFixed(1)}/20</div>
                          : <span className="text-gray-500">—</span>}
                      </Td>
                      <Td className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            className="inline-flex items-center px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
                            onClick={() => navigate(`/teacher/correction/${s.exam_id}?session=${s.session_id}`)}
                            title="Voir la copie"
                          >
                            <Eye className="h-4 w-4 mr-1" /> Ouvrir
                          </button>
                          <button
                            className="inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
                            onClick={() => exportSessionPDF(s.session_id)}
                            title="Exporter la copie (PDF)"
                          >
                            <Download className="h-4 w-4 mr-1" /> Copie PDF
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                  {!sessions.length && (
                    <tr><Td colSpan={6}><Empty text="Aucune copie ne correspond à vos filtres." /></Td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!canPrev}
                className={classNames(
                  "inline-flex items-center px-3 py-1.5 rounded-md border text-sm",
                  !canPrev && "opacity-50 cursor-not-allowed",
                  canPrev && "hover:bg-gray-50"
                )}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
              </button>
              <div className="text-sm text-gray-600">Page {page} / {totalPages}</div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={!canNext}
                className={classNames(
                  "inline-flex items-center px-3 py-1.5 rounded-md border text-sm",
                  !canNext && "opacity-50 cursor-not-allowed",
                  canNext && "hover:bg-gray-50"
                )}
              >
                Suivant <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ===================== UI SUBCOMPONENTS ===================== */

function Card({ title, icon, right, children }:{
  title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {icon} <span>{title}</span>
        </h2>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function KPI({ icon, label, value, color, loading }:{
  icon: React.ReactNode; label: string; value: React.ReactNode; color: string; loading?: boolean;
}) {
  return (
    <div className={classNames("bg-white p-6 rounded-lg shadow border-l-4", color)}>
      <div className="flex items-center">
        {icon}
        <div className="ml-4">
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? <span className="inline-flex items-center text-gray-500"><Loader2 className="h-5 w-5 mr-2 animate-spin" /> …</span> : value}
          </p>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className='' }:{ children: React.ReactNode; className?: string }) {
  return <th className={classNames("px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", className)}>{children}</th>;
}
function Td({ children, className='', colSpan }:{ children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={classNames("px-6 py-4 whitespace-nowrap", className)} colSpan={colSpan}>{children}</td>;
}

function Empty({ text }:{ text: string }) {
  return (
    <div className="py-10 text-center text-gray-500">{text}</div>
  );
}
