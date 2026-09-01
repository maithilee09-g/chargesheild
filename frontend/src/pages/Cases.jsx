import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  ArrowUpDown,
  FolderLock,
  ArrowRight,
  RefreshCw,
  Clock,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { getStoredCases, getDbHealth } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import ActionBadge from '../components/ActionBadge';
import { TableSkeleton } from '../components/LoadingSkeleton';
import ErrorMessage from '../components/ErrorMessage';
import './Cases.css';

export default function Cases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('ALL');
  const [sortOption, setSortOption] = useState('score-desc');

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    const res = await getStoredCases(100);
    if (res.ok) {
      setCases(res.data);
    } else {
      setError(res.error || 'Failed to load cases');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // Filter and Sort cases
  const filteredAndSortedCases = useMemo(() => {
    let result = [...cases];

    // 1. Search Query (Case ID / Tx ID)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^[#\s]*(case_)?/i, '');
      result = result.filter((item) => {
        const idStr = String(item.case_id || item.transaction_id || '').toLowerCase();
        const actionStr = String(item.recommended_action || '').toLowerCase();
        return idStr.includes(q) || actionStr.includes(q);
      });
    }

    // 2. Risk Level Filter
    if (selectedRisk !== 'ALL') {
      result = result.filter(
        (item) => (item.risk_level || '').toUpperCase() === selectedRisk
      );
    }

    // 3. Sorting
    result.sort((a, b) => {
      const scoreA = parseFloat(a.risk_score || 0);
      const scoreB = parseFloat(b.risk_score || 0);
      const idA = parseInt(String(a.case_id || a.transaction_id).replace(/\D/g, '')) || 0;
      const idB = parseInt(String(b.case_id || b.transaction_id).replace(/\D/g, '')) || 0;

      switch (sortOption) {
        case 'score-desc':
          return scoreB - scoreA;
        case 'score-asc':
          return scoreA - scoreB;
        case 'id-desc':
          return idB - idA;
        case 'id-asc':
          return idA - idB;
        default:
          return scoreB - scoreA;
      }
    });

    return result;
  }, [cases, searchQuery, selectedRisk, sortOption]);

  const formatDate = (isoString) => {
    if (!isoString) return 'Recent';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime())
        ? 'Recent'
        : d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="cases-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <FolderLock size={22} className="text-accent" />
            <span>Investigation Cases</span>
          </h2>
          <p className="page-subtitle">
            Search, filter, and inspect stored fraud dossiers and model risk assessments
          </p>
        </div>

        <div className="header-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchCases}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            <span>Refresh Cases</span>
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage
          type="db_offline"
          message={error}
          onRetry={fetchCases}
        />
      )}

      {/* Control Bar: Search, Filter Tabs, Sort */}
      <div className="cases-controls-bar glass-card">
        {/* Search Input */}
        <div className="cases-search-box">
          <Search size={15} className="control-icon" />
          <input
            type="text"
            placeholder="Search Case ID (e.g. 3388943)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="control-input mono"
          />
          {searchQuery && (
            <button
              className="clear-btn"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {/* Risk Level Filter Tabs */}
        <div className="risk-filter-group">
          {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((risk) => (
            <button
              key={risk}
              className={`risk-filter-tab ${selectedRisk === risk ? 'active' : ''} ${risk.toLowerCase()}`}
              onClick={() => setSelectedRisk(risk)}
            >
              {risk === 'ALL' ? 'All Risks' : `${risk} Risk`}
              <span className="filter-tab-count">
                {risk === 'ALL'
                  ? cases.length
                  : cases.filter((c) => (c.risk_level || '').toUpperCase() === risk).length}
              </span>
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="sort-box">
          <ArrowUpDown size={14} className="control-icon" />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="control-select"
          >
            <option value="score-desc">Risk Score: Highest First</option>
            <option value="score-asc">Risk Score: Lowest First</option>
            <option value="id-desc">Case ID: Newest First</option>
            <option value="id-asc">Case ID: Oldest First</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="cases-table-section">
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filteredAndSortedCases.length === 0 ? (
          <ErrorMessage
            type="empty"
            title="No Matching Cases"
            message={
              searchQuery || selectedRisk !== 'ALL'
                ? `No cases found matching "${searchQuery}" with risk level "${selectedRisk}". Try resetting filters.`
                : 'No investigation cases are currently stored in MongoDB.'
            }
          />
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Risk Score</th>
                  <th>Fraud Probability</th>
                  <th>Risk Level</th>
                  <th>Recommended Action</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedCases.map((item) => {
                  const caseId = item.case_id || item.transaction_id;
                  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
                  const score = parseFloat(item.risk_score || 0).toFixed(2);
                  const fraudProb = item.fraud_probability !== undefined
                    ? `${(parseFloat(item.fraud_probability) * 100).toFixed(2)}%`
                    : `${score}%`;

                  return (
                    <tr
                      key={cleanId}
                      onClick={() => navigate(`/cases/${cleanId}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="case-id-cell mono">
                          #{cleanId}
                        </span>
                      </td>
                      <td>
                        <span className="mono score-cell font-semibold">
                          {score} <span className="score-denom">/ 100</span>
                        </span>
                      </td>
                      <td>
                        <span className="mono font-semibold">{fraudProb}</span>
                      </td>
                      <td>
                        <RiskBadge level={item.risk_level} />
                      </td>
                      <td>
                        <ActionBadge action={item.recommended_action} />
                      </td>
                      <td>
                        <span className="date-cell">
                          <Clock size={12} className="text-muted" />
                          {formatDate(item.created_at)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/cases/${cleanId}`);
                          }}
                        >
                          <span>View Case</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
