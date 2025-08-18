import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import {
  User, Clock, Save, ChevronLeft, ChevronRight, CheckCircle2, Loader2
} from 'lucide-react';

type SessionListItem = {
  session_id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  first_name: string;
  last_name: string;
  answers_count?: number;
  graded_count?: number;
  submitted_at: string | null;
};

type GradingQuestion = {
  question_id: string;
  question_text: string;
  max_points: number;
  // 👇 selected_option peut être string | number | boolean | string[] selon ton BE
  selected_option: any;
  answer_text: string | null;
  points_awarded: number | null;
  feedback: string | null;

  // Optionnels si plus tard tu exposes ça côté BE (pratique pour afficher le libellé QCM)
  question_type?: 'multiple_choice' | 'true_false' | 'text' | 'essay' | string;
  options?: any;
};

type GradingPayload = {
  session: { id: string; exam_id: string; exam_title: string };
  questions: GradingQuestion[];
};

/* ========= Helpers d’affichage ========= */

/** Détecte si une question a effectivement une réponse (y compris false, 0, index 0, etc.) */
function hasAnyAnswer(q: GradingQuestion): boolean {
  if (q.answer_text && q.answer_text.trim() !== '') return true;

  const sel = q.selected_option;

  if (Array.isArray(sel)) return sel.length > 0;
  if (typeof sel === 'boolean') return true; // true/false = réponse validée
  if (sel === 0) return true;                // index 0 d’un QCM
  if (sel === null || sel === undefined) return false;
  if (typeof sel === 'string') return sel.trim() !== '';
  // nombres (1,2,…) ou autres objets → on considère que c’est une réponse
  return true;
}

/** Essaie de produire un libellé “humain” pour un QCM à partir des options si disponibles */
function mcqLabel(sel: any, options: any): string {
  if (!options) return String(sel);

  // options = tableau simple ["A","B","C"] ou tableau d’objets [{value,label}] ou objet {A:"...",B:"..."}
  if (Array.isArray(options)) {
    // index numérique ?
    const idx = typeof sel === 'number' ? sel : (/^\d+$/.test(String(sel)) ? parseInt(String(sel), 10) : NaN);
    if (!Number.isNaN(idx) && options[idx] != null) {
      const v = options[idx];
      return typeof v === 'string' ? v : (v?.label ?? JSON.stringify(v));
    }
    // recherche par value/id
    const found = options.find((it: any) => (it?.value ?? it?.id ?? it) === sel);
    if (found) return typeof found === 'string' ? found : (found.label ?? String(sel));
  } else if (typeof options === 'object') {
    if (Object.prototype.hasOwnProperty.call(options, sel)) {
      const v = options[sel];
      return typeof v === 'string' ? v : JSON.stringify(v);
    }
  }

  return String(sel);
}

/** Formate la réponse apprenant pour affichage (gère text, vrai/faux, QCM, valeurs vides) */
function formatStudentAnswer(q: GradingQuestion): string {
  // 1) Priorité au texte saisi
  if (q.answer_text && q.answer_text.trim() !== '') {
    return q.answer_text;
  }

  // 2) Sinon, regarder selected_option en respectant les cas particuliers
  const sel = q.selected_option;

  if (sel === null || sel === undefined) return '—';
  if (typeof sel === 'string' && sel.trim() === '') return '—';

  // Vrai/faux : attention à false (qui “disparaît” en JSX si on l’affiche brut)
  if (q.question_type === 'true_false') {
    const b = typeof sel === 'boolean'
      ? sel
      : (String(sel).toLowerCase() === 'true' || String(sel) === '1');
    return b ? 'Vrai' : 'Faux';
  }

  // QCM : si on a les options (futur), on tente de retrouver le libellé ; sinon on affiche la valeur telle quelle
  if (q.question_type === 'multiple_choice' && q.options) {
    return mcqLabel(sel, q.options);
  }

  // Valeur “brute” dans les autres cas
  if (Array.isArray(sel)) return sel.join(', ');
  return String(sel);
}

