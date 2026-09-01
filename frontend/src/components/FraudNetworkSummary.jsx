import React from 'react';
import {
  Share2,
  Smartphone,
  Globe,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Fingerprint
} from 'lucide-react';
import RiskBadge from './RiskBadge';
import '../pages/CaseDetails.css';

export default function FraudNetworkSummary({ networkData, loading = false }) {
  if (loading) {
    return (
      <div className="glass-card network-summary-card skeleton-loading" style={{ minHeight: '180px' }}>
        <div className="skeleton-line" style={{ width: '40%', height: '20px', marginBottom: '16px' }} />
        <div className="skeleton-line" style={{ width: '80%', height: '40px' }} />
      </div>
    );
  }

  if (!networkData) {
    return null;
  }

  const summary = networkData.summary || {};
  const networkRiskScore = parseFloat(networkData.network_risk_score || summary.network_risk_score || 0).toFixed(2);
  const networkRiskLevel = (networkData.network_risk_level || summary.network_risk_level || 'HIGH').toUpperCase();
  const alertMsg = networkData.network_alert || '⚠️ This transaction is connected to multiple previously flagged transactions.';
  const clusterId = networkData.cluster_id || 'RING-NET-ALPHA';
  const clusterPattern = networkData.cluster_pattern || 'Multi-Entity Velocity Ring';

  const connectedCount = summary.connected_transactions_count || networkData.connected_transactions?.length || 0;
  const sharedDevicesCount = summary.shared_devices_count || networkData.shared_devices?.length || 0;
  const sharedIpsCount = summary.shared_ips_count || networkData.shared_ips?.length || 0;
  const sharedCardsCount = summary.shared_payment_identifiers_count || networkData.shared_payment_identifiers?.length || 0;
  const highRiskCount = summary.high_risk_connections_count || networkData.high_risk_connections?.length || 0;

  return (
    <div className="glass-card fraud-network-summary-card">
      {/* Header */}
      <div className="network-card-header">
        <div className="flex-start gap-12">
          <div className="card-header-icon red">
            <Share2 size={16} />
          </div>
          <div>
            <div className="flex-center gap-8">
              <h3 className="card-title">Potential Fraud Network</h3>
              <span className="cluster-tag mono">{clusterId}</span>
            </div>
            <p className="card-subtitle">
              Graph relationship cluster ({clusterPattern}) detected via shared digital credentials
            </p>
          </div>
        </div>

        <div className="network-risk-pill-box">
          <span className="net-risk-label mono">Network Risk:</span>
          <RiskBadge level={networkRiskLevel} size="md" />
        </div>
      </div>

      {/* Warning Alert Banner */}
      <div className={`network-alert-banner ${networkRiskLevel.toLowerCase()}`}>
        <AlertTriangle size={16} className="alert-icon" />
        <span className="alert-text">{alertMsg}</span>
      </div>

      {/* 6-Metric Stat Grid */}
      <div className="network-stats-grid">
        {/* Metric 1: Network Risk Score */}
        <div className="net-stat-item highlight">
          <div className="net-stat-top">
            <Activity size={13} className="text-muted" />
            <span className="net-stat-label">Network Risk</span>
          </div>
          <div className="net-stat-val-row">
            <span className={`net-stat-val mono ${networkRiskLevel.toLowerCase()}`}>
              {networkRiskScore}
            </span>
            <span className="net-stat-denom">/ 100</span>
          </div>
          <span className="net-stat-sub">Cluster Threat Level</span>
        </div>

        {/* Metric 2: Connected Transactions */}
        <div className="net-stat-item">
          <div className="net-stat-top">
            <Layers size={13} className="text-secondary" />
            <span className="net-stat-label">Connected Tx</span>
          </div>
          <div className="net-stat-val mono">{connectedCount}</div>
          <span className="net-stat-sub">Linked Transactions</span>
        </div>

        {/* Metric 3: High Risk Connections */}
        <div className="net-stat-item">
          <div className="net-stat-top">
            <ShieldAlert size={13} className="text-danger" />
            <span className="net-stat-label">High-Risk Links</span>
          </div>
          <div className="net-stat-val mono text-danger">{highRiskCount}</div>
          <span className="net-stat-sub">Prior Flagged Cases</span>
        </div>

        {/* Metric 4: Shared Devices */}
        <div className="net-stat-item">
          <div className="net-stat-top">
            <Smartphone size={13} className="text-accent" />
            <span className="net-stat-label">Shared Devices</span>
          </div>
          <div className="net-stat-val mono">{sharedDevicesCount}</div>
          <span className="net-stat-sub">Hardware Fingerprints</span>
        </div>

        {/* Metric 5: Shared IPs */}
        <div className="net-stat-item">
          <div className="net-stat-top">
            <Globe size={13} className="text-info" />
            <span className="net-stat-label">Shared IPs</span>
          </div>
          <div className="net-stat-val mono">{sharedIpsCount}</div>
          <span className="net-stat-sub">District / IP Locations</span>
        </div>

        {/* Metric 6: Shared Payment Identifiers */}
        <div className="net-stat-item">
          <div className="net-stat-top">
            <CreditCard size={13} className="text-warning" />
            <span className="net-stat-label">Shared Payment IDs</span>
          </div>
          <div className="net-stat-val mono">{sharedCardsCount}</div>
          <span className="net-stat-sub">Card Issuer BINs</span>
        </div>
      </div>
    </div>
  );
}
