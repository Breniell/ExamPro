import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import {
  Calendar, Clock, Eye, Upload, Archive, Plus, Check, Trash, Power, Flag,
  Search, Filter, ArrowUp, ArrowDown, Copy, GripVertical, ChevronRight, ChevronLeft
} from 'lucide-react';

/* ===========================
   Types & helpers
=========================== */

type UiQuestionType = 'qcm' | 'text' | 'true_false' | 'essay';

type QuestionDraft = {
  text: string;
  type: UiQuestionType;
  points: number;
  options?: string[];
};

type TeacherExam = {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  duration_minutes: number;
  status: 'draft' | 'published' | 'active' | 'completed' | 'archived';
  sessionsCount?: number;
  sessionscount?: number; // alias compat SQL
};

const uiToServerType = (t: UiQuestionType) => (t === 'qcm' ? 'multiple_choice' : t);

const STATUS_LABEL: Record<TeacherExam['status'], string> = {
  draft: 'Brouillon',
  published: 'Publié',
  active: 'Actif',
  completed: 'Terminé',
  archived: 'Archivé'
};

/* ===========================
   Page principale
=========================== */

export default function TeacherExams() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<TeacherExam[]>([]);
  const [openCreate, setOpenCreate] = useState(false);

  // filtres recherche
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TeacherExam['status']>('all');

  // chargement liste
  const load = async () => {
    setLoading(true);
    try {
      const data = await apiService.getExams();
      setExams(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger vos examens.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // stats
  const sessionsSum = useMemo(
    () => (exams || []).reduce((s, e) => s + Number(e.sessionsCount ?? e.sessionscount ?? 0), 0),
    [exams]
  );
  const byStatus = useMemo(() => {
    const base = { draft: 0, published: 0, active: 0, completed: 0, archived: 0 };
    for (const e of exams) base[e.status]++;
    return base;
  }, [exams]);

  // filtrage + tri
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = [...exams];
    if (statusFilter !== 'all') arr = arr.filter(e => e.status === statusFilter);
    if (needle) arr = arr.filter(e => e.title.toLowerCase().includes(needle) || (e.description || '').toLowerCase().includes(needle));
    // tri: plus proche au plus lointain
    arr.sort((a,b) => +new Date(a.start_date) - +new Date(b.start_date));
    return arr;
  }, [exams, q, statusFilter]);

  // actions statut
  const changeStatus = async (examId: string, status: TeacherExam['status']) => {
    try {
      await apiService.updateExamStatus(examId, status);
      toast.success(`Statut passé à « ${STATUS_LABEL[status]} ».`);
      load();
    } catch {
      toast.error('Changement de statut impossible.');
    }
  };
  const onArchive = async (examId: string) => {
    if (!confirm('Archiver cet examen ?')) return;
    await changeStatus(examId, 'archived');
  };

  return (
    <div className="space-y-6">
      {/* Header de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes examens</h1>
          <p className="text-sm text-gray-600">
            Total : {exams.length} • Sessions cumulées : {sessionsSum}
          </p>
        </div>
        <button
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" /> Créer un examen
        </button>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Brouillons" value={byStatus.draft} tone="border-gray-300" />
        <Kpi label="Publiés" value={byStatus.published} tone="border-blue-300" />
        <Kpi label="Actifs" value={byStatus.active} tone="border-emerald-300" />
        <Kpi label="Terminés" value={byStatus.completed} tone="border-indigo-300" />
        <Kpi label="Archivés" value={byStatus.archived} tone="border-rose-300" />
      </div>

      {/* Barre d’outils (recherche / filtre) */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-full md:w-80">
            <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Rechercher un examen…"
              className="w-full pl-9 pr-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
            <option value="active">Actif</option>
            <option value="completed">Terminé</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Tous mes examens</h2>
        </div>
        {loading ? (
          <div className="py-14 grid place-items-center text-gray-600">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Examen</Th>
                  <Th>Début</Th>
                  <Th>Durée</Th>
                  <Th>Statut</Th>
                  <Th>Sessions</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-gray-900">{e.title}</div>
                      {!!e.description && (
                        <div className="text-xs text-gray-500 line-clamp-1">{e.description}</div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        {new Date(e.start_date).toLocaleString('fr-FR')}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Clock className="h-4 w-4 text-gray-500" />
                        {e.duration_minutes} min
                      </div>
                    </Td>
                    <Td><Status status={e.status} /></Td>
                    <Td>{Number(e.sessionsCount ?? e.sessionscount ?? 0)}</Td>
                    <Td className="text-right">
                      <RowActions
                        exam={e}
                        onPublish={() => changeStatus(e.id, 'published')}
                        onActivate={() => changeStatus(e.id, 'active')}
                        onComplete={() => changeStatus(e.id, 'completed')}
                        onArchive={() => onArchive(e.id)}
                        onView={() => navigate(`/teacher/correction/${e.id}`)}
                      />
                    </Td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <Td colSpan={6}>
                      <div className="py-10 text-center text-gray-500">
                        Aucun examen ne correspond à votre recherche.
                      </div>
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panneau de création */}
      {openCreate && (
        <CreateExamDrawer
          onClose={() => setOpenCreate(false)}
          onCreated={() => { setOpenCreate(false); load(); }}
        />
      )}
    </div>
  );
}

/* ===========================
   Drawer de création (3 étapes)
=========================== */

function CreateExamDrawer({ onClose, onCreated }:{ onClose:()=>void; onCreated:()=>void }) {
  // form global
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<string>(''); // datetime-local
  const [duration, setDuration] = useState<number>(90);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [step, setStep] = useState<0|1|2>(0);
  const [saving, setSaving] = useState(false);

  // helpers questions
  const addQuestion = (type: UiQuestionType) => {
    setQuestions(prev => [
      ...prev,
      {
        text: '',
        type,
        points: 1,
        options: type === 'qcm' ? ['', ''] : (type === 'true_false' ? ['Vrai', 'Faux'] : undefined)
      }
    ]);
  };
  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions(prev => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };
  const removeQuestion = (idx: number) => setQuestions(prev => prev.filter((_, i) => i !== idx));
  const duplicateQuestion = (idx: number) => {
    setQuestions(prev => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, JSON.parse(JSON.stringify(prev[idx])));
      return copy;
    });
  };
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setQuestions(prev => {
      const copy = [...prev];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  };
  const moveDown = (idx: number) => {
    setQuestions(prev => {
      if (idx >= prev.length - 1) return prev;
      const copy = [...prev];
      [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
      return copy;
    });
  };

  const totalPoints = useMemo(() => questions.reduce((s,q)=> s + (q.points || 0), 0), [questions]);

  // validations par étape
  const validStep0 = () => {
    if (!title.trim()) { toast.error('Titre requis.'); return false; }
    if (!start) { toast.error('Date/heure de début requise.'); return false; }
    if (duration <= 0) { toast.error('Durée invalide.'); return false; }
    return true;
  };
  const validStep1 = () => {
    if (questions.length === 0) { toast.error('Ajoutez au moins une question.'); return false; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { toast.error(`Question ${i+1}: intitulé requis.`); return false; }
      if (q.points < 0) { toast.error(`Question ${i+1}: points invalides.`); return false; }
      if (q.type === 'qcm') {
        const opts = (q.options || []).map(x => x.trim()).filter(Boolean);
        if (opts.length < 2) { toast.error(`Question ${i+1} (QCM): au moins 2 options.`); return false; }
      }
      if (q.type === 'true_false') {
        const opts = (q.options || []).map(x => x.trim()).filter(Boolean);
        if (opts.length < 2) { toast.error(`Question ${i+1} (Vrai/Faux): 2 options requises.`); return false; }
      }
    }
    return true;
  };

  const next = () => {
    if (step === 0 && !validStep0()) return;
    if (step === 1 && !validStep1()) return;
    setStep((s)=> (s === 2 ? 2 : ((s+1) as any)));
  };
  const prev = () => setStep(s => (s === 0 ? 0 : ((s-1) as any)));

  // submit
  const submit = async () => {
    if (!validStep0() || !validStep1()) return;
    setSaving(true);
    try {
      await apiService.createExam({
        title,
        description: description?.trim() || '',
        duration_minutes: duration,
        start_date: new Date(start).toISOString(),
        questions: questions.map(q => ({
          text: q.text,
          type: uiToServerType(q.type),
          points: q.points,
          options:
            q.type === 'qcm' || q.type === 'true_false'
              ? (q.options || []).map(o => o.trim()).filter(Boolean)
              : null
        }))
      });
      toast.success('Examen créé en brouillon.');
      onCreated();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Création impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* drawer */}
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-2xl md:max-w-3xl bg-white shadow-2xl flex flex-col">
        {/* header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-wider text-gray-500">NOUVEL EXAMEN</div>
            <h3 className="text-lg font-semibold text-gray-900">Création</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">Fermer</button>
        </div>

        {/* stepper */}
        <div className="px-6 py-3 border-b border-gray-100">
          <Stepper step={step} items={['Informations', 'Questions', 'Revue']} />
        </div>

        {/* content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 0 && (
            <section className="space-y-5">
              <Field label="Titre" required>
                <input
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </Field>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Début (date & heure)" required>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    min={new Date(Date.now() - 60_000).toISOString().slice(0,16)}
                  />
                </Field>

                <Field label="Durée (minutes)" required>
                  <input
                    type="number" min={1}
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={duration}
                    onChange={e => setDuration(parseInt(e.target.value || '0', 10))}
                  />
                </Field>
              </div>

              <Field label="Description (optionnel)">
                <textarea
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ajoutez un contexte / des consignes…"
                />
              </Field>

              <div className="rounded-md bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                Conseil : vous pourrez publier l’examen après création depuis la liste.
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              {/* barre d’ajout */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{questions.length}</span> question(s) • <span className="font-medium">{totalPoints}</span> point(s) au total
                </div>
                <div className="flex gap-2">
                  <AddBtn onClick={() => addQuestion('qcm')}>+ QCM</AddBtn>
                  <AddBtn onClick={() => addQuestion('true_false')}>+ Vrai/Faux</AddBtn>
                  <AddBtn onClick={() => addQuestion('text')}>+ Texte</AddBtn>
                  <AddBtn onClick={() => addQuestion('essay')}>+ Rédaction</AddBtn>
                </div>
              </div>

              {/* liste des questions */}
              {questions.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
                  Ajoutez votre première question.
                </div>
              )}

              <div className="space-y-4">
                {questions.map((q, idx) => (
                  <QuestionCard
                    key={idx}
                    index={idx}
                    value={q}
                    onChange={(patch) => updateQuestion(idx, patch)}
                    onRemove={() => removeQuestion(idx)}
                    onDuplicate={() => duplicateQuestion(idx)}
                    onUp={() => moveUp(idx)}
                    onDown={() => moveDown(idx)}
                  />
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <div className="bg-gray-50 border rounded-lg p-4">
                <div className="text-sm text-gray-600">Résumé</div>
                <div className="grid md:grid-cols-2 gap-2 mt-2 text-gray-900">
                  <div><span className="font-medium">Titre :</span> {title || '—'}</div>
                  <div><span className="font-medium">Début :</span> {start ? new Date(start).toLocaleString('fr-FR') : '—'}</div>
                  <div><span className="font-medium">Durée :</span> {duration} min</div>
                  <div><span className="font-medium">Questions :</span> {questions.length} (total {totalPoints} pts)</div>
                </div>
              </div>

              <div className="space-y-3">
                {questions.map((q, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm uppercase tracking-wide text-gray-500">{labelType(q.type)}</div>
                      <div className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{q.points} pt</div>
                    </div>
                    <div className="mt-2 text-gray-900">{q.text || <span className="text-gray-400">Sans intitulé</span>}</div>
                    {(q.type === 'qcm' || q.type === 'true_false') && (
                      <ul className="mt-2 list-disc pl-6 text-gray-700">
                        {(q.options || []).map((o, j) => <li key={j}>{o || <span className="text-gray-400">Option vide</span>}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* footer sticky actions */}
        <div className="px-6 py-4 border-t bg-white flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {step === 0 && 'Étape 1/3 — Informations'}
            {step === 1 && 'Étape 2/3 — Questions'}
            {step === 2 && 'Étape 3/3 — Revue'}
          </div>
          <div className="flex gap-2">
            <button onClick={step === 0 ? onClose : prev}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200">
              {step === 0 ? 'Annuler' : (<><ChevronLeft className="h-4 w-4 mr-1" /> Précédent</>)}
            </button>
            {step < 2 ? (
              <button onClick={next}
                      className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
                Suivant <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Création…' : (<><Check className="h-5 w-5 mr-2" /> Créer en brouillon</>)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Petits composants UI
=========================== */

function Kpi({ label, value, tone }:{ label:string; value:number; tone:string }) {
  return (
    <div className={`bg-white p-4 rounded-lg shadow border-l-4 ${tone}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function Th({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '', colSpan }: React.PropsWithChildren<{ className?: string; colSpan?: number }>) {
  return (
    <td className={`px-6 py-4 whitespace-nowrap ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

function Status({ status }: { status: TeacherExam['status'] }) {
  const map: Record<TeacherExam['status'], string> = {
    draft: 'bg-gray-100 text-gray-700',
    published: 'bg-blue-100 text-blue-800',
    active: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-indigo-100 text-indigo-800',
    archived: 'bg-rose-100 text-rose-800'
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status]}`} title={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function RowActions({
  exam, onPublish, onActivate, onComplete, onArchive, onView
}: {
  exam: TeacherExam;
  onPublish: () => void;
  onActivate: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onView: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={onView} className="inline-flex items-center px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50" title="Voir">
        <Eye className="h-4 w-4 mr-1" /> Voir
      </button>
      {exam.status === 'draft' && (
        <button onClick={onPublish} className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm" title="Publier">
          <Upload className="h-4 w-4 mr-1" /> Publier
        </button>
      )}
      {exam.status === 'published' && (
        <>
          <button onClick={onActivate} className="inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-sm" title="Activer">
            <Power className="h-4 w-4 mr-1" /> Activer
          </button>
          <button onClick={onArchive} className="inline-flex items-center px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 text-sm" title="Archiver">
            <Archive className="h-4 w-4 mr-1" /> Archiver
          </button>
        </>
      )}
      {exam.status === 'active' && (
        <>
          <button onClick={onComplete} className="inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-sm" title="Clôturer">
            <Flag className="h-4 w-4 mr-1" /> Terminer
          </button>
          <button onClick={onArchive} className="inline-flex items-center px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 text-sm" title="Archiver">
            <Archive className="h-4 w-4 mr-1" /> Archiver
          </button>
        </>
      )}
      {exam.status === 'completed' && (
        <button onClick={onArchive} className="inline-flex items-center px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 text-sm" title="Archiver">
          <Archive className="h-4 w-4 mr-1" /> Archiver
        </button>
      )}
    </div>
  );
}

/* === Stepper + Field + QuestionCard === */

function Stepper({ step, items }:{ step: number; items: string[] }) {
  return (
    <ol className="flex items-center gap-3">
      {items.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={i} className="flex items-center">
            <div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold
              ${done ? 'bg-emerald-600 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {i+1}
            </div>
            <span className={`ml-2 text-sm ${active ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>{label}</span>
            {i < items.length - 1 && <span className="mx-3 h-px w-6 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, required, children }:{ label:string; required?:boolean; children: React.ReactNode; }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label} {required && <span className="text-rose-600">*</span>}
      {children}
    </label>
  );
}

function labelType(t: UiQuestionType) {
  switch (t) {
    case 'qcm': return 'QCM';
    case 'true_false': return 'Vrai/Faux';
    case 'text': return 'Texte';
    case 'essay': return 'Rédaction';
  }
}

function AddBtn({ children, onClick }:{ children:React.ReactNode; onClick:()=>void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-sm inline-flex items-center px-3 py-1.5 rounded-md border hover:bg-gray-50">
      {children}
    </button>
  );
}

function QuestionCard({
  index, value, onChange, onRemove, onDuplicate, onUp, onDown
}:{
  index:number;
  value: QuestionDraft;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const { type, text, points, options } = value;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span>Question {index + 1} — {labelType(type)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onUp} className="p-1 rounded hover:bg-gray-100" title="Monter">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDown} className="p-1 rounded hover:bg-gray-100" title="Descendre">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDuplicate} className="p-1 rounded hover:bg-gray-100" title="Dupliquer">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} className="p-1 rounded text-rose-600 hover:bg-rose-50" title="Supprimer">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Métadonnées */}
      <div className="mt-3 grid md:grid-cols-3 gap-3">
        <div>
          <span className="block text-xs text-gray-600 mb-1">Type</span>
          <select
            value={type}
            onChange={(e) => onChange({
              type: e.target.value as UiQuestionType,
              options: (e.target.value === 'qcm') ? (options?.length ? options : ['', ''])
                    : (e.target.value === 'true_false') ? ['Vrai','Faux']
                    : undefined
            })}
            className="w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="qcm">QCM</option>
            <option value="true_false">Vrai/Faux</option>
            <option value="text">Texte</option>
            <option value="essay">Rédaction</option>
          </select>
        </div>
        <div>
          <span className="block text-xs text-gray-600 mb-1">Points</span>
          <input
            type="number" min={0}
            value={points}
            onChange={(e)=> onChange({ points: parseFloat(e.target.value || '0') })}
            className="w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Intitulé */}
      <div className="mt-3">
        <span className="block text-xs text-gray-600 mb-1">Intitulé</span>
        <textarea
          rows={2}
          value={text}
          onChange={(e)=> onChange({ text: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Options si besoin */}
      {(type === 'qcm' || type === 'true_false') && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Options</span>
            {type === 'qcm' && (
              <button
                type="button"
                onClick={()=> onChange({ options: [...(options || []), ''] })}
                className="text-indigo-600 text-sm hover:text-indigo-800"
              >
                + Ajouter une option
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="flex-1 px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder={`Option ${i+1}`}
                  value={opt}
                  onChange={(e)=> {
                    const next = [...(options || [])];
                    next[i] = e.target.value;
                    onChange({ options: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(options || [])];
                    next.splice(i,1);
                    const min = (type === 'qcm') ? 2 : 2;
                    while (next.length < min) next.push('');
                    onChange({ options: next });
                  }}
                  className="p-2 rounded text-rose-600 hover:bg-rose-50"
                  title="Retirer"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
