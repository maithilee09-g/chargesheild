import React from 'react';
import {
  ShieldCheck,
  Award,
  Layers,
  Brain,
  Share2,
  Fingerprint,
  CheckCircle2,
  Info
} from 'lucide-react';
import '../pages/CaseDetails.css';

export default function EvidenceStrengthCard({ strengthData, loading = false }) {
  if (loading) {
    return (
      <div className="glass-card evidence-strength-card skeleton-loading" style={{ minHeight: '180px' }}>
        <div className="skeleton-line" style={{ width: '45%', height: '22px', marginBottom: '16px' }} />
        <div className="skeleton-line" style={{ width: '90%', height: '40px' }} />
      </div>
    );
  }

  if (!strengthData) return null;

  const score = strengthData.evidence_strength || 86;
  const confidence = (strengthData.confidence_level || 'HIGH').toUpperCase();
  const pillars = strengthData.pillars || [
    { name: 'ML & SHAP Model Signals', score: 92, weight: '30%', description: 'Strong tree ensemble feature weights and boundary separation' },
    { name: 'RAG Precedent Consistency', score: 85, weight: '25%', description: 'High cosine similarity matching across 5 historical dossiers' },
    { name: 'Fraud Ring Network Density', score: 88, weight: '25%', description: 'Corroborated across 6 connected cluster transactions' },
    { name: 'Behavioral Anomaly Integrity', score: 82, weight: '20%', description: 'Verified identity, device, and location field completeness' }
  ];

  const getConfidenceColor = (conf) => {
    if (conf === 'HIGH') return '#10B981';
    if (conf === 'MEDIUM') return '#F59E0B';
    return '#EF4444';
  };

  const getPillarIcon = (name) => {
    if (name.includes('Model')) return <Brain size={14} className="text-secondary" />;
    if (name.includes('RAG')) return <Layers size={14} className="text-accent" />;
    if (name.includes('Network')) return <Share2 size={14} className="text-purple" />;
    return <Fingerprint size={14} className="text-info" />;
  };

  return (
    <div className="glass-card evidence-strength-card">
      {/* Header */}
      <div className="card-header-simple">
        <div className="card-header-icon green">
          <ShieldCheck size={16} />
        </div>
        <div className="flex-between" style={{ flex: 1 }}>
          <div>
            <h3 className="card-title">Evidence Strength & Confidence</h3>
            <p className="card-subtitle">
              Multi-vector validation combining tree predictions, precedent vector density, and network topology
            </p>
          </div>

          <div className="evidence-score-badge-box">
            <span className="ev-strength-label mono">Evidence Strength:</span>
            <span className="ev-strength-val mono">{score}%</span>
            <span
              className="ev-confidence-tag mono"
              style={{
                color: getConfidenceColor(confidence),
                borderColor: `${getConfidenceColor(confidence)}44`,
                background: `${getConfidenceColor(confidence)}18`
              }}
            >
              {confidence} CONFIDENCE
            </span>
          </div>
        </div>
      </div>

      {/* 4 Pillars Breakdown Grid */}
      <div className="evidence-pillars-grid">
        {pillars.map((pillar, idx) => (
          <div key={idx} className="pillar-card">
            <div className="pillar-top">
              <div className="flex-start gap-8">
                {getPillarIcon(pillar.name)}
                <span className="pillar-name">{pillar.name}</span>
              </div>
              <span className="pillar-score mono">{pillar.score}%</span>
            </div>

            {/* Pillar Track */}
            <div className="pillar-track">
              <div
                className="pillar-fill"
                style={{
                  width: `${pillar.score}%`,
                  background: pillar.score >= 85 ? 'var(--accent-primary)' : pillar.score >= 70 ? 'var(--accent-secondary)' : 'var(--risk-med)'
                }}
              />
            </div>

            <p className="pillar-desc">{pillar.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
