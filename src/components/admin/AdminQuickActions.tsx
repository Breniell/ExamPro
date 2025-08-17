// src/components/admin/AdminQuickActions.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Camera, AlertTriangle, TrendingUp } from 'lucide-react';

export function AdminQuickActions() {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions Rapides</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/admin/users')}
          className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Users className="h-8 w-8 text-blue-600 mr-3" />
          <div className="text-left">
            <h3 className="font-medium text-gray-900">Gérer Utilisateurs</h3>
            <p className="text-sm text-gray-600">CRUD utilisateurs</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/admin/surveillance')}
          className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Camera className="h-8 w-8 text-purple-600 mr-3" />
          <div className="text-left">
            <h3 className="font-medium text-gray-900">Surveillance</h3>
            <p className="text-sm text-gray-600">Caméras en direct</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/admin/settings')}
          className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <AlertTriangle className="h-8 w-8 text-red-600 mr-3" />
          <div className="text-left">
            <h3 className="font-medium text-gray-900">Alertes</h3>
            <p className="text-sm text-gray-600">Gestion sécurité</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/admin/reports')}
          className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <TrendingUp className="h-8 w-8 text-green-600 mr-3" />
          <div className="text-left">
            <h3 className="font-medium text-gray-900">Rapports</h3>
            <p className="text-sm text-gray-600">Analytics globales</p>
          </div>
        </button>
      </div>
    </div>
  );
}
