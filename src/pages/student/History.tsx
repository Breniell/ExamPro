// src/pages/student/History.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Trophy, Clock, Download, Eye, Filter } from 'lucide-react';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';

type HistoryItem = {
  session_id: string;
  exam_id: string;
  title: string;
  date: string;            // ISO
  duration: number;        // minutes
  score: number | null;    // sur 20
  score_pct?: number | null;
  maxScore: number;        // sur 20
  status: 'corrected'|'pending';
  teacher?: string | null;
  feedback?: string | null;
};

export default function StudentHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all'|'corrected'|'pending'>('all');
  const [sortBy, setSortBy] = useState<'date'|'score'|'title'>('date');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // tentative: API réelle
        const res = await apiService.getStudentGrades?.();
        if (Array.isArray(res?.history)) {
          setItems(res.history.map((r: any) => ({
            session_id: r.session_id,
            exam_id: r.exam_id,
            title: r.exam_title,
            date: r.graded_at || r.submitted_at || r.created_at,
            duration: r.duration_minutes ?? 0,
            score: typeof r.score_on20 === 'number' ? r.score_on20 : (typeof r.score === 'number' ? r.score : null),
            score_pct: typeof r.score_pct === 'number' ? r.score_pct : null,
            maxScore: 20,
            status: r.status === 'graded' ? 'corrected' : 'pending',
            teacher: r.teacher_name ?? null,
            feedback: r.feedback ?? null
          })));
        } else {
          // fallback: demoes
          setItems([
            { session_id:'1', exam_id:'1', title:'Physique - Optique', date:'2024-01-10', duration:90, score:16, score_pct:80, maxScore:20, status:'corrected', teacher:'Dr. Martin', feedback:'Très bonne compréhension des concepts.' },
            { session_id:'2', exam_id:'2', title:'Littérature française', date:'2024-01-08', duration:120, score:14, score_pct:70, maxScore:20, status:'corrected', teacher:'Mme Dubois', feedback:'Analyse pertinente mais manque de références.' },
            { session_id:'3', exam_id:'3', title:'Chimie - Réactions', date:'2024-01-01', duration:80, score:null, score_pct:null, maxScore:20, status:'pending', teacher:'Dr Moreau', feedback:null },
          ]);
        }
      } catch (e) {
        console.error(e);
        toast.error("Impossible de charger l'historique (données de démonstration utilisées).");
        setItems([
          { session_id:'1', exam_id:'1', title:'Physique - Optique', date:'2024-01-10', duration:90, score:16, score_pct:80, maxScore:20, status:'corrected', teacher:'Dr. Martin', feedback:'Très bonne compréhension des concepts.' },
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = items.filter(i => filterStatus === 'all' ? true : i.status === filterStatus);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === 'date') arr.sort((a,b) => +new Date(b.date) - +new Date(a.date));
    if (sortBy === 'score') arr.sort((a,b) => (b.score ?? -1) - (a.score ?? -1));
    if (sortBy === 'title') arr.sort((a,b) => a.title.localeCompare(b.title));
    return arr;
  }, [filtered, sortBy]);

  const stats = {
    total: items.length,
    corrected: items.filter(i => i.status === 'corrected').length,
    average: (() => {
      const graded = items.filter(i => typeof i.score === 'number') as Required<Pick<HistoryItem,'score'>>[];
      if (!graded.length) return 0;
      return (graded.reduce((s, i) => s + (i.score || 0), 0) / graded.length);
    })(),
    best: Math.max(0, ...items.filter(i => typeof i.score === 'number').map(i => i.score || 0))
  };

  if (loading) return <div className="min-h-[30vh] grid place-items-center text-gray-600">Chargement…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Historique des Examens</h1>
        <button className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          <Download className="h-4 w-4 mr-2" />
          Exporter PDF
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Stat icon={<Calendar className="h-8 w-8 text-blue-600" />} title="Total Examens" value={stats.total} color="border-blue-500" />
        <Stat icon={<Trophy className="h-8 w-8 text-green-600" />} title="Moyenne" value={`${stats.average.toFixed(1)}/20`} color="border-green-500" />
        <Stat icon={<Trophy className="h-8 w-8 text-purple-600" />} title="Meilleure Note" value={`${stats.best}/20`} color="border-purple-500" />
        <Stat icon={<Clock className="h-8 w-8 text-orange-600" />} title="Corrigés" value={stats.corrected} color="border-orange-500" />
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-lg shadow flex items-center gap-4">
        <Filter className="h-5 w-5 text-gray-600" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="all">Tous les statuts</option>
          <option value="corrected">Corrigés</option>
          <option value="pending">En attente</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="date">Trier par date</option>
          <option value="score">Trier par note</option>
          <option value="title">Trier par titre</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Examens passés</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Examen</Th><Th>Date</Th><Th>Durée</Th><Th>Note</Th><Th>Statut</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sorted.map(i => (
                <tr key={i.session_id} className="hover:bg-gray-50">
                  <Td>
                    <div className="text-sm font-medium text-gray-900">{i.title}</div>
                    {i.teacher && <div className="text-sm text-gray-500">Prof. {i.teacher}</div>}
                  </Td>
                  <Td className="text-sm text-gray-900">{new Date(i.date).toLocaleDateString('fr-FR')}</Td>
                  <Td className="text-sm text-gray-900">{i.duration} min</Td>
                  <Td>
                    {typeof i.score === 'number'
                      ? <div>
                          <div className={`text-lg font-bold ${scoreColor(i.score, i.maxScore)}`}>{i.score}/{i.maxScore}</div>
                          <div className="text-sm text-gray-500">{Math.round(((i.score / i.maxScore) * 100))}%</div>
                        </div>
                      : <span className="text-gray-400">En attente</span>}
                  </Td>
                  <Td>{badge(i.status)}</Td>
                  <Td className="text-sm font-medium">
                    <button className="text-indigo-600 hover:text-indigo-900 mr-3"><Eye className="h-4 w-4" /></button>
                    {i.status === 'corrected' && <button className="text-green-600 hover:text-green-900"><Download className="h-4 w-4" /></button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Détails (feedback) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sorted.filter(i => i.status === 'corrected' && i.feedback).slice(0, 2).map(i => (
          <div key={i.session_id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{i.title}</h3>
              <div className={`text-2xl font-bold ${scoreColor(i.score!, i.maxScore)}`}>{i.score}/{i.maxScore}</div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Score obtenu</span><span>{i.score}/{i.maxScore}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full ${barColor(i.score!/i.maxScore)}`} style={{ width: `${(i.score!/i.maxScore) * 100}%` }} />
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Commentaire du professeur</h4>
              <p className="text-sm text-gray-700">{i.feedback}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children }:{ children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>;
}
function Td({ children, className='' }:{ children: React.ReactNode; className?: string }) {
  return <td className={`px-6 py-4 whitespace-nowrap ${className}`}>{children}</td>;
}
function badge(status: 'corrected'|'pending') {
  if (status === 'corrected') return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Corrigé</span>;
  return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">En attente</span>;
}
function scoreColor(score: number, max: number) {
  const pct = (score / max) * 100;
  if (pct >= 80) return 'text-green-600';
  if (pct >= 60) return 'text-yellow-600';
  return 'text-red-600';
}
function barColor(ratio: number) {
  if (ratio >= 0.8) return 'bg-green-600';
  if (ratio >= 0.6) return 'bg-yellow-600';
  return 'bg-red-600';
}
function Stat({ icon, title, value, color }:{ icon: React.ReactNode; title: string; value: React.ReactNode; color: string; }) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow border-l-4 ${color}`}>
      <div className="flex items-center">
        {icon}
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
