// src/pages/student/Dashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { BookOpen, Clock, CheckCircle, Calendar, Trophy } from 'lucide-react';

type StudentExam = {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
  status: 'draft'|'published'|'active'|'completed'|'archived';
  teacherFirst?: string;
  teacherLast?: string;
};
type RecentResult = {
  session_id: string;
  exam_id: string;
  exam_title: string;
  graded_at?: string | null;
  score_on20?: number | null;
  score_pct?: number | null;
  max_points?: number | null;
  points_awarded?: number | null;
};

export default function StudentDashboard() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<StudentExam[]>([]);
  const [upcoming, setUpcoming]   = useState<StudentExam[]>([]);
  const [recent, setRecent] = useState<RecentResult[]>([]);
  const [avg, setAvg] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [av, up] = await Promise.all([
          apiService.getExams({ scope: 'available' }),
          apiService.getExams({ scope: 'upcoming' }),
        ]);
        setAvailable(Array.isArray(av) ? av : []);
        setUpcoming(Array.isArray(up) ? up : []);

        // Résultats récents (optionnel)
        try {
          const res = await apiService.getStudentGrades?.();
          if (Array.isArray(res?.recent)) setRecent(res.recent.slice(0, 5));
          if (typeof res?.average_on20 === 'number') setAvg(res.average_on20);
        } catch {}
      } catch (e) {
        console.error(e);
        toast.error('Impossible de charger le tableau de bord.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = {
    total: available.length + upcoming.length,
    upcoming: upcoming.length,
    avgOn20: avg ?? null,
    completed: recent.length,
  };

  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center text-gray-600">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Étudiant</h1>
        <div className="flex items-center space-x-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Compte vérifié</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Stat icon={<BookOpen className="h-8 w-8 text-blue-600" />} color="border-blue-500"
              title="Examens listés" value={stats.total} />
        <Stat icon={<Trophy className="h-8 w-8 text-green-600" />} color="border-green-500"
              title="Moyenne" value={stats.avgOn20 !== null ? `${stats.avgOn20.toFixed(1)}/20` : '—'} />
        <Stat icon={<CheckCircle className="h-8 w-8 text-purple-600" />} color="border-purple-500"
              title="Résultats récents" value={stats.completed} />
        <Stat icon={<Clock className="h-8 w-8 text-orange-600" />} color="border-orange-500"
              title="À venir" value={stats.upcoming} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disponibles maintenant */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Disponibles maintenant</h2>
          </div>
          <div className="p-6 space-y-4">
            {available.length === 0 && <div className="text-gray-500">Aucun examen ouvert.</div>}
            {available.map(e => (
              <div key={e.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{e.title}</h3>
                    <div className="text-sm text-gray-600">
                      Ouvert jusqu’au {new Date(e.end_date).toLocaleString('fr-FR')} • {e.duration_minutes} min
                    </div>
                  </div>
                  <Link to={`/student/exam/${e.id}`}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
                    Commencer
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* À venir */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-indigo-600" />
              Examens à venir
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {upcoming.length === 0 && <div className="text-gray-500">Rien à l’horizon.</div>}
            {upcoming.map(e => (
              <div key={e.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{e.title}</h3>
                    <div className="text-sm text-gray-600">
                      {new Date(e.start_date).toLocaleString('fr-FR')} • {e.duration_minutes} min
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                    Bientôt
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent results */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-green-600" />
              Résultats récents
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {recent.length === 0 && (
              <div className="text-gray-500">
                Aucune note récente. Passe un examen ou consulte <Link to="/student/history" className="text-indigo-600">ton historique</Link>.
              </div>
            )}
            {recent.map(r => (
              <div key={r.session_id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{r.exam_title}</div>
                    <div className="text-sm text-gray-600">
                      {r.graded_at ? new Date(r.graded_at).toLocaleString('fr-FR') : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {typeof r.score_on20 === 'number' ? r.score_on20.toFixed(1) : '—'}/20
                    </div>
                    <div className="text-sm text-gray-600">
                      {typeof r.score_pct === 'number' ? `${Math.round(r.score_pct)}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Link to="/student/history" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
                Voir tous les résultats →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, color, title, value }:{
  icon: React.ReactNode; color: string; title: string; value: React.ReactNode;
}) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow border-l-4 ${color}`}>
      <div className="flex items-center">
        <div>{icon}</div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
