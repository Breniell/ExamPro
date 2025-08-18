import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { User, Save, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';

type SessionRow = {
  session_id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  first_name: string;
  last_name: string;
  answers_count: string | number;
  graded_count: string | number;
  submitted_at: string | null; // ← accepte null
};

type GradingDetail = {
  session: { id: string; exam_id: string; exam_title: string };
  questions: {
    question_id: string;
    question_text: string;
    max_points: number;
    answer_text: string | null;
    selected_option: string | null;
    points_awarded: number | null;
    feedback: string | null;
  }[];
};

export default function TeacherGrading() {
  const params = useParams();
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.id || null);
  const [detail, setDetail] = useState<GradingDetail | null>(null);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const resp = await apiService.getGradingSessions({
        status: 'submitted',
        page: 1,
        pageSize: 50,
      });

      // Unwrap: accepte {items,total} OU un tableau brut
      const items: SessionRow[] = Array.isArray(resp)
        ? resp
        : (resp?.items ?? []);

      setRows(items);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger les copies à corriger.');
    } finally {
      setLoadingList(false);
    }
  };

  const loadDetail = async (sessionId: string) => {
    setLoadingDetail(true);
    try {
      const d = await apiService.getGradingSession(sessionId);
      setDetail(d);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger la session.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  const progress = useMemo(() => {
    if (!detail) return { graded: 0, total: 0 };
    const total = detail.questions.length;
    const graded = detail.questions.filter(q => q.points_awarded != null).length;
    return { graded, total };
  }, [detail]);

  const saveGrade = async (qId: string, points: number, feedback: string) => {
    if (!detail?.session?.id) return;
    try {
      const max = detail.questions.find(q => q.question_id === qId)?.max_points ?? 0;
      if (points < 0 || points > max) {
        return toast.error(`La note doit être comprise entre 0 et ${max}.`);
      }
      // Optimistic UI
      setDetail(prev => prev ? ({
        ...prev,
        questions: prev.questions.map(q => q.question_id === qId ? { ...q, points_awarded: points, feedback } : q)
      }) : prev);
      await apiService.gradeQuestion(detail.session.id, qId, { points_awarded: points, feedback });
      toast.success('Noté.');
    } catch (e) {
      console.error(e);
      toast.error('Sauvegarde impossible.');
      // Optionnel: reload detail pour resynchroniser
      if (detail?.session?.id) loadDetail(detail.session.id);
    }
  };

  const finalize = async () => {
    if (!detail?.session?.id) return;
    if (progress.graded !== progress.total) {
      return toast.error('Veuillez noter toutes les questions avant de finaliser.');
    }
    try {
      await apiService.finalizeGrading(detail.session.id);
      toast.success('Correction finalisée.');
      setDetail(null);
      loadList();
    } catch (e) {
      console.error(e);
      toast.error('Finalisation impossible.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Liste des sessions */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">À corriger</h2>
          </div>
          {loadingList ? (
            <div className="p-6 text-gray-500">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-gray-500">Aucune copie en attente.</div>
          ) : (
            <ul className="divide-y">
              {rows.map(r => {
                const graded = Number(r.graded_count || 0);
                const answers = Number(r.answers_count || 0);
                const done = answers > 0 ? Math.round((graded / answers) * 100) : 0;
                const isActive = selectedId === r.session_id;
                return (
                  <li key={r.session_id}>
                    <button
                      onClick={() => setSelectedId(r.session_id)}
                      className={`w-full text-left p-4 flex items-start justify-between ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                    >
                      <div>
                        <div className="font-medium text-gray-900">{r.exam_title}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                          <User className="h-4 w-4 text-gray-400" />
                          {r.first_name} {r.last_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {r.submitted_at ? (
                            <>Soumis le {new Date(r.submitted_at).toLocaleString('fr-FR')}</>
                          ) : (
                            <>Soumission —</>
                          )}
                        </div>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${done}%` }} />
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 mt-1" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Détail / correction */}
      <div className="lg:col-span-3">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {!selectedId ? (
            <div className="p-10 text-gray-500">Sélectionnez une copie à corriger.</div>
          ) : loadingDetail ? (
            <div className="p-10 text-gray-600 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : !detail ? (
            <div className="p-10 text-gray-500">Impossible de charger la session.</div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detail.session.exam_title}</h3>
                  <div className="text-sm text-gray-600">
                    Progression : {progress.graded}/{progress.total} notées
                  </div>
                </div>
                <button
                  onClick={finalize}
                  disabled={progress.total === 0 || progress.graded !== progress.total}
                  className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={progress.graded !== progress.total ? 'Notez toutes les questions' : 'Finaliser la correction'}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Finaliser
                </button>
              </div>

              <div className="p-6 space-y-6">
                {detail.questions.map((q, i) => (
                  <div key={q.question_id} className="border rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">Question {i + 1}</h4>
                      <span className="text-sm text-gray-600">/{q.max_points} pts</span>
                    </div>
                    <p className="text-gray-800 mb-4">{q.question_text}</p>

                    <div className="bg-gray-50 p-4 rounded-md mb-4">
                      <div className="text-sm font-medium text-gray-700 mb-1">Réponse de l’étudiant</div>
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {q.answer_text ?? (q.selected_option ? `Option choisie : ${q.selected_option}` : '—')}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Note (/{q.max_points})
                        <input
                          id={`pts-${q.question_id}`} // ← nécessaire pour la lecture dans la textarea.onBlur
                          type="number"
                          min={0}
                          max={q.max_points}
                          step="0.5"
                          defaultValue={q.points_awarded ?? 0}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value || '0');
                            saveGrade(q.question_id, isNaN(v) ? 0 : v, q.feedback ?? '');
                          }}
                          className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Commentaire
                        <textarea
                          defaultValue={q.feedback ?? ''}
                          onBlur={(e) => {
                            const v = parseFloat(
                              (document.querySelector(`#pts-${q.question_id}`) as HTMLInputElement)?.value
                              || `${q.points_awarded ?? 0}`
                            );
                            saveGrade(q.question_id, isNaN(v) ? (q.points_awarded ?? 0) : v, e.target.value);
                          }}
                          rows={2}
                          className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </label>
                    </div>

                    <div className="mt-3">
                      <button
                        onClick={() => saveGrade(q.question_id, q.points_awarded ?? 0, q.feedback ?? '')}
                        className="inline-flex items-center px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
                      >
                        <Save className="h-4 w-4 mr-1" /> Sauvegarder
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
