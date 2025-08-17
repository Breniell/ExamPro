import React from 'react';
import { motion } from 'framer-motion';

const AuthCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <motion.div
      className="bg-white py-8 px-6 shadow-xl rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
};

export default AuthCard;
