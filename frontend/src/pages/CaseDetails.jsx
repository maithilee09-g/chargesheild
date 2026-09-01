import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  Brain,
  Sparkles,
  Layers,
  Fingerprint,
  TrendingUp,
  FileCheck2,
  AlertOctagon,
  ExternalLink,
  Info,
  Calendar,
  CreditCard,
  Smartphone,
  MapPin,
  Clock,
  Zap,
  CheckCircle2,
  HelpCircle,
  FileDown,
  Share2,
  Activity
} from 'lucide-react';
import {
  getCaseDetails,
  getSimilarCases,
  getRagExplanation,
  getCaseNetwork,
  getCaseSuspiciousFactors,
  getCaseEvidenceStrength
} from '../services/api';
import { generateInvestigationReportPdf } from '../services/reportGenerator';
import RiskBadge from '../components/RiskBadge';
import ActionBadge from '../components/ActionBadge';
import { DetailsSkeleton } from '../components/LoadingSkeleton';
import ErrorMessage from '../components/ErrorMessage';
import FraudNetworkSummary from '../components/FraudNetworkSummary';
import FraudNetworkGraph from '../components/FraudNetworkGraph';
import SuspiciousFactors from '../components/SuspiciousFactors';
import EvidenceStrengthCard from '../components/EvidenceStrengthCard';
import InvestigatorCopilot from '../components/InvestigatorCopilot';
import './CaseDetails.css';

