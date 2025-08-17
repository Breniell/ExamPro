// src/pages/student/Exams.tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { Calendar, Clock } from 'lucide-react';

type StudentExam = {
  id: string; title: string; start_date: string; end_date: string;
  duration_minutes: number; status: 'draft'|'published'|'active'|'completed'|'archived';
  teacherFirst?: string; teacherLast?: string;
};

export default function StudentExams() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<StudentExam[]>([]);
  const [upcoming, setUpcoming]   = useState<StudentExam[]>([]);

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
      } catch (e) {
        console.error(e);
        toast.error('Impossible de charger les examens.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="min-h-[40vh] grid place-items-center text-gray-600">Chargement…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mes examens</h1>

      {/* Disponibles */}
      <div className="bg-white rounded-lg shadow divide-y">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Disponibles maintenant</h2>
        </div>
        {available.length === 0 && <div className="p-6 text-gray-500">Aucun examen ouvert.</div>}
        {available.map(e => (
          <div key={e.id} className="p-6 flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{e.title}</div>
              <div className="text-sm text-gray-600 flex items-center gap-4 mt-1">
                <span className="inline-flex items-center"><Clock className="h-4 w-4 mr-1 text-gray-500" />{e.duration_minutes} min</span>
                <span className="inline-flex items-center">Jusqu’au {new Date(e.end_date).toLocaleString('fr-FR')}</span>
                {e.teacherFirst && <span className="text-gray-500">— {e.teacherFirst} {e.teacherLast}</span>}
              </div>
            </div>
            <Link to={`/student/exam/${e.id}`} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
              Commencer
            </Link>
          </div>
        ))}
      </div>

      {/* À venir */}
      <div className="bg-white rounded-lg shadow divide-y">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-indigo-600" /> À venir
          </h2>
        </div>
        {upcoming.length === 0 && <div className="p-6 text-gray-500">Rien à l’horizon.</div>}
        {upcoming.map(e => (
          <div key={e.id} className="p-6 flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{e.title}</div>
              <div className="text-sm text-gray-600 flex items-center gap-4 mt-1">
                <span className="inline-flex items-center"><Calendar className="h-4 w-4 mr-1 text-gray-500" />{new Date(e.start_date).toLocaleString('fr-FR')}</span>
                <span className="inline-flex items-center"><Clock className="h-4 w-4 mr-1 text-gray-500" />{e.duration_minutes} min</span>
              </div>
            </div>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">Bientôt</span>
          </div>
        ))}
      </div>
    </div>
  );
}
