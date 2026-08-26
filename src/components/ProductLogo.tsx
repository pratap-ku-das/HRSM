import React from 'react';

export const ProductLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img src="/orbithr-logo.png" alt="OrbitHR" className={`block object-contain ${className}`} />
);
