import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Activity,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle,
  FolderOpen
} from 'lucide-react';
import { getStoredCases, getApiHealth, getDbHealth } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import ActionBadge from '../components/ActionBadge';
import { TableSkeleton, CardSkeleton } from '../components/LoadingSkeleton';
import ErrorMessage from '../components/ErrorMessage';
import './Dashboard.css';

export default function Dashboard({ setTotalCount }) {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorType(null);

    // Check API and DB
    const [apiRes, dbRes, casesRes] = await Promise.all([
      getApiHealth(),
      getDbHealth(),
      getStoredCases(50)
    ]);

    if (!apiRes.ok) {
      setErrorType('api_offline');
      setErrorMessage(apiRes.error);
      setLoading(false);
      return;
    }

    if (casesRes.ok && casesRes.data) {
      setCases(casesRes.data);
      if (setTotalCount) {
        setTotalCount(casesRes.data.length);
      }
    } else {
      if (!dbRes.ok) {
        setErrorType('db_offline');
        setErrorMessage(dbRes.error);
      } else {
        setErrorType('general');
        setErrorMessage(casesRes.error);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Compute Metrics
  const totalCases = cases.length;
  const highRiskCases = cases.filter(
    (c) => (c.risk_level || '').toUpperCase() === 'HIGH'
  ).length;
  const medRiskCases = cases.filter(
    (c) => (c.risk_level || '').toUpperCase() === 'MEDIUM'
  ).length;
  const lowRiskCases = cases.filter(
    (c) => (c.risk_level || '').toUpperCase() === 'LOW'
  ).length;

  const avgRiskScore =
    totalCases > 0
      ? (
          cases.reduce((sum, c) => sum + (parseFloat(c.risk_score) || 0), 0) /
          totalCases
        ).toFixed(1)
      : '0.0';

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return 'Recent';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime())
        ? 'Recent'
        : d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="dashboard-page">
      {/* Top Banner / Welcome */}
      <div className="dashboard-welcome glass-card">
        <div className="welcome-text">
          <div className="welcome-tag">
            <span className="status-dot online pulse" />
            <span>Active Fraud Defense Engine</span>
          </div>
          <h2 className="welcome-title">ChargeShield Intelligence Overview</h2>
          <p className="welcome-desc">
            Real-time fraud surveillance, high-risk transaction triage, FAISS similarity retrieval, and RAG contextual explainability.
          </p>
        </div>
        <div className="welcome-actions">
          <Link to="/cases" className="btn btn-secondary">
            <FolderOpen size={14} />
            <span>Browse All Cases</span>
          </Link>
          <Link to="/analytics" className="btn btn-primary">
            <TrendingUp size={14} />
            <span>View Analytics</span>
          </Link>
        </div>
      </div>

      {/* Error state if API is down */}
      {errorType && (
        <ErrorMessage
          type={errorType}
          message={errorMessage}
          onRetry={fetchDashboardData}
        />
      )}

      {/* Summary KPI Cards Grid */}
      <div className="kpi-grid">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <div className="glass-card kpi-card kpi-total">
              <div className="kpi-top">
                <span className="kpi-label">Total Investigations</span>
                <div className="kpi-icon-wrap">
                  <FileText size={18} className="text-accent" />
                </div>
              </div>
              <div className="kpi-value">{totalCases}</div>
              <div className="kpi-subtext">Persisted in MongoDB Atlas</div>
            </div>

            <div className="glass-card kpi-card kpi-high">
              <div className="kpi-top">
                <span className="kpi-label">HIGH Risk</span>
                <div className="kpi-icon-wrap" style={{ color: 'var(--risk-high)' }}>
                  <ShieldAlert size={18} />
                </div>
              </div>
              <div className="kpi-value" style={{ color: 'var(--risk-high)' }}>
                {highRiskCases}
              </div>
              <div className="kpi-subtext">
                {totalCases > 0 ? Math.round((highRiskCases / totalCases) * 100) : 0}% of all investigations
              </div>
            </div>

            <div className="glass-card kpi-card kpi-med">
              <div className="kpi-top">
                <span className="kpi-label">MEDIUM Risk</span>
                <div className="kpi-icon-wrap" style={{ color: 'var(--risk-med)' }}>
                  <AlertTriangle size={18} />
                </div>
              </div>
              <div className="kpi-value" style={{ color: 'var(--risk-med)' }}>
                {medRiskCases}
              </div>
              <div className="kpi-subtext">Requires human evaluation</div>
            </div>

            <div className="glass-card kpi-card kpi-low">
              <div className="kpi-top">
                <span className="kpi-label">LOW Risk</span>
                <div className="kpi-icon-wrap" style={{ color: 'var(--risk-low)' }}>
                  <CheckCircle size={18} />
                </div>
              </div>
              <div className="kpi-value" style={{ color: 'var(--risk-low)' }}>
                {lowRiskCases}
              </div>
              <div className="kpi-subtext">Automated safe clearance</div>
            </div>
          </>
        )}
      </div>

      {/* Recent Investigations Table Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <div>
            <h3 className="section-title">Recent Investigations</h3>
            <p className="section-subtitle">
              Live case records retrieved from MongoDB with risk scores and recommendations
            </p>
          </div>
          <Link to="/cases" className="btn btn-secondary btn-sm">
            <span>View All ({cases.length})</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : cases.length === 0 ? (
          <div className="empty-state glass-card">
            <ShieldCheck size={40} className="empty-icon" />
            <h4>No Investigation Cases Found</h4>
            <p>No transactions have been recorded in MongoDB yet.</p>
            <button onClick={fetchDashboardData} className="btn btn-secondary btn-sm">
              Refresh
            </button>
          </div>
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
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.slice(0, 10).map((item) => {
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
                        <span className="mono font-semibold">
                          {fraudProb}
                        </span>
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
                          <span>View</span>
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
