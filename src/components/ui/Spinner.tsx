import React from 'react';

const Spinner: React.FC<{ size?: number }> = ({ size = 20 }) => {
  return (
    <div
      className="animate-spin rounded-full border-2 border-white border-t-transparent"
      style={{ width: size, height: size }}
    ></div>
  );
};

export default Spinner;
