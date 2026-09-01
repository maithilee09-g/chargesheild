import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function RiskBadge({ level, showIcon = true, size = 'md' }) {
  const normLevel = (level || 'LOW').toUpperCase();

  const getIcon = () => {
    if (!showIcon) return null;
    switch (normLevel) {
      case 'HIGH':
        return <AlertCircle size={size === 'sm' ? 11 : 13} />;
      case 'MEDIUM':
        return <AlertTriangle size={size === 'sm' ? 11 : 13} />;
      case 'LOW':
      default:
        return <CheckCircle2 size={size === 'sm' ? 11 : 13} />;
    }
  };

  return (
    <span className={`badge-risk ${normLevel} ${size === 'sm' ? 'text-xs' : ''}`}>
      {getIcon()}
      <span>{normLevel}</span>
    </span>
  );
}
