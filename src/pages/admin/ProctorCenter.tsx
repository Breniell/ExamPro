// src/pages/admin/ProctorCenter.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { connectProctorSocket, iceServers } from '../../services/proctorSocket';
import { Monitor, Play, StopCircle, VideoOff, Camera, Users, Search } from 'lucide-react';

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
};

export default function AdminProctorCenter() {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [filter, setFilter] = useState('');
  const socketRef = useRef<ReturnType<typeof connectProctorSocket> | null>(null);

  const viewersRef = useRef<Map<string, ViewerState>>(new Map()); // key: sessionId
  const videoEls = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const sockToSession = useRef<Map<string, string>>(new Map());   // student socketId -> sessionId

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

        // Liste initiale
        sock.on('sessions-list', (list: Array<{ sessionId: string; students: number; admins: number; examTitle: string | null }>) => {
          if (!mounted) return;
          const now = Date.now();
          const map: Record<string, SessionMeta> = {};
          (list || []).forEach(item => {
            map[item.sessionId] = {
              sessionId: item.sessionId,
              examTitle: item.examTitle ?? null,
              studentName: null,
              online: (item.students || 0) > 0,
              students: item.students || 0,
              lastSeen: now,
            };
          });
          setSessions(map);
        });

        // Mises à jour live — le serveur envoie 'presence' (avec meta)
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
        });

        // OFFRE (étudiant -> admin)
        sock.on('webrtc-offer', async ({ from, sessionId, description }) => {
          try {
            let viewer = viewersRef.current.get(sessionId);
            if (!viewer) {
              const pc = new RTCPeerConnection({ iceServers: iceServers() });
              viewer = { pc, stream: null };
              viewersRef.current.set(sessionId, viewer);

              pc.ontrack = (ev) => {
                const stream = ev.streams?.[0] || new MediaStream([ev.track]);
                viewer!.stream = stream;
                const v = videoEls.current.get(sessionId);
                if (v) {
                  v.srcObject = stream;
                  v.play().catch(() => {});
                }
              };
              pc.onicecandidate = (ev) => {
                if (ev.candidate) {
                  socketRef.current?.emit('webrtc-ice-candidate', {
                    to: from,
                    candidate: ev.candidate,
                  });
                }
              };
            }

            await viewer.pc.setRemoteDescription(new RTCSessionDescription(description));
            const answer = await viewer.pc.createAnswer();
            await viewer.pc.setLocalDescription(answer);

            socketRef.current?.emit('webrtc-answer', {
              to: from,
              sessionId,
              description: viewer.pc.localDescription
            });

            // Map remote socket -> session pour les ICE suivants
            sockToSession.current.set(from, sessionId);
          } catch (err: any) {
            console.error(err);
            toast.error('Erreur de négociation WebRTC.');
          }
        });

        // ICE (étudiant -> admin) — le serveur envoie {from, candidate}
        sock.on('webrtc-ice-candidate', async ({ from, candidate }) => {
          const sessionId = sockToSession.current.get(from);
          if (!sessionId) return;
          const viewer = viewersRef.current.get(sessionId);
          if (viewer && candidate) {
            try { await viewer.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch (e) { console.warn('ICE add failed', e); }
          }
        });

        // Demander le seed initial
        sock.emit('list-sessions');
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Connexion au centre de contrôle impossible.');
      }
    })();

    return () => {
      mounted = false;
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
  }, []);

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
    if (!meta?.online) {
      toast.error('Candidat hors-ligne.');
      return;
    }
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
    // purge map socket->session pour cette session
    for (const [k, val] of sockToSession.current.entries()) {
      if (val === sessionId) sockToSession.current.delete(k);
    }
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
            <Camera className="h-4 w-4" />
            {connected ? 'Connecté' : 'Déconnecté'}
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700">
            <Users className="h-4 w-4" />
            {Object.values(sessions).filter(s => s.online).length} en ligne
          </div>
        </div>
      </header>

      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
        <Search className="h-5 w-5 text-gray-500" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Rechercher par étudiant / examen / sessionId…"
          className="flex-1 outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(meta => {
          const isPlaying = !!videoEls.current.get(meta.sessionId)?.srcObject;
          return (
            <div key={meta.sessionId} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{meta.studentName || 'Étudiant'}</div>
                  <div className="text-sm text-gray-600 truncate">{meta.examTitle || 'Examen'}</div>
                </div>
                <div className={`text-xs px-2 py-1 rounded-full ${meta.online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {meta.online ? `En ligne (${meta.students})` : 'Hors-ligne'}
                </div>
              </div>

              <div className="aspect-video bg-black grid place-items-center">
                <video
                  ref={(el) => { videoEls.current.set(meta.sessionId, el); }}
                  autoPlay
                  playsInline
                  controls={false}
                  muted={false}
                  className="w-full h-full object-contain bg-black"
                />
                {!isPlaying && (
                  <div className="absolute">
                    <VideoOff className="h-10 w-10 text-white/60" />
                  </div>
                )}
              </div>

              <div className="p-4 flex items-center justify-end gap-3">
                {!isPlaying ? (
                  <button
                    onClick={() => watchSession(meta.sessionId)}
                    disabled={!meta.online}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" /> Regarder
                  </button>
                ) : (
                  <button
                    onClick={() => stopViewing(meta.sessionId)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700"
                  >
                    <StopCircle className="h-4 w-4" /> Arrêter
                  </button>
                )}
              </div>

              <div className="px-4 pb-4 text-xs text-gray-500">
                Session: {meta.sessionId}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
