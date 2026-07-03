'use client';
import { useEffect, useState } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onClose, 300); }, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!message) return null;
  return (
    <div className={`toast ${type} ${visible ? 'show' : ''}`}>
      <i className={`fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
      <span>{message}</span>
    </div>
  );
}
