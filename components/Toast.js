'use client';
import { useEffect, useState } from 'react';

export default function Toast({ message, type = 'success' }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const closeTimer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(closeTimer);
  }, [message]);
  if (!message) return null;
  return (
    <div className={`toast ${type} ${visible ? 'show' : ''}`}>
      <i className={`fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
      <span>{message}</span>
    </div>
  );
}
