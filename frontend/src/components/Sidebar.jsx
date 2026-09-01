import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  LayoutDashboard,
  Zap,
  FolderLock,
  BarChart3,
  Activity,
  Cpu,
  Database,
  Brain,
  Layers,
  Sparkles,
  Server
} from 'lucide-react';
import { getApiHealth, getDbHealth } from '../services/api';
import './Sidebar.css';

export default function Sidebar({ isOpen, onClose, totalCasesCount }) {
  const location = useLocation();

  const [statuses, setStatuses] = useState({
    api: 'checking',
    ml: 'online',
    faiss: 'online',
    rag: 'online',
    db: 'checking',
  });

  const checkStatus = async () => {
    const [apiRes, dbRes] = await Promise.all([
      getApiHealth(),
      getDbHealth()
    ]);

    setStatuses({
      api: apiRes.ok ? 'online' : 'offline',
      ml: apiRes.ok ? 'online' : 'offline',
      faiss: apiRes.ok ? 'online' : 'offline',
      rag: apiRes.ok ? 'online' : 'offline',
      db: dbRes.ok ? 'online' : 'offline',
    });
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (onClose) {
      onClose();
    }
  }, [location.pathname]);

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard size={18} />,
    },
    {
      to: '/investigate',
      label: 'Investigate',
      icon: <Zap size={16} />,
    },
    {
      to: '/cases',
      label: 'Cases',
      icon: <FolderLock size={16} />,
      count: totalCasesCount > 0 ? totalCasesCount : null
    },
    {
      to: '/analytics',
      label: 'Analytics',
      icon: <BarChart3 size={16} />,
    },
  ];

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar-container ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="brand-icon-wrap">
            <ShieldAlert size={22} />
          </div>
          <div className="brand-info">
            <div className="brand-title">
              ChargeShield <span className="brand-badge">AI</span>
            </div>
            <div className="brand-subtitle">Fraud Investigation Platform</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link-item ${isActive ? 'active' : ''}`
              }
              end={item.to === '/'}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== null && (
                <span className="nav-badge-count">{item.count}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* System Status Monitoring Panel */}
        <div className="sidebar-status-box">
          <div className="status-box-header">
            <div className="status-box-title">
              <Activity size={13} className="text-accent" />
              <span>System Status</span>
            </div>
            <span
              className={`status-dot ${
                statuses.api === 'online' ? 'online pulse' : 'offline'
              }`}
              title={statuses.api === 'online' ? 'All systems active' : 'Service degraded'}
            />
          </div>

          <div className="status-items-list">
            <div className="status-item">
              <div className="status-item-name">
                <Cpu size={12} />
                <span>ML Engine</span>
              </div>
              <span className={`status-state-pill ${statuses.ml}`}>
                <span className={`status-dot ${statuses.ml}`} />
                {statuses.ml === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="status-item">
              <div className="status-item-name">
                <Layers size={12} />
                <span>FAISS</span>
              </div>
              <span className={`status-state-pill ${statuses.faiss}`}>
                <span className={`status-dot ${statuses.faiss}`} />
                {statuses.faiss === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="status-item">
              <div className="status-item-name">
                <Brain size={12} />
                <span>RAG</span>
              </div>
              <span className={`status-state-pill ${statuses.rag}`}>
                <span className={`status-dot ${statuses.rag}`} />
                {statuses.rag === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="status-item">
              <div className="status-item-name">
                <Database size={12} />
                <span>MongoDB</span>
              </div>
              <span className={`status-state-pill ${statuses.db}`}>
                <span className={`status-dot ${statuses.db}`} />
                {statuses.db === 'online' ? 'Online' : statuses.db === 'checking' ? 'Checking...' : 'Offline'}
              </span>
            </div>

            <div className="status-item">
              <div className="status-item-name">
                <Server size={12} />
                <span>API</span>
              </div>
              <span className={`status-state-pill ${statuses.api}`}>
                <span className={`status-dot ${statuses.api}`} />
                {statuses.api === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
