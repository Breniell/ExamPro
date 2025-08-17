import React, { useEffect, useState } from 'react';

const Toast: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setMessage(e.detail);
      setTimeout(() => setMessage(null), 4000);
    };

    window.addEventListener('toast', handler as EventListener);

    return () => {
      window.removeEventListener('toast', handler as EventListener);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed top-6 right-6 z-50">
      <div className="bg-green-100 text-green-800 px-4 py-3 rounded-md shadow-md text-sm animate-fade-in-out">
        {message}
      </div>
    </div>
  );
};

export default Toast;