export default function CaseDetails() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [similarCases, setSimilarCases] = useState([]);
  const [ragData, setRagData] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [factorsData, setFactorsData] = useState(null);
  const [strengthData, setStrengthData] = useState(null);
  const [error, setError] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  const handleDownloadReport = async () => {
    if (!caseData || generatingPdf) return;
    try {
      setGeneratingPdf(true);
      await generateInvestigationReportPdf({
        caseData,
        similarCases,
        ragData,
        networkData,
        factorsData,
        strengthData
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3500);
    } catch (err) {
      console.error('Error generating PDF report:', err);
      alert('Failed to generate PDF report: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Evidence attributes list
  const EVIDENCE_KEYS = [
    'TransactionAmt',
    'ProductCD',
    'card1',
    'card4',
    'card6',
    'P_emaildomain',
    'R_emaildomain',
    'DeviceType',
    'DeviceInfo',
    'addr1',
    'addr2',
    'dist1',
    'dist2',
    'Transaction_hour',
    'Transaction_day',
    'missing_count',
    'missing_ratio'
  ];

  const loadCaseInformation = async () => {
    setLoading(true);
    setError(null);

    const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');

    try {
      // 1. Fetch Primary Case Details
      const caseRes = await getCaseDetails(cleanId);
      if (!caseRes.ok || !caseRes.data) {
        setError(`Investigation Case #${cleanId} was not found in the database or filesystem.`);
        setLoading(false);
        return;
      }
      setCaseData(caseRes.data);

      // 2. Parallel fetch of all intelligence layers: Similar, RAG, Network, Factors, Evidence Strength
      const [similarRes, ragRes, netRes, facRes, strRes] = await Promise.all([
        getSimilarCases(cleanId, 5),
        getRagExplanation(cleanId, 5),
        getCaseNetwork(cleanId),
        getCaseSuspiciousFactors(cleanId),
        getCaseEvidenceStrength(cleanId)
      ]);

      if (similarRes.ok) setSimilarCases(similarRes.data || []);
      if (ragRes.ok && ragRes.data) setRagData(ragRes.data);
      if (netRes.ok && netRes.data) setNetworkData(netRes.data);
      if (facRes.ok && facRes.data) setFactorsData(facRes.data);
      if (strRes.ok && strRes.data) setStrengthData(strRes.data);
    } catch (err) {
      setError(err.message || 'Error loading case intelligence dossier');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCaseInformation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [caseId]);

  if (loading) {
    return (
      <div className="case-details-page">
        <DetailsSkeleton />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="case-details-page">
        <ErrorMessage
          type="not_found"
          title={`Case #${caseId} Not Found`}
          message={error || 'The requested investigation case does not exist.'}
          showBackToCases={true}
          onRetry={loadCaseInformation}
        />
      </div>
    );
  }

  // Extract structured values
  const cleanId = String(caseData.transaction_id || caseData.case_id || caseId).replace(/^[#\s]*(case_)?/i, '');
  const riskScore = parseFloat(caseData.risk_score || 0).toFixed(2);
  const fraudProbability = caseData.fraud_probability !== undefined
    ? (parseFloat(caseData.fraud_probability) * 100).toFixed(2)
    : riskScore;
  const riskLevel = (caseData.risk_level || 'HIGH').toUpperCase();
  const recommendedAction = caseData.recommended_action || 'MANUAL_INVESTIGATION';

  const networkRiskScore = networkData?.network_risk_score ? parseFloat(networkData.network_risk_score).toFixed(2) : riskScore;
  const networkRiskLevel = (networkData?.network_risk_level || riskLevel).toUpperCase();

  // Evidence map
  const evidence = caseData.transaction_evidence || caseData.features || {};

  // Formatter for evidence values
  const formatEvidenceValue = (key, val) => {
    if (val === undefined || val === null || val === '') return 'Unknown';
    if (key === 'TransactionAmt') {
      return `$${parseFloat(val).toFixed(3)}`;
    }
    if (key === 'missing_ratio') {
      return `${(parseFloat(val) * 100).toFixed(2)}%`;
    }
    return String(val);
  };

  return (
    <div className="case-details-page">
      {/* Top Breadcrumb Navigation & Download Report Button */}
      <div className="details-nav-bar">
        <Link to="/cases" className="btn btn-secondary btn-sm back-link">
          <ArrowLeft size={14} />
          <span>Back to Cases</span>
        </Link>
        <div className="details-nav-actions">
          <button
            type="button"
            className={`btn btn-primary btn-sm download-report-btn ${generatingPdf ? 'loading' : ''} ${pdfSuccess ? 'success' : ''}`}
            onClick={handleDownloadReport}
            disabled={generatingPdf}
            title="Generate and download a comprehensive PDF Fraud Investigation Report"
          >
            {generatingPdf ? (
              <>
                <span className="btn-spinner" />
                <span>Generating PDF Report...</span>
              </>
            ) : pdfSuccess ? (
              <>
                <CheckCircle2 size={14} />
                <span>Report Downloaded!</span>
              </>
            ) : (
              <>
                <FileDown size={14} />
                <span>Download Investigation Report</span>
              </>
            )}
          </button>
          <div className="case-meta-tags">
            <span className="meta-tag mono">ID: #{cleanId}</span>
            <span className="meta-tag">Status: Verified</span>
          </div>
        </div>
      </div>

      {/* 1. Risk Score / Decision / Network Risk Header Banner */}
      <div className={`glass-card risk-header-banner ${riskLevel.toLowerCase()}`}>
        <div className="header-badge-col">
          <div className="risk-level-display">
            <span className="risk-tag">CHARGESHIELD AI • TRANSACTION INVESTIGATION</span>
            <h2 className="case-title-heading mono">Case #{cleanId}</h2>
          </div>
          <div className="badges-row">
            <RiskBadge level={riskLevel} size="lg" />
            <ActionBadge action={recommendedAction} />
          </div>
        </div>

        <div className="header-metrics-col">
          {/* Risk Score */}
          <div className="metric-box">
            <span className="metric-label">Risk Score</span>
            <div className="metric-value-row">
              <span className={`metric-big-val mono ${riskLevel.toLowerCase()}`}>
                {riskScore}
              </span>
              <span className="metric-denom">/ 100</span>
            </div>
            <span className="metric-sub">XGBoost ML Score</span>
          </div>

          <div className="metric-divider" />

          {/* Decision */}
          <div className="metric-box">
            <span className="metric-label">Decision</span>
            <div className="action-pill-val mono">
              {recommendedAction}
            </div>
            <span className="metric-sub">Protocol Action</span>
          </div>

          <div className="metric-divider" />

          {/* Network Risk */}
          <div className="metric-box">
            <span className="metric-label">Network Risk</span>
            <div className="metric-value-row">
              <span className={`metric-big-val mono ${networkRiskLevel.toLowerCase()}`}>
                {networkRiskLevel}
              </span>
              <span className="metric-denom mono" style={{ fontSize: '12px' }}>({networkRiskScore})</span>
            </div>
            <span className="metric-sub">Fraud Ring Linkage</span>
          </div>
        </div>
      </div>

      {/* 2. FEATURE 3 — WHY IS THIS TRANSACTION SUSPICIOUS? */}
      <SuspiciousFactors factorsData={factorsData} loading={false} />

      {/* 3. FEATURE 1 & 2 — FRAUD NETWORK DETECTION & INTERACTIVE GRAPH */}
      <div className="network-section-container">
        <FraudNetworkSummary networkData={networkData} loading={false} />
        <FraudNetworkGraph networkData={networkData} currentCaseId={cleanId} />
      </div>

      {/* 4. FEATURE 4 — EVIDENCE STRENGTH (0-100%) */}
      <EvidenceStrengthCard strengthData={strengthData} loading={false} />

      {/* 5. TRANSACTION EVIDENCE TABLE */}
      <div className="glass-card evidence-card">
        <div className="card-header-simple">
          <div className="card-header-icon blue">
            <Fingerprint size={16} />
          </div>
          <div>
            <h3 className="card-title">Transaction Evidence</h3>
            <p className="card-subtitle">Verified behavioral, identity, card, and environmental parameters</p>
          </div>
        </div>

        <div className="evidence-grid">
          {EVIDENCE_KEYS.map((key) => {
            const rawVal = evidence[key];
            const displayVal = formatEvidenceValue(key, rawVal);
            const isMissingOrUnknown = displayVal === 'Unknown';

            return (
              <div key={key} className="evidence-item">
                <span className="evidence-key mono">{key}</span>
                <span className={`evidence-val mono ${isMissingOrUnknown ? 'muted' : 'highlight'}`}>
                  {displayVal}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. RAG / SUPPORTING HISTORICAL EVIDENCE */}
      <div className="glass-card similar-cases-card">
        <div className="card-header-simple">
          <div className="card-header-icon green">
            <Layers size={16} />
          </div>
          <div>
            <h3 className="card-title">RAG Precedents & Supporting Evidence</h3>
            <p className="card-subtitle">
              Closest historical cases retrieved from the dense vector index via FAISS
            </p>
          </div>
        </div>

        {similarCases.length === 0 ? (
          <div className="empty-substate">
            <Info size={18} className="text-muted" />
            <p>No historical precedent cases indexed for this transaction vector.</p>
          </div>
        ) : (
          <div className="similar-cases-table-wrap">
            <table className="similar-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Similarity Match</th>
                  <th>Risk Score</th>
                  <th>Risk Level</th>
                  <th>Prior Action</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {similarCases.map((sc, idx) => {
                  const scId = String(sc.case_id || sc.transaction_id || '').replace(/^[#\s]*(case_)?/i, '');
                  const simPct = sc.similarity_pct || (sc.similarity_score ? `${Math.round(sc.similarity_score * 100)}%` : '85%');
                  const scScore = sc.risk_score !== undefined ? parseFloat(sc.risk_score).toFixed(2) : 'N/A';
                  const scLevel = (sc.risk_level || 'HIGH').toUpperCase();
                  const scAction = sc.recommended_action || 'MANUAL_INVESTIGATION';

                  return (
                    <tr key={idx}>
                      <td className="mono case-link-cell">
                        <Link to={`/cases/${scId}`} className="table-case-link">
                          #{scId}
                        </Link>
                      </td>
                      <td>
                        <div className="sim-match-pill mono">
                          <span className="sim-dot" />
                          <span>{simPct} Match</span>
                        </div>
                      </td>
                      <td className="mono">{scScore}</td>
                      <td>
                        <RiskBadge level={scLevel} size="sm" />
                      </td>
                      <td>
                        <ActionBadge action={scAction} size="sm" />
                      </td>
                      <td>
                        <Link
                          to={`/cases/${scId}`}
                          className="btn btn-secondary btn-xs"
                          title="View Case Intelligence"
                        >
                          <span>Inspect</span>
                          <ExternalLink size={10} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. FEATURE 5 — INVESTIGATOR COPILOT (ASK CHARGESHIELD) */}
      <InvestigatorCopilot
        caseId={cleanId}
        caseData={caseData}
        networkData={networkData}
        similarCases={similarCases}
        ragData={ragData}
      />
    </div>
  );
}