export default function TeacherCorrection() {
  const { examId: examIdParam } = useParams<{ examId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Support query-string en ultime secours
  const qs = new URLSearchParams(location.search);
  const examId = examIdParam || qs.get('examId') || undefined;

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [idx, setIdx] = useState(0);

  const [detailsBySession, setDetailsBySession] = useState<Record<string, GradingPayload>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [gradeDraft, setGradeDraft] = useState<Record<string, { score: number; comment: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!examId) {
        setLoadingSessions(false);
        return;
      }
      setLoadingSessions(true);
      try {
        const resp = await apiService.getGradingSessions({
          examId, status: 'submitted', page: 1, pageSize: 100
        });
        const items: SessionListItem[] = Array.isArray(resp) ? resp : (resp?.items ?? []);
        if (!mounted) return;
        setSessions(items);
        setIdx(0);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Impossible de charger les copies.');
      } finally {
        if (mounted) setLoadingSessions(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [examId]);

  const currentSession = sessions[idx];
  const currentSessionId = currentSession?.session_id;

  useEffect(() => {
    let mounted = true;
    const hydrateDraft = (payload: GradingPayload) => {
      const initial: Record<string, { score: number; comment: string }> = {};
      (payload.questions || []).forEach(q => {
        initial[q.question_id] = {
          score: typeof q.points_awarded === 'number' ? q.points_awarded : 0,
          comment: q.feedback ?? '',
        };
      });
      setGradeDraft(initial);
    };

    const loadDetail = async () => {
      if (!currentSessionId) return;
      if (detailsBySession[currentSessionId]) {
        hydrateDraft(detailsBySession[currentSessionId]);
        return;
      }
      setLoadingDetail(true);
      try {
        const payload: GradingPayload = await apiService.getGradingSession(currentSessionId);
        if (!mounted) return;
        setDetailsBySession(prev => ({ ...prev, [currentSessionId]: payload }));
        hydrateDraft(payload);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Erreur chargement de la copie.');
      } finally {
        if (mounted) setLoadingDetail(false);
      }
    };

    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  const payload = currentSessionId ? detailsBySession[currentSessionId] : undefined;
  const questions = payload?.questions ?? [];

  const totals = useMemo(() => {
    const totalMax = questions.reduce((acc, q) => acc + (q.max_points || 0), 0);
    const totalAwarded = questions.reduce((acc, q) => {
      const d = gradeDraft[q.question_id];
      const val = typeof d?.score === 'number' ? d.score : (q.points_awarded ?? 0);
      return acc + (isFinite(val) ? val : 0);
    }, 0);
    return { totalMax, totalAwarded };
  }, [questions, gradeDraft]);

  const allScored = useMemo(() => {
    if (!questions.length) return false;
    return questions.every(q => {
      const d = gradeDraft[q.question_id];
      const score = d?.score;
      return typeof score === 'number' && score >= 0;
    });
  }, [questions, gradeDraft]);

  const derivedCounts = useMemo(() => {
    const answersCount =
      currentSession?.answers_count ??
      questions.filter(hasAnyAnswer).length;

    const gradedCount =
      currentSession?.graded_count ??
      questions.filter(q => {
        const d = gradeDraft[q.question_id];
        return typeof (d?.score) === 'number' || typeof q.points_awarded === 'number';
      }).length;

    return { answersCount, gradedCount };
  }, [currentSession, questions, gradeDraft]);

  const setScore = (q: GradingQuestion, value: number) => {
    const num = Number.isFinite(value) ? value : 0;
    const bounded = Math.min(Math.max(0, num), q.max_points);
    setGradeDraft(prev => ({
      ...prev,
      [q.question_id]: { score: bounded, comment: prev[q.question_id]?.comment ?? '' },
    }));
  };

  const setComment = (q: GradingQuestion, value: string) => {
    setGradeDraft(prev => ({
      ...prev,
      [q.question_id]: { score: prev[q.question_id]?.score ?? 0, comment: value },
    }));
  };

  const saveAll = async () => {
    if (!currentSessionId || !questions.length) return;
    setSaving(true);
    try {
      await Promise.all(
        questions.map(q => {
          const d = gradeDraft[q.question_id];
          return apiService.gradeQuestion(currentSessionId, q.question_id, {
            points_awarded: d?.score ?? 0,
            feedback: d?.comment ?? '',
          });
        })
      );
      const refreshed: GradingPayload = await apiService.getGradingSession(currentSessionId);
      setDetailsBySession(prev => ({ ...prev, [currentSessionId]: refreshed }));
      toast.success('Notes enregistrées.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erreur enregistrement notes.');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!currentSessionId) return;
    if (!allScored) {
      toast.error('Merci de noter toutes les questions avant de finaliser.');
      return;
    }
    setSaving(true);
    try {
      await saveAll();
      await apiService.finalizeGrading(currentSessionId);
      toast.success('Copie finalisée ✅');

      setSessions(prev => {
        const next = prev.filter(s => s.session_id !== currentSessionId);
        const nextIdx = Math.min(idx, Math.max(0, next.length - 1));
        setIdx(nextIdx);
        return next;
      });

      setDetailsBySession(prev => {
        const { [currentSessionId]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Impossible de finaliser.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingSessions) {
    return (
      <div className="py-20 flex items-center justify-center text-gray-600">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        Chargement des copies…
      </div>
    );
  }

  if (!examId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Correction des copies</h1>
          <Link to="/teacher/exams" className="text-indigo-600 hover:text-indigo-500 font-medium">
            ← Retour aux examens
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600 space-y-4">
          <div>Identifiant d’examen manquant dans l’URL.</div>
          <button
            onClick={() => navigate('/teacher/exams')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Ouvrir la liste des examens
          </button>
        </div>
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Correction des copies</h1>
          <Link to="/teacher/exams" className="text-indigo-600 hover:text-indigo-500 font-medium">
            ← Retour aux examens
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
          Aucune copie “soumise” à corriger pour cet examen.
        </div>
      </div>
    );
  }

  const studentName = currentSession ? `${currentSession.first_name} ${currentSession.last_name}` : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {payload?.session.exam_title || sessions[0]?.exam_title}
            </h1>
            <p className="text-sm text-gray-600">
              Correction des copies — {Math.min(idx + 1, sessions.length)} / {sessions.length}
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div>
              Réponses : <span className="font-semibold">{derivedCounts.answersCount}</span>
            </div>
            <div>
              Notées : <span className="font-semibold">{derivedCounts.gradedCount}</span>
            </div>

            <button
              onClick={saveAll}
              disabled={saving || !questions.length}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-60"
              title="Sauvegarder les notes"
            >
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </button>
            <button
              onClick={finalize}
              disabled={saving || !allScored || !questions.length}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60"
              title="Finaliser la copie"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Finaliser
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Liste étudiants */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-4">Étudiants</h3>
            <div className="space-y-2">
              {sessions.map((s, i) => (
                <button
                  key={s.session_id}
                  onClick={() => setIdx(i)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    i === idx
                      ? 'bg-indigo-50 border-2 border-indigo-200'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="font-medium text-sm">{s.first_name} {s.last_name}</div>
                  <div className="text-xs text-gray-500">
                    Soumis : {s.submitted_at ? new Date(s.submitted_at).toLocaleString('fr-FR') : '—'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Résumé */}
          <div className="bg-white rounded-lg shadow p-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-4">Résumé</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total obtenu :</span>
                <span className="font-semibold">{totals.totalAwarded}/{totals.totalMax}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Pourcentage :</span>
                <span className="font-semibold">
                  {totals.totalMax ? Math.round((totals.totalAwarded / totals.totalMax) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Nav étudiants */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className="flex items-center px-3 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
              </button>
              <button
                onClick={() => setIdx(Math.min(sessions.length - 1, idx + 1))}
                disabled={idx === sessions.length - 1}
                className="flex items-center px-3 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Suivant <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </aside>

        {/* Zone correction */}
        <section className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow">
            {/* Bandeau étudiant */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <User className="h-5 w-5 text-gray-400 mr-2" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{studentName}</h2>
                    <p className="text-sm text-gray-600">Copie à noter</p>
                  </div>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-4 w-4 mr-1" />
                  {currentSession?.submitted_at
                    ? `Soumis le ${new Date(currentSession.submitted_at).toLocaleString('fr-FR')}`
                    : 'Soumission —'}
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="p-6">
              {loadingDetail ? (
                <div className="py-10 flex items-center justify-center text-gray-600">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Chargement de la copie…
                </div>
              ) : (
                <div className="space-y-8">
                  {questions.map((q, i) => (
                    <div key={q.question_id} className="border border-gray-200 rounded-lg p-6">
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-medium text-gray-900">Question {i + 1}</h3>
                          <span className="text-sm text-gray-500">/{q.max_points} points</span>
                        </div>
                        <p className="text-gray-800 mb-4">{q.question_text}</p>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-lg mb-4">
                        <h4 className="font-medium text-gray-900 mb-2">Réponse de l'étudiant :</h4>
                        {/* 👇 n’affiche jamais “vide” pour false/'' */}
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {formatStudentAnswer(q)}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Note (/{q.max_points})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={q.max_points}
                            step="0.5"
                            value={gradeDraft[q.question_id]?.score ?? 0}
                            onChange={(e) => setScore(q, parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Commentaire
                          </label>
                          <textarea
                            rows={2}
                            value={gradeDraft[q.question_id]?.comment ?? ''}
                            onChange={(e) => setComment(q, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Retour pour l'étudiant…"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {!questions.length && (
                    <div className="py-8 text-center text-gray-600">
                      Aucune question à afficher pour cette copie.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
