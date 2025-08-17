// src/pages/admin/Surveillance.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
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

const getSeverityColor = (s: string) =>
  s === 'high' ? 'text-red-600 bg-red-100'
: s === 'medium' ? 'text-yellow-600 bg-yellow-100'
: s === 'low' ? 'text-blue-600 bg-blue-100'
: 'text-gray-600 bg-gray-100';

export default function AdminSurveillance() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<SecLog[]>([]);
  const [alertsFilter, setAlertsFilter] =
    useState<'all'|'unresolved'|'resolved'|'high'|'medium'|'low'>('all');
  const [activeCount, setActiveCount] = useState(0);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    // 1) Charger alertes
    (async () => {
      try {
        const logs = await apiService.getSecurityLogs();
        if (!mounted) return;
        setAlerts(logs || []);
      } catch (e) {
        console.error(e);
        toast.error('Erreur de chargement des alertes.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // 2) WS pour compter les sessions actives
    const token = localStorage.getItem('token') || '';
    const sock = connectProctorSocket(token);
    socketRef.current = sock;

    sock.on('connect', () => {
      sock.emit('list-sessions');
    });

    // Seed + refresh via presence
    const refresh = () => sock.emit('list-sessions');

    sock.on('sessions-list', (list: Array<{ sessionId: string; students: number }>) => {
      const count = (list || []).filter(x => (x.students || 0) > 0).length;
      setActiveCount(count);
    });

    sock.on('presence', refresh);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      mounted = false;
    };
  }, []);

  const filteredAlerts = useMemo(() => {
    return (alerts || []).filter(a => {
      if (alertsFilter === 'all') return true;
      if (alertsFilter === 'unresolved') return !a.resolved;
      if (alertsFilter === 'resolved') return a.resolved;
      return a.severity === alertsFilter;
    });
  }, [alerts, alertsFilter]);

  const resolve = async (id: string) => {
    try {
      await apiService.resolveSecurityAlert(id);
      setAlerts(prev => prev.map(a => (a.id === id ? { ...a, resolved: true } : a)));
      toast.success('Alerte résolue');
    } catch {
      toast.error('Échec de résolution');
    }
  };

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
        <h1 className="text-2xl font-bold text-gray-900">Surveillance — Alertes & État</h1>
        <Link
          to="/admin/proctor"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Camera className="h-4 w-4" /> Ouvrir le centre de contrôle <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Statistiques rapides */}
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
          <div className="text-sm text-gray-600">Total alertes</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{alerts.length}</div>
        </div>
      </div>

      {/* Panneau alertes */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
            Alertes de sécurité
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
                {a.resolved && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Résolu</span>
                )}
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
