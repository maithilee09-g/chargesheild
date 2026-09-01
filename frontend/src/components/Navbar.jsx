import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ onToggleSidebar, onRefresh, isRefreshing, pageTitle, subtitle }) {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = React.useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      const clean = searchVal.trim().replace(/^[#\s]*(case_)?/i, '');
      navigate(`/cases/${clean}`);
      setSearchVal('');
    }
  };

  return (
    <header className="navbar-container">
      <div className="navbar-left">
        <button
          className="btn-icon mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle Navigation"
        >
          <Menu size={18} />
        </button>

        <div className="navbar-title-wrap">
          <h1 className="navbar-page-title">{pageTitle || 'Dashboard'}</h1>
          {subtitle && <span className="navbar-page-subtitle">{subtitle}</span>}
        </div>
      </div>

      <div className="navbar-right">
        {/* Quick Case ID Search */}
        <form onSubmit={handleSearch} className="navbar-search-form">
          <Search size={14} className="navbar-search-icon" />
          <input
            type="text"
            placeholder="Search Case ID (e.g. 3388943)..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="navbar-search-input mono"
          />
        </form>

        {onRefresh && (
          <button
            className={`btn-icon ${isRefreshing ? 'spinning' : ''}`}
            onClick={onRefresh}
            title="Refresh Data"
            disabled={isRefreshing}
          >
            <RefreshCw size={15} />
          </button>
        )}

        <div className="navbar-shield-badge">
          <ShieldCheck size={14} className="shield-green" />
          <span className="live-tag">Live Protection</span>
        </div>
      </div>
    </header>
  );
}
