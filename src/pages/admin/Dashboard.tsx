// src/pages/admin/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  Users,
  BookOpen,
  AlertTriangle,
  Camera as CameraIcon,
  Shield,
} from 'lucide-react';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';
import { AdminActiveExams } from '../../components/admin/AdminActiveExams';
import AdminChart from '../../components/admin/AdminChart';
import { AdminQuickActions } from '../../components/admin/AdminQuickActions';
import { AdminRecentAlerts } from '../../components/admin/AdminRecentAlerts';
import { AdminSystemHealth } from '../../components/admin/AdminSystemHealth';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({ totalUsers: 0, activeExams: 0, activeCameras: 0, securityAlerts: 0 });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [
          userList,
          examCountObj,
          camCountObj,
          secCountObj,
          recentAlerts,
          activeExams,
          healthStatus,
        ] = await Promise.all([
          apiService.getUsers().catch(() => []),
          apiService.getActiveExamsCount().catch(() => ({ count: 0 })),
          apiService.getActiveCamerasCount().catch(() => ({ count: 0 })),
          apiService.getSecurityAlertsCount().catch(() => ({ count: 0 })),
          apiService.getRecentAlerts().catch(() => []),
          apiService.getActiveExamsDetails().catch(() => []),
          apiService.getSystemHealth().catch(() => ({ status: 'UNKNOWN', timestamp: new Date().toISOString() })),
        ]);

        setStats({
          totalUsers: Array.isArray(userList) ? userList.length : Number(userList?.count || 0),
          activeExams: Number(examCountObj?.count || 0),
          activeCameras: Number(camCountObj?.count || 0),
          securityAlerts: Number(secCountObj?.count || 0),
        });

        setAlerts(Array.isArray(recentAlerts) ? recentAlerts : []);
        setExams(Array.isArray(activeExams) ? activeExams : []);
        setHealth(healthStatus || { status: 'UNKNOWN', timestamp: new Date().toISOString() });
      } catch (err: any) {
        console.error(err);
        toast.error('Erreur lors du chargement du dashboard.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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

      {/* Cartes statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <AdminStatCard title="Utilisateurs" icon={Users} count={stats.totalUsers} color="blue" />
        <AdminStatCard title="Examens Actifs" icon={BookOpen} count={stats.activeExams} color="green" />
        <AdminStatCard title="Alertes Sécurité" icon={AlertTriangle} count={stats.securityAlerts} color="red" />
        <AdminStatCard title="Caméras Actives" icon={CameraIcon} count={stats.activeCameras} color="purple" />
      </div>

      {/* Graphiques */}
      <AdminChart />

      {/* Santé système + alertes récentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSystemHealth data={health} />
        <AdminRecentAlerts alerts={alerts} />
      </div>

      {/* Examens actifs */}
      <AdminActiveExams exams={exams} />

      {/* Actions rapides */}
      <AdminQuickActions />
    </div>
  );
}
