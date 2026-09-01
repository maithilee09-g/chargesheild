import React from 'react';
import { Eye, ShieldAlert, Check, XCircle } from 'lucide-react';

export default function ActionBadge({ action }) {
  const normAction = (action || 'REVIEW').toUpperCase();

  const getIcon = () => {
    switch (normAction) {
      case 'MANUAL_INVESTIGATION':
        return <ShieldAlert size={12} />;
      case 'REVIEW':
        return <Eye size={12} />;
      case 'APPROVE':
        return <Check size={12} />;
      case 'DECLINE':
        return <XCircle size={12} />;
      default:
        return <Eye size={12} />;
    }
  };

  return (
    <span className={`badge-action ${normAction}`}>
      {getIcon()}
      <span>{normAction.replace('_', ' ')}</span>
    </span>
  );
}
