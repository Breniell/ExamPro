// src/pages/admin/Surveillance.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, AlertTriangle, Loader2, ArrowRight, Wifi, WifiOff, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { connectProctorSocket } from '../../services/proctorSocket';
import { toast } from 'react-hot-toast';

type SecLog = {
  id: string;
  session_id: string;
  event_type: string;
  event_data: any;
  severity: 'low'|'medium'|'high';
  resolved: boolean;
  created_at: string;
};

type Presence = {
  sessionId: string;
  students: number;
  admins: number;
  meta?: { examTitle?: string|null; studentName?: string|null };
};

const getSeverityColor = (s: string) =>
  s === 'high' ? 'text-red-600 bg-red-100'
: s === 'medium' ? 'text-yellow-600 bg-yellow-100'
: s === 'low' ? 'text-blue-600 bg-blue-100'
: 'text-gray-600 bg-gray-100';

export default function AdminSurveillance() {
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const [alerts, setAlerts] = useState<SecLog[]>([]);
  const [alertsFilter, setAlertsFilter] =
    useState<'all'|'unresolved'|'resolved'|'high'|'medium'|'low'>('all');

  const [activeCount, setActiveCount] = useState(0);
  const sessionsMap = useRef<Record<string, number>>({}); // sessionId -> students count

  const socketRef = useRef<any>(null);
  const navigate = useNavigate();

  // Init: charge un snapshot (ex: 100 dernières) puis branche le live
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Hydrate initiale (récents d'abord) – ajuste la limite si besoin
        const initial = await apiService.getSecurityLogs({ limit: 100, order: 'desc' }).catch(() => []);
        if (!mounted) return;
        setAlerts(Array.isArray(initial) ? initial : []);
      } catch (e) {
        console.error(e);
        toast.error('Erreur de chargement des alertes.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // WebSocket proctor
    const token = localStorage.getItem('token') || '';
    const sock = connectProctorSocket(token);
    socketRef.current = sock;

    // Connexion
    sock.on('connect', () => {
      setWsConnected(true);
      // Seed des sessions
      sock.emit('list-sessions');
    });
    sock.on('disconnect', () => setWsConnected(false));

    // Liste complète à l'entrée
    sock.on('sessions-list', (list: Array<{ sessionId: string; students: number }>) => {
      const map: Record<string, number> = {};
      (list || []).forEach(x => { map[x.sessionId] = x.students || 0; });
      sessionsMap.current = map;
      recomputeActive();
    });

    // Présence live — pas besoin de re-demander la liste
    sock.on('presence', (p: Presence) => {
      sessionsMap.current[p.sessionId] = p.students || 0;
      recomputeActive();
    });

    // Nouvelle alerte live
    sock.on('security-log', (log: SecLog) => {
      setAlerts(prev => {
        // éviter doublons si même id
        if (prev.length && prev[0]?.id === log.id) return prev;
        return [log, ...prev].slice(0, 500); // garde au plus 500 en mémoire
      });
    });

    // Résolution live
    sock.on('security-log-resolved', ({ id, resolved }: { id: string; resolved: boolean }) => {
      setAlerts(prev => prev.map(a => (a.id === id ? { ...a, resolved } : a)));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcule nb sessions actives
  function recomputeActive() {
    const count = Object.values(sessionsMap.current).filter(n => (n || 0) > 0).length;
    setActiveCount(count);
  }

  // Filtrage
  const filteredAlerts = useMemo(() => {
    return (alerts || []).filter(a => {
      if (alertsFilter === 'all') return true;
      if (alertsFilter === 'unresolved') return !a.resolved;
      if (alertsFilter === 'resolved') return a.resolved;
      return a.severity === alertsFilter;
    });
  }, [alerts, alertsFilter]);

  // Résoudre
  const resolve = async (id: string) => {
    try {
      await apiService.resolveSecurityAlert(id);
      // l’évènement socket mettra à jour tout seul, mais on met un optimisme
      setAlerts(prev => prev.map(a => (a.id === id ? { ...a, resolved: true } : a)));
      toast.success('Alerte résolue');
    } catch {
      toast.error('Échec de résolution');
    }
  };

  // Regarder session directement (ouvre Proctor avec query ?watch=)
  function watchSession(sessionId: string) {
    navigate(`/admin/proctor?watch=${encodeURIComponent(sessionId)}`);
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Chargement…
      </div>
    );
  }

  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {wsConnected ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
              <Wifi className="h-4 w-4" /> Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-600 text-sm">
              <WifiOff className="h-4 w-4" /> Hors ligne
            </span>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Surveillance — Alertes & État</h1>
        </div>
        <Link
          to="/admin/proctor"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Camera className="h-4 w-4" /> Ouvrir le centre de contrôle <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Statistiques rapides (100% temps réel) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-emerald-500">
          <div className="text-sm text-gray-600">Sessions actives</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{activeCount}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <div className="text-sm text-gray-600">Alertes non résolues</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{unresolvedCount}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-indigo-500">
          <div className="text-sm text-gray-600">Total alertes (chargées)</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{alerts.length}</div>
        </div>
      </div>

      {/* Panneau alertes */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
            Alertes de sécurité (live)
          </h2>
          <select
            value={alertsFilter}
            onChange={e => setAlertsFilter(e.target.value as any)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">Toutes</option>
            <option value="unresolved">Non résolues</option>
            <option value="resolved">Résolues</option>
            <option value="high">Critiques</option>
            <option value="medium">Moyennes</option>
            <option value="low">Faibles</option>
          </select>
        </div>

        <div className="p-4 max-h-[32rem] overflow-y-auto space-y-3">
          {filteredAlerts.map(a => (
            <div key={a.id} className={`border rounded-lg p-3 ${a.resolved ? 'bg-gray-50 border-gray-200' : 'bg-white border-red-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(a.severity)}`}>
                  {a.severity === 'high' ? 'Critique' : a.severity === 'medium' ? 'Moyen' : 'Faible'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => watchSession(a.session_id)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    title="Regarder la session"
                  >
                    <Play className="h-3 w-3" /> Regarder
                  </button>
                  {a.resolved && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Résolu</span>
                  )}
                </div>
              </div>

              <div className="text-sm text-gray-900 mb-1">
                {a.event_type ? `Événement: ${a.event_type}` : 'Événement de sécurité'}
              </div>
              <div className="text-xs text-gray-600 mb-2">
                Session #{a.session_id} – {new Date(a.created_at).toLocaleString('fr-FR')}
              </div>

              {!a.resolved && (
                <button
                  onClick={() => resolve(a.id)}
                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                >
                  Marquer comme résolu
                </button>
              )}
            </div>
          ))}
          {filteredAlerts.length === 0 && (
            <div className="text-sm text-gray-500 p-2">Aucune alerte pour ce filtre.</div>
          )}
        </div>
      </div>
    </div>
  );
}
