// src/pages/admin/Dashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Users, BookOpen, AlertTriangle, Camera as CameraIcon, Shield } from 'lucide-react';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';
import { AdminActiveExams } from '../../components/admin/AdminActiveExams';
import AdminChart from '../../components/admin/AdminChart';
import { AdminQuickActions } from '../../components/admin/AdminQuickActions';
import { AdminRecentAlerts } from '../../components/admin/AdminRecentAlerts';
import { AdminSystemHealth } from '../../components/admin/AdminSystemHealth';
import { connectProctorSocket } from '../../services/proctorSocket';

type WsSession = { sessionId: string; students: number; admins: number; examTitle: string|null; studentName?: string|null };

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({ totalUsers: 0, activeExams: 0, activeCameras: 0, securityAlerts: 0 });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const socketRef = useRef<ReturnType<typeof connectProctorSocket> | null>(null);
  const sessionsRef = useRef<Record<string, WsSession>>({});

  useEffect(() => {
    let mounted = true;

    const loadHttp = async () => {
      try {
        const [userList, alertsCountObj, recentAlerts, healthStatus, activeExamDetails] = await Promise.all([
          apiService.getUsers().catch(() => []),
          apiService.getSecurityAlertsCount().catch(() => ({ count: 0 })),
          apiService.getRecentAlerts(10).catch(() => []),
          apiService.getSystemHealth().catch(() => ({ status: 'UNKNOWN', timestamp: new Date().toISOString() })),
          apiService.getActiveExamsDetails().catch(() => []),
        ]);

        const totalUsers = Array.isArray(userList) ? userList.length : Number(userList?.count || 0);
        setStats((s: any) => ({ ...s, totalUsers, securityAlerts: Number(alertsCountObj?.count || 0) }));
        setAlerts(Array.isArray(recentAlerts) ? recentAlerts : []);
        setHealth(healthStatus || { status: 'UNKNOWN', timestamp: new Date().toISOString() });
        setExams(Array.isArray(activeExamDetails) ? activeExamDetails : []);
      } catch (err) {
        console.error(err);
        toast.error('Erreur lors du chargement du dashboard.');
      } finally {
        setLoading(false);
      }
    };

    loadHttp();

    // WS: recalcule en live activeCameras/activeExams
    const token = localStorage.getItem('token') || '';
    const sock = connectProctorSocket(token);
    socketRef.current = sock;

    const recompute = () => {
      const list = Object.values(sessionsRef.current);
      const actives = list.filter(s => (s.students || 0) > 0);
      const activeCameras = actives.length;
      const activeExams = new Set(actives.map(s => s.examTitle || s.sessionId)).size;
      setStats((s: any) => ({ ...s, activeCameras, activeExams }));
    };

    sock.on('connect', () => sock.emit('list-sessions'));
    sock.on('sessions-list', (list: WsSession[]) => {
      sessionsRef.current = {};
      (list || []).forEach(item => { sessionsRef.current[item.sessionId] = item; });
      recompute();
    });
    sock.on('presence', (p: WsSession & { meta?: { examTitle?: string|null; studentName?: string|null } }) => {
      const cur = sessionsRef.current[p.sessionId] || { sessionId: p.sessionId, students: 0, admins: 0, examTitle: null };
      sessionsRef.current[p.sessionId] = {
        ...cur,
        students: p.students,
        admins: p.admins,
        examTitle: p.meta?.examTitle ?? cur.examTitle ?? null,
        studentName: p.meta?.studentName ?? cur.studentName ?? null,
      };
      recompute();
    });

    const pollId = setInterval(async () => {
      try {
        const [alertsCountObj, recentAlerts, healthStatus] = await Promise.all([
          apiService.getSecurityAlertsCount().catch(() => ({ count: stats.securityAlerts })),
          apiService.getRecentAlerts(10).catch(() => alerts),
          apiService.getSystemHealth().catch(() => health),
        ]);
        setStats((s: any) => ({ ...s, securityAlerts: Number(alertsCountObj?.count || s.securityAlerts) }));
        setAlerts(Array.isArray(recentAlerts) ? recentAlerts : alerts);
        setHealth(healthStatus || health);
      } catch {}
    }, 15000);

    return () => {
      clearInterval(pollId);
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Shield className="w-8 h-8 animate-pulse text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Administrateur</h1>
        <div className="flex items-center space-x-2 text-green-600">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-medium">Système sécurisé</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <AdminStatCard title="Utilisateurs" icon={Users} count={stats.totalUsers} color="blue" />
        <AdminStatCard title="Examens Actifs" icon={BookOpen} count={stats.activeExams} color="green" />
        <AdminStatCard title="Alertes Sécurité" icon={AlertTriangle} count={stats.securityAlerts} color="red" />
        <AdminStatCard title="Caméras Actives" icon={CameraIcon} count={stats.activeCameras} color="purple" />
      </div>

      <AdminChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSystemHealth data={health} />
        <AdminRecentAlerts alerts={alerts} />
      </div>

      <AdminActiveExams exams={exams} />

      <AdminQuickActions />
    </div>
  );
}
