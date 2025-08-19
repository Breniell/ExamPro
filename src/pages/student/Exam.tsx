import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { Clock, Camera, AlertTriangle, Send, ChevronLeft, ChevronRight, Mic, MicOff, MonitorUp, MonitorX } from 'lucide-react';
import { connectProctorSocket, iceServers } from '../../services/proctorSocket';

type ExamQuestion = {
  id: string;
  text: string;
  type: 'qcm' | 'text' | 'true_false';
  points: number;
  options?: any; // normalisé plus bas
};

type ExamPayload = {
  id: string;
  title: string;
  duration_minutes: number;
  start_date: string;
  end_date: string;
  questions: ExamQuestion[];
};

type SessionDetail = {
  id: string;
  exam_id: string;
  title: string;
  duration_minutes: number;
  end_date: string;
  started_at: string;
};

export default function StudentExam() {
  const { id: examId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [focusWarnings, setFocusWarnings] = useState(0);

  // états UI supplémentaires
  const [camPrompt, setCamPrompt] = useState(false);   // demande explicite caméra
  const [fatalError, setFatalError] = useState<string | null>(null); // erreur bloquante sans redirection

  // proctoring UI
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [screenActive, setScreenActive] = useState(false);

  // PROCTORING
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const audioTrack = useRef<MediaStreamTrack | null>(null);

  const socketRef = useRef<ReturnType<typeof connectProctorSocket> | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());

  // time-spent par question
  const timeSpent = useRef<Record<string, number>>({});
  const enterAt = useRef<number>(Date.now());

  // anti double submit
  const submittedRef = useRef(false);

  /** Normalise les options (string "a,b", array, objet {A:"..."}) → string[] */
  function optionsToArray(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string') {
      return raw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
    }
    if (typeof raw === 'object') {
      try { return Object.values(raw).map(String).filter(Boolean); } catch { return []; }
    }
    return [];
  }

  /** Attache le flux caméra à la balise <video> si dispo */
  function attachVideo() {
    const el = videoRef.current;
    if (el && camStream.current) {
      try {
        // @ts-ignore
        el.srcObject = camStream.current;
        el.play().catch(() => {});
      } catch {}
    }
  }

  /** Demande l'accès caméra (sans redirection si refus) */
  async function ensureCamera(): Promise<void> {
    if (camStream.current && camStream.current.getVideoTracks().some(t => t.readyState === 'live')) {
      setCameraActive(true);
      attachVideo();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      camStream.current = stream;
      setCameraActive(true);
      attachVideo();
      setCamPrompt(false);
    } catch {
      setCameraActive(false);
      setCamPrompt(true); // on affiche l'écran "autoriser caméra"
      throw new Error('La webcam est requise');
    }
  }

  /** Démarre tout le flow après caméra OK */
  async function startExamFlow() {
    if (!examId) throw new Error('Identifiant examen manquant.');
    // 1) Récup examen
    const ex: ExamPayload = await apiService.getExam(examId);
    setExam(ex);

    // 2) Démarrer session
    const started = await apiService.startExamSession(examId);

    // 3) Récup détail session
    const det = await apiService.getSession(started.id);
    const sess: SessionDetail = {
      id: det.id,
      exam_id: det.exam_id,
      title: det.title,
      duration_minutes: det.duration_minutes,
      end_date: det.end_date,
      started_at: det.started_at,
    };
    setSession(sess);

    // 4) WebSocket proctor
    const token = localStorage.getItem('token') || '';
    const me = await apiService.getCurrentUser().catch(() => null as any);
    const studentName =
      me && (me.first_name || me.last_name)
        ? `${me.first_name || ''} ${me.last_name || ''}`.trim()
        : null;

    const sock = connectProctorSocket(token);
    socketRef.current = sock;

    sock.on('connect', () => {
      if (det?.id) {
        sock.emit('join-session', { sessionId: det.id });
        sock.emit('session-meta', {
          sessionId: det.id,
          examTitle: ex?.title || null,
          studentName: studentName || null,
        } as any);
      }
    });

    sock.on('connect_error', () => toast.error('Connexion au centre de contrôle indisponible (WS).'));

        // L’admin demande une offre
        sock.on('request-offer', async ({ adminSocketId, sessionId }) => {
          if (!sess?.id || sessionId !== sess.id) return;

          // si un PC existait déjà pour cet admin → ferme-le pour repartir clean
          const old = peers.current.get(adminSocketId);
          if (old) {
            try { old.close(); } catch {}
            peers.current.delete(adminSocketId);
          }
          await createAndSendOffer(adminSocketId);
        });


        // Réponse admin
        sock.on('webrtc-answer', async ({ from, description }) => {
          const pc = peers.current.get(from);
          if (pc && description?.type === 'answer') {
            try { await pc.setRemoteDescription(new RTCSessionDescription(description)); } catch {}
          }
        });


    sock.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      const pc = peers.current.get(from);
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
    });

    // Timer
    const startMs = new Date(sess.started_at).getTime();
    const endByDuration = startMs + sess.duration_minutes * 60_000;
    const hardEnd = new Date(sess.end_date).getTime();
    const deadline = Math.min(endByDuration, isFinite(hardEnd) ? hardEnd : endByDuration);
    setTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));

    // Warn close
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    enterAt.current = Date.now();

    return () => window.removeEventListener('beforeunload', beforeUnload);
  }

  // Boot
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!examId) return;
      setLoading(true);
      try {
        await ensureCamera();           // peut lever → camPrompt activé
        await startExamFlow();          // peut lever → fatalError
      } catch (e: any) {
        // si c'est un refus caméra, camPrompt est à true → on ne met pas fatalError
        if (!camPrompt) {
          const msg = e?.message || "Impossible d'ouvrir l'examen.";
          setFatalError(msg);
          toast.error(msg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; cleanupProctoring(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // si caméra obtienue après coup, re-attacher
  useEffect(() => { attachVideo(); }, [cameraActive]);

  function cleanupProctoring() {
    for (const pc of peers.current.values()) { try { pc.close(); } catch {} }
    peers.current.clear();
    camStream.current?.getTracks().forEach(t => t.stop());
    camStream.current = null;
    if (screenTrack.current) { try { screenTrack.current.stop(); } catch {} screenTrack.current = null; }
    if (audioTrack.current) { try { audioTrack.current.stop(); } catch {} audioTrack.current = null; }
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
  }

  function activeVideoTrack(): MediaStreamTrack | null {
    if (screenActive && screenTrack.current) return screenTrack.current;
    const vt = camStream.current?.getVideoTracks?.()[0] || null;
    return vt || null;
  }

  async function createAndSendOffer(adminSocketId: string) {
    if (!socketRef.current) return;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    peers.current.set(adminSocketId, pc);

    // Ajout pistes (vidéo active + audio si dispo)
    const vTrack = activeVideoTrack();
    if (vTrack) pc.addTrack(vTrack, new MediaStream([vTrack]));
    if (audioTrack.current) pc.addTrack(audioTrack.current, new MediaStream([audioTrack.current]));

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', { to: adminSocketId, candidate: ev.candidate });
      }
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);

    socketRef.current.emit('webrtc-offer', {
      to: adminSocketId,
      sessionId: session?.id,
      description: pc.localDescription,
    });
  }

  // Mise à jour dynamique des pistes vidéo (camera <-> screen)
  async function replaceVideoForAllPeers(newTrack: MediaStreamTrack | null) {
    for (const pc of peers.current.values()) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      } else if (newTrack) {
        pc.addTrack(newTrack, new MediaStream([newTrack]));
      }
    }
  }

  // Timer tick
  useEffect(() => {
    if (!timeLeft) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (!submittedRef.current) handleSubmit(); // soumission auto
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // Anti-triche (changement d’onglet)
  useEffect(() => {
    const onVis = () => {
      if (!session?.id) return;
      if (document.hidden) {
        setFocusWarnings((v) => v + 1);
        apiService.logSecurityEvent(session.id, {
          event_type: 'tab_blur', event_data: 'User left the tab/window', severity: 'low',
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session?.id]);

  // Anti-triche (raccourcis & clic droit)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'a', 's'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i')) e.preventDefault();
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', onCtx);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('contextmenu', onCtx); };
  }, []);

  const list = exam?.questions ?? [];
  const q = list[currentIdx];

  const leaveCurrentQuestion = () => {
    if (!q) return;
    const spent = Math.floor((Date.now() - enterAt.current) / 1000);
    timeSpent.current[q.id] = (timeSpent.current[q.id] || 0) + Math.max(0, spent);
    enterAt.current = Date.now();
  };

  const goPrev = () => { if (currentIdx === 0) return; leaveCurrentQuestion(); setCurrentIdx((i) => i - 1); };
  const goNext = () => { if (currentIdx >= list.length - 1) return; leaveCurrentQuestion(); setCurrentIdx((i) => i + 1); };

  const setAnswer = (questionId: string, value: string) => { setAnswers((prev) => ({ ...prev, [questionId]: value })); };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  function validateBeforeSubmit(exam: ExamPayload, answers: Record<string, string>) {
    for (let i = 0; i < exam.questions.length; i++) {
      const qq = exam.questions[i];
      const val = answers[qq.id];
      if ((qq.type === 'qcm' || qq.type === 'true_false') && !val) {
        return { ok: false, index: i, message: `La question ${i + 1} est obligatoire.` };
      }
    }
    return { ok: true };
  }

  const handleSubmit = async () => {
    if (!session?.id || !exam) return;

    const confirmed = window.confirm(
      "Confirmer la soumission ?\n\nAprès validation, vous ne pourrez plus modifier vos réponses."
    );
    if (!confirmed) return;

    const check = validateBeforeSubmit(exam, answers);
    if (!check.ok) {
      leaveCurrentQuestion();
      setCurrentIdx(check.index!);
      toast.error(check.message || 'Certaines réponses sont manquantes.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      leaveCurrentQuestion();

      if (session?.id) {
        apiService.logSecurityEvent(session.id, {
          event_type: 'attempt_submit',
          event_data: { at: new Date().toISOString() },
          severity: 'low',
        }).catch(() => {});
      }

      for (let i = 0; i < exam.questions.length; i++) {
        const qq = exam.questions[i];
        const val = answers[qq.id] ?? '';

        const payload: any = {
          question_id: qq.id,
          time_spent: Math.max(0, Math.floor(timeSpent.current[qq.id] || 0)),
        };

        if (qq.type === 'qcm' || qq.type === 'true_false') {
          payload.selected_option = val || null;
          payload.answer_text = null;
        } else {
          payload.answer_text = val || '';
          payload.selected_option = null;
        }

        try {
          await apiService.submitAnswer(session.id, payload);
        } catch (err: any) {
          setCurrentIdx(i);
          const msg = err?.message || 'Erreur de sauvegarde de la réponse.';
          toast.error(`Q${i + 1}: ${msg}`);
          apiService.logSecurityEvent(session.id, {
            event_type: 'answer_submit_failed',
            event_data: { questionId: qq.id, message: msg },
            severity: 'medium',
          }).catch(() => {});
          throw err;
        }
      }

      try {
        await apiService.submitExam(session.id);
      } catch (err: any) {
        const msg = err?.message || 'Erreur lors de la finalisation.';
        toast.error(msg);
        apiService.logSecurityEvent(session.id, {
          event_type: 'final_submit_failed',
          event_data: { message: msg },
          severity: 'high',
        }).catch(() => {});
        return;
      }

      submittedRef.current = true;
      toast.success('Examen soumis avec succès !');
      cleanupProctoring();
      navigate('/student', { replace: true });

    } catch (e) {
      console.error('Submit flow error:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = useMemo(
    () => (list.length ? ((currentIdx + 1) / list.length) * 100 : 0),
    [currentIdx, list.length]
  );

  // --- Contrôles proctoring: audio + screen share
  async function toggleAudio() {
    try {
      if (!audioEnabled) {
        const a = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const track = a.getAudioTracks()[0];
        audioTrack.current = track;
        setAudioEnabled(true);
        for (const pc of peers.current.values()) {
          pc.addTrack(track, new MediaStream([track]));
        }
        if (camStream.current) camStream.current.addTrack(track);
      } else {
        setAudioEnabled(false);
        if (audioTrack.current) audioTrack.current.enabled = false;
      }
    } catch {
      toast.error("Micro non disponible.");
    }
  }

  async function startScreenShare() {
    try {
      const disp = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      const track: MediaStreamTrack = disp.getVideoTracks()[0];
      screenTrack.current = track;
      setScreenActive(true);
      await replaceVideoForAllPeers(track);
      track.onended = async () => { await stopScreenShare(); };
      toast.success("Partage d'écran activé (visible côté examinateur).");
    } catch {
      toast.error("Partage d'écran refusé.");
    }
  }

  async function stopScreenShare() {
    setScreenActive(false);
    if (screenTrack.current) {
      try { screenTrack.current.stop(); } catch {}
      screenTrack.current = null;
    }
    const vt = camStream.current?.getVideoTracks?.()[0] || null;
    await replaceVideoForAllPeers(vt);
    toast('Retour caméra.');
  }

  const renderAnswer = () => {
    if (!q) return null;

    if (q.type === 'qcm') {
      const opts = optionsToArray(q.options);
      return (
        <div className="space-y-3">
          {opts.map((opt, i) => (
            <label key={i} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio" name={`q-${q.id}`} value={opt}
                checked={answers[q.id] === opt} onChange={(e) => setAnswer(q.id, e.target.value)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
              />
              <span className="ml-3 text-gray-700">{opt}</span>
            </label>
          ))}
          {!opts.length && <div className="text-sm text-amber-600">Aucune option disponible pour cette question.</div>}
        </div>
      );
    }

    if (q.type === 'true_false') {
      const tfRaw = optionsToArray(q.options);
      const tf = tfRaw.length === 2 ? tfRaw : ['Vrai', 'Faux'];
      return (
        <div className="space-y-3">
          {tf.map((opt) => (
            <label key={opt} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio" name={`q-${q.id}`} value={opt}
                checked={answers[q.id] === opt} onChange={(e) => setAnswer(q.id, e.target.value)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
              />
              <span className="ml-3 text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    return (
      <textarea
        value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)}
        placeholder="Saisissez votre réponse ici…" rows={10}
        className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
      />
    );
  };

  // ==== ÉTATS UI ====

  // Chargement initial
  if (loading && !exam && !session && !camPrompt && !fatalError) {
    return <div className="min-h-[50vh] grid place-items-center text-gray-600">Chargement de l’examen…</div>;
  }

  // Demande caméra
  if (camPrompt) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="bg-white rounded-lg shadow p-6 max-w-md w-full text-center">
          <Camera className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-gray-900">Autorisation nécessaire</h2>
          <p className="mt-2 text-gray-600 text-sm">
            La webcam est requise pour passer cet examen. Autorisez l’accès puis réessayez.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={async () => {
                setLoading(true);
                try { await ensureCamera(); await startExamFlow(); }
                catch (e: any) { if (!e?.message?.includes('webcam')) setFatalError(e?.message || 'Erreur lors du démarrage.'); }
                finally { setLoading(false); }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Réessayer
            </button>
            <button
              onClick={() => navigate('/student')}
              className="px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Erreur bloquante API (sans redirection auto)
  if (fatalError) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="bg-white rounded-lg shadow p-6 max-w-md w-full text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-gray-900">Impossible d’ouvrir l’examen</h2>
          <p className="mt-2 text-gray-600 text-sm">{fatalError}</p>
          <div className="mt-4">
            <button onClick={() => navigate('/student')} className="px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200">
              Retour aux examens
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!exam || !session || !q) {
    return <div className="min-h-[50vh] grid place-items-center text-gray-600">Chargement…</div>;
  }

  // ==== UI normale ====
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b-2 border-red-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">{exam.title}</h1>
              <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">EXAMEN EN COURS</span>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Camera className={`h-5 w-5 ${cameraActive ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`text-sm font-medium ${cameraActive ? 'text-green-600' : 'text-red-600'}`}>
                  {cameraActive ? 'Caméra active' : 'Caméra inactive'}
                </span>
              </div>

              <button
                onClick={async () => {
                  try {
                    if (!audioEnabled) {
                      const a = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                      const track = a.getAudioTracks()[0];
                      audioTrack.current = track;
                      setAudioEnabled(true);
                      for (const pc of peers.current.values()) pc.addTrack(track, new MediaStream([track]));
                      if (camStream.current) camStream.current.addTrack(track);
                    } else {
                      setAudioEnabled(false);
                      if (audioTrack.current) audioTrack.current.enabled = false;
                    }
                  } catch { toast.error('Micro non disponible.'); }
                }}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md ${audioEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}
                title={audioEnabled ? 'Couper le micro' : 'Activer le micro'}
              >
                {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {audioEnabled ? 'Micro ON' : 'Micro OFF'}
              </button>

              <button
                onClick={screenActive ? stopScreenShare : startScreenShare}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md ${screenActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}
                title={screenActive ? "Arrêter le partage d'écran" : "Partager l'écran"}
              >
                {screenActive ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
                {screenActive ? 'Stop partage' : "Partager l'écran"}
              </button>

              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <span className="text-lg font-mono font-bold text-orange-600">
                  {formatTime(timeLeft)}
                </span>
              </div>
              {focusWarnings > 0 && (
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Alertes: {focusWarnings}</span>
                </div>
              )}
            </div>
          </div>

          {/* progress */}
          <div className="pb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Question {currentIdx + 1} sur {list.length}</span>
              <span>{Math.round(progress)}% terminé</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Question */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Question {currentIdx + 1}</h2>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded">{q.points} points</span>
              </div>
              <p className="text-gray-700 text-lg leading-relaxed">{q.text}</p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={goPrev} disabled={currentIdx === 0}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
              </button>
              <span className="text-sm text-gray-500">{currentIdx + 1} / {list.length}</span>
              <button
                onClick={goNext} disabled={currentIdx === list.length - 1}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Suivant <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>

          {/* Answer */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Votre réponse</h3>
            {renderAnswer()}

            {currentIdx === list.length - 1 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center px-6 py-3 text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      Soumission en cours…
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" /> Soumettre l’examen
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Aperçu */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Aperçu des réponses</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {list.map((qq, i) => {
              const has = !!answers[qq.id];
              const active = i === currentIdx;
              return (
                <button
                  key={qq.id}
                  onClick={() => { leaveCurrentQuestion(); setCurrentIdx(i); }}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    active ? 'border-indigo-500 bg-indigo-50'
                    : has ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">{i + 1}</div>
                    <div className="text-xs text-gray-600 mt-1">{has ? 'Répondu' : 'Non répondu'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PROCTORING: preview locale */}
        <div className="mt-8 bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Aperçu caméra (visible uniquement par vous)</h3>
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded border" />
          <p className="mt-2 text-xs text-gray-500">
            La vidéo est transmise en direct à l’examinateur. Aucun enregistrement n’est effectué côté serveur.
          </p>
        </div>
      </div>
    </div>
  );
}
