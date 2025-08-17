// src/components/ui/Loader.tsx
import React from 'react';

const Loader: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#6366F1' }) => {
  return (
    <div
      className="animate-spin rounded-full border-2 border-t-transparent"
      style={{
        width: size,
        height: size,
        borderColor: color,
        borderTopColor: 'transparent',
      }}
    />
  );
};

export default Loader;
