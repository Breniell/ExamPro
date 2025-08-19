// src/pages/admin/ProctorCenter.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { connectProctorSocket, iceServers } from '../../services/proctorSocket';
import {
  Monitor, Play, StopCircle, VideoOff, Camera as CameraIcon, Users, Search,
  Maximize2, Volume2, VolumeX, Camera
} from 'lucide-react';
import { useLocation } from 'react-router-dom';

type SessionMeta = {
  sessionId: string;
  examTitle: string | null;
  studentName: string | null;
  online: boolean;
  students: number;
  lastSeen: number;
};

type ViewerState = {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  muted: boolean;
};

export default function AdminProctorCenter() {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [filter, setFilter] = useState('');
  const [gridCols, setGridCols] = useState<2 | 3>(2);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const socketRef = useRef<ReturnType<typeof connectProctorSocket> | null>(null);

  const viewersRef = useRef<Map<string, ViewerState>>(new Map()); // key: sessionId
  const videoEls = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const cardEls = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const sockToSession = useRef<Map<string, string>>(new Map());   // student socketId -> sessionId

  const location = useLocation();
  const watchQuery = new URLSearchParams(location.search).get('watch') || '';

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const me = await apiService.getCurrentUser();
        if (me?.role !== 'admin') {
          toast.error("Accès réservé à l'administrateur.");
          return;
        }
        const token = localStorage.getItem('token') || '';
        const sock = connectProctorSocket(token);
        socketRef.current = sock;

        sock.on('connect', () => mounted && setConnected(true));
        sock.on('disconnect', () => mounted && setConnected(false));
        sock.on('connect_error', (err: any) => {
          console.error('WS error', err);
          toast.error('Connexion WS impossible (proctor). Vérifiez VITE_WS_URL / CORS.');
        });

        sock.on('sessions-list', (list: Array<{ sessionId: string; students: number; admins: number; examTitle: string | null; studentName?: string|null }>) => {
          if (!mounted) return;
          const now = Date.now();
          const map: Record<string, SessionMeta> = {};
          (list || []).forEach(item => {
            map[item.sessionId] = {
              sessionId: item.sessionId,
              examTitle: item.examTitle ?? null,
              studentName: item.studentName ?? null,
              online: (item.students || 0) > 0,
              students: item.students || 0,
              lastSeen: now,
            };
          });
          setSessions(map);

          // ⬇️ auto-watch via ?watch=
          if (watchQuery && map[watchQuery]?.online) {
            setTimeout(() => watchSession(watchQuery), 0);
          }
        });

        sock.on('presence', (p: { sessionId: string; students: number; admins: number; meta?: { examTitle?: string|null; studentName?: string|null } }) => {
          setSessions(prev => {
            const now = Date.now();
            const cur = prev[p.sessionId];
            const next: SessionMeta = {
              sessionId: p.sessionId,
              examTitle: p.meta?.examTitle ?? cur?.examTitle ?? null,
              studentName: p.meta?.studentName ?? cur?.studentName ?? null,
              online: (p.students || 0) > 0,
              students: p.students || 0,
              lastSeen: now,
            };
            return { ...prev, [p.sessionId]: next };
          });

          if (watchQuery && p.sessionId === watchQuery && (p.students || 0) > 0) {
            setTimeout(() => watchSession(watchQuery), 0);
          }
        });

        sock.on('session-left', ({ sessionId }: { sessionId: string; socketId: string }) => {
          setSessions(prev => {
            const cur = prev[sessionId];
            if (!cur) return prev;
            return { ...prev, [sessionId]: { ...cur, online: false, students: 0, lastSeen: Date.now() } };
          });
          stopViewing(sessionId);
        });

        // OFFRE (étudiant -> admin) avec perfect negotiation (admin = polite)
        sock.on('webrtc-offer', async ({ from, sessionId, description }) => {
          try {
            // on ignore les trucs bizarres
            if (!description || description.type !== 'offer') return;

            let viewer = viewersRef.current.get(sessionId);
            if (!viewer) {
              const pc = new RTCPeerConnection({ iceServers: iceServers() });
              viewer = { pc, stream: null, muted: true };
              viewersRef.current.set(sessionId, viewer);

              pc.ontrack = (ev) => {
                if (!viewer!.stream) viewer!.stream = new MediaStream();
                // évite les doublons (même track ajoutée plusieurs fois)
                const already = viewer!.stream.getTracks().some(t => t.id === ev.track.id);
                if (!already) viewer!.stream.addTrack(ev.track);

                ev.track.onended = () => {
                  try {
                    viewer!.stream?.getTracks()
                      .filter(t => t.id === ev.track.id)
                      .forEach(t => viewer!.stream?.removeTrack(t));
                  } catch {}
                };

                const v = videoEls.current.get(sessionId);
                if (v) {
                  v.srcObject = viewer!.stream!;
                  v.muted = viewer!.muted;
                  v.play().catch(() => {});
                }
              };

              pc.onicecandidate = (ev) => {
                if (ev.candidate) {
                  socketRef.current?.emit('webrtc-ice-candidate', {
                    to: from, candidate: ev.candidate, sessionId
                  });
                }
              };

              pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                  // on ferme proprement si ça part en vrille
                  stopViewing(sessionId);
                }
              };
            }

            const pc = viewer.pc;
            const offer = new RTCSessionDescription(description);

            // --- perfect negotiation (admin = polite) ---
            const offerCollision = pc.signalingState !== 'stable';
            if (offerCollision) {
              // rollback avant de poser la nouvelle remote offer
              try {
                await Promise.all([
                  pc.setLocalDescription({ type: 'rollback' } as any),
                  pc.setRemoteDescription(offer),
                ]);
              } catch {
                // si rollback indispo/échoue, tente au moins la remote
                await pc.setRemoteDescription(offer);
              }
            } else {
              await pc.setRemoteDescription(offer);
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketRef.current?.emit('webrtc-answer', {
              to: from, sessionId, description: pc.localDescription
            });

            sockToSession.current.set(from, sessionId);
          } catch (err: any) {
            console.error(err);
            toast.error('Erreur de négociation WebRTC.');
          }
        });


        // ICE (étudiant -> admin)
        sock.on('webrtc-ice-candidate', async ({ from, candidate }) => {
          const sessionId = sockToSession.current.get(from);
          if (!sessionId) return;
          const viewer = viewersRef.current.get(sessionId);
          if (viewer && candidate) {
            try { await viewer.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch (e) { console.warn('ICE add failed', e); }
          }
        });

        // seed
        sock.emit('list-sessions');
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Connexion au centre de contrôle impossible.');
      }
    })();

    return () => {
      for (const [sid, v] of viewersRef.current.entries()) {
        try { v.pc.close(); } catch {}
        viewersRef.current.delete(sid);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      sockToSession.current.clear();
    };
  }, [watchQuery]);

  const filtered = useMemo(() => {
    const list = Object.values(sessions);
    if (!filter.trim()) return list.sort((a, b) => (b.lastSeen - a.lastSeen));
    const q = filter.toLowerCase();
    return list
      .filter(s =>
        (s.examTitle || '').toLowerCase().includes(q)
        || (s.studentName || '').toLowerCase().includes(q)
        || s.sessionId.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.lastSeen - a.lastSeen));
  }, [sessions, filter]);

  function watchSession(sessionId: string) {
    const meta = sessions[sessionId];
    if (!meta?.online) { toast.error('Candidat hors-ligne.'); return; }
    // ferme un viewer existant pour repartir propre
    stopViewing(sessionId);
    socketRef.current?.emit('watch-session', { sessionId });
  }

  function stopViewing(sessionId: string) {
    const viewer = viewersRef.current.get(sessionId);
    if (viewer) {
      try { viewer.pc.close(); } catch {}
      viewersRef.current.delete(sessionId);
    }
    const v = videoEls.current.get(sessionId);
    if (v) {
      const ms = v.srcObject as MediaStream | null;
      if (ms) ms.getTracks().forEach(t => t.stop());
      v.srcObject = null;
    }
    for (const [k, val] of sockToSession.current.entries()) {
      if (val === sessionId) sockToSession.current.delete(k);
    }
  }

  function toggleSelect(sessionId: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(sessionId)) n.delete(sessionId);
      else n.add(sessionId);
      return n;
    });
  }

  function watchSelected() {
    if (!selected.size) return;
    Array.from(selected).forEach(watchSession);
  }

  function stopAll() {
    for (const sid of viewersRef.current.keys()) stopViewing(sid);
  }

  function toggleMute(sessionId: string) {
    const viewer = viewersRef.current.get(sessionId);
    const v = videoEls.current.get(sessionId);
    if (viewer && v) {
      viewer.muted = !viewer.muted;
      v.muted = viewer.muted;
    }
  }

  async function fullScreen(sessionId: string) {
    const el = cardEls.current.get(sessionId);
    if (!el) return;
    try {
      // @ts-ignore
      if (document.fullscreenElement) await document.exitFullscreen();
      // @ts-ignore
      await el.requestFullscreen();
    } catch {}
  }

  function screenshot(sessionId: string) {
    const v = videoEls.current.get(sessionId);
    if (!v || !v.videoWidth) return toast.error('Flux vidéo indisponible.');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `screenshot_${sessionId}_${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Centre de contrôle — Surveillance</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${connected ? 'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}`}>
            <CameraIcon className="h-4 w-4" />
            {connected ? 'Connecté' : 'Déconnecté'}
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700">
            <Users className="h-4 w-4" />
            {Object.values(sessions).filter(s => s.online).length} en ligne
          </div>
        </div>
      </header>

      {/* Barre d'outils */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Search className="h-5 w-5 text-gray-500" />
          <input
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Rechercher par étudiant / examen / sessionId…"
            className="flex-1 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Mosaïque</label>
          <select
            value={gridCols}
            onChange={(e)=> setGridCols((Number(e.target.value) as 2|3))}
            className="text-sm border rounded px-2 py-1"
          >
            <option value={2}>2×2</option>
            <option value={3}>3×3</option>
          </select>
        </div>
        <button
          onClick={() => setSelectMode(s => !s)}
          className={`text-sm px-3 py-2 rounded ${selectMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}
        >
          {selectMode ? 'Sélection (ON)' : 'Sélection (OFF)'}
        </button>
        <button
          onClick={watchSelected}
          disabled={!selected.size}
          className="text-sm px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
        >
          Regarder sélection
        </button>
        <button onClick={stopAll} className="text-sm px-3 py-2 rounded bg-rose-600 text-white">
          Arrêter tout
        </button>
      </div>

      {/* Grille dynamique */}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0,1fr))` }}>
        {filtered.map(meta => {
          const isPlaying = !!videoEls.current.get(meta.sessionId)?.srcObject;
          const viewer = viewersRef.current.get(meta.sessionId);
          const isSelected = selected.has(meta.sessionId);

          return (
            <div
              key={meta.sessionId}
              ref={el => cardEls.current.set(meta.sessionId, el)}
              className="bg-white rounded-lg shadow overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">
                    {meta.studentName || 'Étudiant'}
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {meta.examTitle || 'Examen'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(meta.sessionId)}
                    />
                  )}
                  <div className={`text-xs px-2 py-1 rounded-full ${meta.online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {meta.online ? `En ligne (${meta.students})` : 'Hors-ligne'}
                  </div>
                </div>
              </div>

              <div className="aspect-video bg-black grid place-items-center relative">
                <video
                  ref={(el) => { videoEls.current.set(meta.sessionId, el); }}
                  autoPlay playsInline controls={false}
                  muted={viewer?.muted ?? true}
                  className="w-full h-full object-contain bg-black"
                />
                {!isPlaying && (
                  <div className="absolute">
                    <VideoOff className="h-10 w-10 text-white/60" />
                  </div>
                )}
              </div>

              <div className="p-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">Session: {meta.sessionId}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMute(meta.sessionId)}
                    className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    title={viewer?.muted ? 'Activer le son' : 'Couper le son'}
                  >
                    {viewer?.muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>

                  <button
                    onClick={() => fullScreen(meta.sessionId)}
                    className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    title="Plein écran"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => screenshot(meta.sessionId)}
                    className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    title="Capture d'écran"
                  >
                    <Camera className="h-4 w-4" />
                  </button>

                  {!isPlaying ? (
                    <button
                      onClick={() => watchSession(meta.sessionId)}
                      disabled={!meta.online}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" /> Regarder
                    </button>
                  ) : (
                    <button
                      onClick={() => stopViewing(meta.sessionId)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-600 text-white rounded-md hover:bg-rose-700"
                    >
                      <StopCircle className="h-4 w-4" /> Arrêter
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
