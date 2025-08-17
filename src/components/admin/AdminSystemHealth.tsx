import React from 'react';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

type SystemHealthData = {
  [key: string]: string | number;
};

export function AdminSystemHealth({ data }: { data: SystemHealthData }) {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
          État du Système
        </h2>
      </div>
      <div className="p-6 space-y-4">
        {Object.entries(data).map(([key, value]) => {
          const stringValue = String(value); // Assure qu'on manipule une string
          const colorClass = getStatusColor(stringValue);

          return (
            <div key={key} className="flex items-center justify-between">
              <span className="text-gray-700 capitalize">{key.replace(/_/g, ' ')}</span>
              <div className="flex items-center">
                {key === 'cameraSystem' && (stringValue === 'warning' || stringValue === 'error') ? (
                  <AlertTriangle className={`h-5 w-5 mr-2 ${colorClass}`} />
                ) : (
                  <CheckCircle className={`h-5 w-5 mr-2 ${colorClass}`} />
                )}
                <span className={`font-medium ${colorClass}`}>
                  {stringValue}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
