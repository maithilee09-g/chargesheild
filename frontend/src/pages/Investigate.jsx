import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Brain,
  Layers,
  Fingerprint,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Info,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { analyzeTransaction } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import ActionBadge from '../components/ActionBadge';
import ErrorMessage from '../components/ErrorMessage';
import FraudNetworkSummary from '../components/FraudNetworkSummary';
import FraudNetworkGraph from '../components/FraudNetworkGraph';
import SuspiciousFactors from '../components/SuspiciousFactors';
import EvidenceStrengthCard from '../components/EvidenceStrengthCard';
import InvestigatorCopilot from '../components/InvestigatorCopilot';
import './Investigate.css';
import './CaseDetails.css';

export default function Investigate() {
  const navigate = useNavigate();

  // Initial Form State
  const initialFormState = {
    transaction_id: '',
    TransactionAmt: '42.294',
    ProductCD: 'C',
    card1: '13335',
    card4: 'mastercard',
    card6: 'credit',
    P_emaildomain: 'hotmail.com',
    R_emaildomain: 'hotmail.com',
    DeviceType: 'mobile',
    DeviceInfo: 'SM-A300H Build/LRX22G',
    addr1: 'Unknown',
    addr2: 'Unknown',
    dist1: 'Unknown',
    dist2: 'Unknown',
    Transaction_hour: '7',
    Transaction_day: '117'
  };

  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Preset templates
  const applyPreset = (type) => {
    setError(null);
    setResult(null);

    if (type === 'high_risk') {
      setFormData({
        transaction_id: '',
        TransactionAmt: '689.50',
        ProductCD: 'C',
        card1: '13335',
        card4: 'mastercard',
        card6: 'credit',
        P_emaildomain: 'hotmail.com',
        R_emaildomain: 'anonymous.com',
        DeviceType: 'mobile',
        DeviceInfo: 'SM-A300H Build/LRX22G',
        addr1: 'Unknown',
        addr2: 'Unknown',
        dist1: 'Unknown',
        dist2: 'Unknown',
        Transaction_hour: '3',
        Transaction_day: '142'
      });
    } else if (type === 'medium_risk') {
      setFormData({
        transaction_id: '',
        TransactionAmt: '125.00',
        ProductCD: 'W',
        card1: '9500',
        card4: 'visa',
        card6: 'credit',
        P_emaildomain: 'gmail.com',
        R_emaildomain: 'hotmail.com',
        DeviceType: 'mobile',
        DeviceInfo: 'iOS 17.4',
        addr1: '299',
        addr2: '87',
        dist1: '14',
        dist2: 'Unknown',
        Transaction_hour: '11',
        Transaction_day: '88'
      });
    } else if (type === 'low_risk') {
      setFormData({
        transaction_id: '',
        TransactionAmt: '28.90',
        ProductCD: 'W',
        card1: '4452',
        card4: 'visa',
        card6: 'debit',
        P_emaildomain: 'gmail.com',
        R_emaildomain: 'gmail.com',
        DeviceType: 'desktop',
        DeviceInfo: 'Windows 11',
        addr1: '315',
        addr2: '87',
        dist1: '5',
        dist2: '0',
        Transaction_hour: '14',
        Transaction_day: '65'
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    // Validate TransactionAmt
    if (!formData.TransactionAmt || isNaN(parseFloat(formData.TransactionAmt))) {
      setError('Please enter a valid numeric Transaction Amount.');
      setLoading(false);
      return;
    }

    // Build Payload
    const payload = {
      transaction_id: formData.transaction_id.trim() ? formData.transaction_id.trim() : undefined,
      transaction_data: {
        TransactionAmt: parseFloat(formData.TransactionAmt),
        ProductCD: formData.ProductCD,
        card1: isNaN(parseInt(formData.card1)) ? formData.card1 : parseInt(formData.card1),
        card4: formData.card4,
        card6: formData.card6,
        P_emaildomain: formData.P_emaildomain,
        R_emaildomain: formData.R_emaildomain,
        DeviceType: formData.DeviceType,
        DeviceInfo: formData.DeviceInfo,
        addr1: formData.addr1,
        addr2: formData.addr2,
        dist1: formData.dist1,
        dist2: formData.dist2,
        Transaction_hour: parseInt(formData.Transaction_hour) || 0,
        Transaction_day: parseInt(formData.Transaction_day) || 1,
        missing_count: (formData.addr1 === 'Unknown' ? 1 : 0) + (formData.dist1 === 'Unknown' ? 1 : 0),
        missing_ratio: 0.15
      }
    };

    try {
      const response = await analyzeTransaction(payload);
      if (response.ok && response.data) {
        setResult(response.data);
      } else {
        setError(response.error || 'Failed to complete transaction investigation.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during investigation.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setFormData(initialFormState);
  };

  return (
    <div className="investigate-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Zap size={20} className="text-accent" />
            <span>Investigate Transaction</span>
          </h2>
          <p className="page-subtitle">
            Enter transaction parameters to execute ML risk scoring, FAISS precedent retrieval, and RAG explainability
          </p>
        </div>

        <div className="header-actions">
          {result && (
            <button className="btn btn-secondary btn-sm" onClick={handleReset}>
              <RotateCcw size={12} />
              <span>New Investigation</span>
            </button>
          )}
        </div>
      </div>

      {/* Preset Quick Load Bar */}
      <div className="presets-bar glass-card">
        <div className="presets-label">
          <Sliders size={13} className="text-muted" />
          <span>Quick Test Presets:</span>
        </div>
        <div className="presets-buttons">
          <button
            type="button"
            className="preset-btn high"
            onClick={() => applyPreset('high_risk')}
          >
            <span className="dot red" />
            High Risk Pattern
          </button>
          <button
            type="button"
            className="preset-btn med"
            onClick={() => applyPreset('medium_risk')}
          >
            <span className="dot yellow" />
            Suspicious Review Pattern
          </button>
          <button
            type="button"
            className="preset-btn low"
            onClick={() => applyPreset('low_risk')}
          >
            <span className="dot green" />
            Safe Transaction Pattern
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage
          type="general"
          title="Investigation Request Failed"
          message={error}
        />
      )}

      {/* Form Section */}
      {!result && (
        <form onSubmit={handleSubmit} className="investigate-form-card glass-card">
          <div className="form-section-title">
            <Fingerprint size={14} className="text-secondary" />
            <span>Transaction Feature Inputs</span>
          </div>

          <div className="form-grid">
            {/* Transaction ID */}
            <div className="form-group">
              <label className="form-label">
                Transaction ID <span className="label-hint">(Optional / Auto-generated)</span>
              </label>
              <input
                type="text"
                name="transaction_id"
                placeholder="e.g. 3388943 (or leave blank)"
                value={formData.transaction_id}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* Transaction Amount */}
            <div className="form-group">
              <label className="form-label">
                Transaction Amount ($) <span className="required">*</span>
              </label>
              <input
                type="number"
                step="any"
                name="TransactionAmt"
                placeholder="e.g. 42.294"
                value={formData.TransactionAmt}
                onChange={handleInputChange}
                required
                className="form-input mono"
              />
            </div>

            {/* Product Code */}
            <div className="form-group">
              <label className="form-label">Product Code (ProductCD)</label>
              <select
                name="ProductCD"
                value={formData.ProductCD}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="W">W — Web Transaction</option>
                <option value="C">C — Card / Mobile Checkout</option>
                <option value="R">R — Retail / Recurring</option>
                <option value="H">H — High-Risk Gateway</option>
                <option value="S">S — Subscriptions</option>
              </select>
            </div>

            {/* card1 */}
            <div className="form-group">
              <label className="form-label">Card Identifier (card1)</label>
              <input
                type="text"
                name="card1"
                placeholder="e.g. 13335"
                value={formData.card1}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* card4 (Card Network) */}
            <div className="form-group">
              <label className="form-label">Card Network (card4)</label>
              <select
                name="card4"
                value={formData.card4}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="mastercard">Mastercard</option>
                <option value="visa">Visa</option>
                <option value="discover">Discover</option>
                <option value="american express">American Express</option>
              </select>
            </div>

            {/* card6 (Card Type) */}
            <div className="form-group">
              <label className="form-label">Card Type (card6)</label>
              <select
                name="card6"
                value={formData.card6}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
            </div>

            {/* P_emaildomain */}
            <div className="form-group">
              <label className="form-label">Purchaser Email Domain (P_emaildomain)</label>
              <input
                type="text"
                name="P_emaildomain"
                placeholder="e.g. hotmail.com, gmail.com"
                value={formData.P_emaildomain}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* R_emaildomain */}
            <div className="form-group">
              <label className="form-label">Recipient Email Domain (R_emaildomain)</label>
              <input
                type="text"
                name="R_emaildomain"
                placeholder="e.g. hotmail.com, Unknown"
                value={formData.R_emaildomain}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* DeviceType */}
            <div className="form-group">
              <label className="form-label">Device Type (DeviceType)</label>
              <select
                name="DeviceType"
                value={formData.DeviceType}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
            </div>

            {/* DeviceInfo */}
            <div className="form-group">
              <label className="form-label">Device Information (DeviceInfo)</label>
              <input
                type="text"
                name="DeviceInfo"
                placeholder="e.g. SM-A300H Build/LRX22G"
                value={formData.DeviceInfo}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* addr1 */}
            <div className="form-group">
              <label className="form-label">Billing Region (addr1)</label>
              <input
                type="text"
                name="addr1"
                placeholder="e.g. 299 or Unknown"
                value={formData.addr1}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* addr2 */}
            <div className="form-group">
              <label className="form-label">Billing Country (addr2)</label>
              <input
                type="text"
                name="addr2"
                placeholder="e.g. 87 or Unknown"
                value={formData.addr2}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* dist1 */}
            <div className="form-group">
              <label className="form-label">Distance Metric 1 (dist1)</label>
              <input
                type="text"
                name="dist1"
                placeholder="e.g. 12 or Unknown"
                value={formData.dist1}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* dist2 */}
            <div className="form-group">
              <label className="form-label">Distance Metric 2 (dist2)</label>
              <input
                type="text"
                name="dist2"
                placeholder="e.g. 0 or Unknown"
                value={formData.dist2}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* Transaction Hour */}
            <div className="form-group">
              <label className="form-label">Transaction Hour (0 - 23)</label>
              <input
                type="number"
                min="0"
                max="23"
                name="Transaction_hour"
                value={formData.Transaction_hour}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>

            {/* Transaction Day */}
            <div className="form-group">
              <label className="form-label">Transaction Day (1 - 365)</label>
              <input
                type="number"
                min="1"
                max="365"
                name="Transaction_day"
                value={formData.Transaction_day}
                onChange={handleInputChange}
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-footer">
            <button
              type="submit"
              className="btn btn-primary btn-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinning-dot" />
                  <span>Evaluating Fraud Telemetry & RAG Precedents...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>INVESTIGATE TRANSACTION</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Result Section */}
      {result && (
        <div className="investigation-result-container">
          <div className="result-success-alert glass-card">
            <CheckCircle2 size={16} className="text-online" />
            <span>Investigation complete. Case dossier and RAG explanation persisted to MongoDB.</span>
            <div className="result-top-actions">
              <Link
                to={`/cases/${result.transaction_id || result.case_id}`}
                className="btn btn-primary btn-sm"
              >
                <span>View Full Case</span>
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>

          {/* 1. Risk Score / Decision / Network Risk Header Banner */}
          <div className={`glass-card risk-header-banner ${(result.risk_level || 'HIGH').toLowerCase()}`}>
            <div className="header-badge-col">
              <div className="risk-level-display">
                <span className="risk-tag">CHARGESHIELD AI • INVESTIGATION DOSSIER</span>
                <h2 className="case-title-heading mono">Case #{result.transaction_id || result.case_id}</h2>
              </div>
              <div className="badges-row">
                <RiskBadge level={result.risk_level} size="lg" />
                <ActionBadge action={result.recommended_action} />
              </div>
            </div>

            <div className="header-metrics-col">
              <div className="metric-box">
                <span className="metric-label">Risk Score</span>
                <div className="metric-value-row">
                  <span className={`metric-big-val mono ${(result.risk_level || 'HIGH').toLowerCase()}`}>
                    {parseFloat(result.risk_score || 0).toFixed(2)}
                  </span>
                  <span className="metric-denom">/ 100</span>
                </div>
                <span className="metric-sub">Calibrated Score</span>
              </div>

              <div className="metric-divider" />

              <div className="metric-box">
                <span className="metric-label">Decision</span>
                <div className="action-pill-val mono">
                  {result.recommended_action || 'MANUAL_INVESTIGATION'}
                </div>
                <span className="metric-sub">Protocol Action</span>
              </div>

              <div className="metric-divider" />

              <div className="metric-box">
                <span className="metric-label">Network Risk</span>
                <div className="metric-value-row">
                  <span className={`metric-big-val mono ${(result.fraud_network?.network_risk_level || result.risk_level || 'HIGH').toLowerCase()}`}>
                    {result.fraud_network?.network_risk_level || result.risk_level || 'HIGH'}
                  </span>
                  <span className="metric-denom mono" style={{ fontSize: '12px' }}>
                    ({parseFloat(result.fraud_network?.network_risk_score || result.risk_score || 0).toFixed(2)})
                  </span>
                </div>
                <span className="metric-sub">Ring Threat Tier</span>
              </div>
            </div>
          </div>

          {/* 2. FEATURE 3 — WHY IS THIS SUSPICIOUS? */}
          <SuspiciousFactors factorsData={result.suspicious_factors} loading={false} />

          {/* 3. FEATURE 1 & 2 — FRAUD NETWORK DETECTION & INTERACTIVE GRAPH */}
          <div className="network-section-container">
            <FraudNetworkSummary networkData={result.fraud_network} loading={false} />
            <FraudNetworkGraph networkData={result.fraud_network} currentCaseId={result.transaction_id || result.case_id} />
          </div>

          {/* 4. FEATURE 4 — EVIDENCE STRENGTH */}
          <EvidenceStrengthCard strengthData={result.evidence_strength} loading={false} />

          {/* 5. Transaction Evidence Grid */}
          <div className="glass-card evidence-card">
            <div className="card-header-simple">
              <div className="card-header-icon blue">
                <Fingerprint size={15} />
              </div>
              <div>
                <h3 className="card-title">Transaction Evidence</h3>
                <p className="card-subtitle">Submitted feature parameters evaluated against baseline models</p>
              </div>
            </div>

            <div className="evidence-grid">
              {Object.entries(result.investigation_case?.transaction_evidence || formData).map(([key, val]) => (
                <div key={key} className="evidence-item">
                  <span className="evidence-key mono">{key}</span>
                  <span className="evidence-val mono highlight">
                    {String(val || 'Unknown')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Similar Historical Cases (FAISS) */}
          <div className="glass-card similar-cases-card">
            <div className="card-header-simple">
              <div className="card-header-icon purple">
                <Layers size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="flex-between">
                  <h3 className="card-title">Similar Historical Cases</h3>
                  <span className="faiss-tag mono">FAISS Vector Search (Top 5)</span>
                </div>
                <p className="card-subtitle">Closest historical fraud precedents retrieved by cosine vector distance</p>
              </div>
            </div>

            {(!result.similar_cases || result.similar_cases.length === 0) ? (
              <div className="empty-substate">
                <p>No similar historical cases found in index.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Similarity %</th>
                      <th>Risk Score</th>
                      <th>Risk Level</th>
                      <th>Recommended Action</th>
                      <th style={{ textAlign: 'right' }}>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.similar_cases.map((sim) => {
                      const simId = sim.case_id || sim.transaction_id;
                      const cleanSimId = String(simId).replace(/^[#\s]*(case_)?/i, '');
                      const simPct = sim.similarity_pct || (sim.similarity_score ? `${Math.round(sim.similarity_score * 100)}%` : '90%');
                      const simScore = parseFloat(sim.risk_score || 0).toFixed(2);

                      return (
                        <tr key={cleanSimId}>
                          <td>
                            <span className="case-id-cell mono font-semibold">
                              #{cleanSimId}
                            </span>
                          </td>
                          <td>
                            <span className="similarity-badge mono">
                              {simPct} Match
                            </span>
                          </td>
                          <td>
                            <span className="mono score-cell font-semibold">
                              {simScore}
                            </span>
                          </td>
                          <td>
                            <RiskBadge level={sim.risk_level} />
                          </td>
                          <td>
                            <ActionBadge action={sim.recommended_action} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link
                              to={`/cases/${cleanSimId}`}
                              className="btn btn-secondary btn-sm"
                            >
                              <span>Inspect</span>
                              <ExternalLink size={11} />
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
            caseId={result.transaction_id || result.case_id}
            caseData={result.investigation_case || result}
            networkData={result.fraud_network}
            similarCases={result.similar_cases}
            ragData={result.investigator_explanation}
          />

          {/* Bottom Action Controls */}
          <div className="result-bottom-bar">
            <button className="btn btn-secondary" onClick={handleReset}>
              <RotateCcw size={13} />
              <span>Investigate Another Transaction</span>
            </button>
            <Link
              to={`/cases/${result.transaction_id || result.case_id}`}
              className="btn btn-primary"
            >
              <span>View Full Case in Dossier Explorer</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
