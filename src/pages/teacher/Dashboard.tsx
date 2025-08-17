import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { BookOpen, FileText, TrendingUp, Plus } from 'lucide-react';

type TeacherExam = {
  id: string;
  title: string;
  start_date: string;            // ISO string
  duration_minutes: number;
  status: 'draft'|'published'|'active'|'completed'|'archived';
  sessionsCount?: number | string;
  sessionscount?: number | string; // selon le casing Postgres
};

export default function TeacherDashboard() {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<TeacherExam[]>([]);
  const [toGrade, setToGrade] = useState<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [myExams, sessionsToGrade] = await Promise.all([
          apiService.getExams(),
          apiService.getGradingSessions({ status: 'submitted' }) // copies “soumis”
        ]);
        setExams(myExams || []);
        setToGrade(Array.isArray(sessionsToGrade) ? sessionsToGrade.length : 0);
      } catch (e) {
        console.error(e);
        toast.error('Impossible de charger le tableau de bord.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (exams || [])
      .filter(e => {
        const t = new Date(e.start_date).getTime();
        return Number.isFinite(t) && t >= now && ['draft','published','active'].includes(e.status);
      })
      .sort((a,b) => +new Date(a.start_date) - +new Date(b.start_date))
      .slice(0, 5);
  }, [exams]);

  const totalSessions = useMemo(
    () => (exams || []).reduce((sum, e) => {
      const v = Number(e.sessionsCount ?? e.sessionscount ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0),
    [exams]
  );

  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center text-gray-600">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Enseignant</h1>
        <button
          onClick={() => navigate('/teacher/exams')}
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" /> Nouvel examen
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<BookOpen className="h-7 w-7" />} title="Mes examens" value={exams.length} />

        <StatCard
          icon={<FileText className="h-7 w-7" />}
          title="Copies à corriger"
          value={toGrade}
          onClick={toGrade > 0 ? () => navigate('/teacher/correction') : undefined} // ✅ bonne route
          cta="Corriger"
        />

        <StatCard icon={<TrendingUp className="h-7 w-7" />} title="Sessions totales" value={totalSessions} />
      </div>

      {/* Prochains examens */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">À venir</h2>
        </div>
        <div className="divide-y">
          {upcoming.length === 0 ? (
            <div className="p-6 text-gray-500">Aucun examen planifié prochainement.</div>
          ) : (
            upcoming.map(e => (
              <div key={e.id} className="p-6 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{e.title}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(e.start_date).toLocaleString('fr-FR')} • {e.duration_minutes} min
                  </div>
                </div>
                <StatusPill status={e.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, title, value, onClick, cta
}: { icon: React.ReactNode; title: string; value: number|string; onClick?: () => void; cta?: string; }) {
  const clickable = typeof onClick === 'function';
  return (
    <div className="bg-white p-6 rounded-lg shadow flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 grid place-items-center rounded-full bg-indigo-50 text-indigo-600">
          {icon}
        </div>
        <div>
          <div className="text-sm text-gray-600">{title}</div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={!clickable}
        className={`text-sm ${clickable ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-300 cursor-not-allowed'}`}
      >
        {cta ?? 'Ouvrir'}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: TeacherExam['status'] }) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    published: 'bg-blue-100 text-blue-800',
    active: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-indigo-100 text-indigo-800',
    archived: 'bg-rose-100 text-rose-800',
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100'}`}>{status}</span>;
}
