import React from 'react';
import { AlertTriangle } from 'lucide-react';

type AlertItem = {
  id: string;
  session_id: string;
  event_type?: string;
  event_data?: any;
  severity: 'low' | 'medium' | 'high';
  created_at: string;
};

function pillColor(sev: string) {
  switch (sev) {
    case 'high': return 'text-red-600 bg-red-100';
    case 'medium': return 'text-yellow-600 bg-yellow-100';
    case 'low': return 'text-blue-600 bg-blue-100';
    default: return 'text-gray-600 bg-gray-100';
  }
}

export function AdminRecentAlerts({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
          Alertes Récentes
        </h2>
      </div>
      <div className="p-6 space-y-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-900 mb-1">
                  {alert.event_type ? `Événement: ${alert.event_type}` : 'Événement de sécurité'}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(alert.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${pillColor(alert.severity)}`}>
                {alert.severity === 'high' ? 'Critique' : alert.severity === 'medium' ? 'Moyen' : 'Info'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
