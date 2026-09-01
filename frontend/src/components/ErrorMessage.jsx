import React from 'react';
import { AlertTriangle, ServerOff, Database, SearchX, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import './ErrorMessage.css';

export default function ErrorMessage({
  type = 'general',
  title,
  message,
  onRetry,
  showBackToCases = false
}) {
  const getIcon = () => {
    switch (type) {
      case 'api_offline':
        return <ServerOff size={36} className="error-icon red" />;
      case 'db_offline':
        return <Database size={36} className="error-icon yellow" />;
      case 'not_found':
        return <SearchX size={36} className="error-icon blue" />;
      case 'empty':
        return <SearchX size={32} className="error-icon muted" />;
      default:
        return <AlertTriangle size={36} className="error-icon red" />;
    }
  };

  const defaultTitle = {
    api_offline: 'Backend API Offline',
    db_offline: 'MongoDB Database Unavailable',
    not_found: 'Investigation Case Not Found',
    empty: 'No Cases Found',
    general: 'Service Unavailable'
  }[type] || 'Error Occurred';

  const defaultMessage = {
    api_offline: 'Cannot connect to the ChargeShield FastAPI service at http://127.0.0.1:8000. Please ensure the backend server is running.',
    db_offline: 'MongoDB connection is currently unreachable. Historical cases and stored explanations may be temporarily limited.',
    not_found: 'The requested investigation case could not be located in MongoDB or the filesystem reports repository.',
    empty: 'No investigation cases matched your search query or filter criteria.',
    general: 'An error occurred while communicating with the intelligence engine.'
  }[type];

  return (
    <div className={`error-container glass-card ${type}`}>
      <div className="error-icon-box">{getIcon()}</div>
      <div className="error-content">
        <h3 className="error-title">{title || defaultTitle}</h3>
        <p className="error-message">{message || defaultMessage}</p>
        <div className="error-actions">
          {onRetry && (
            <button className="btn btn-primary btn-sm" onClick={onRetry}>
              <RefreshCw size={13} />
              <span>Retry Connection</span>
            </button>
          )}
          {showBackToCases && (
            <Link to="/cases" className="btn btn-secondary btn-sm">
              <ArrowLeft size={13} />
              <span>Back to Cases</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
