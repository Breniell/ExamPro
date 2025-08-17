import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  count: number;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'red' | 'purple';
}

const colorMap = {
  blue: 'text-blue-600 border-blue-500',
  green: 'text-green-600 border-green-500',
  red: 'text-red-600 border-red-500',
  purple: 'text-purple-600 border-purple-500',
};

export function AdminStatCard({ title, count, icon: Icon, color }: Props) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow border-l-4 ${colorMap[color]}`}>
      <div className="flex items-center">
        <Icon className={`h-8 w-8 ${colorMap[color].split(' ')[0]}`} />
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{count}</p>
        </div>
      </div>
    </div>
  );
}
