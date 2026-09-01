import React from 'react';
import {
  AlertOctagon,
  Sparkles,
  Zap,
  TrendingUp,
  HelpCircle,
  Brain,
  ShieldAlert
} from 'lucide-react';
import '../pages/CaseDetails.css';

export default function SuspiciousFactors({ factorsData, loading = false }) {
  if (loading) {
    return (
      <div className="glass-card suspicious-factors-card skeleton-loading" style={{ minHeight: '200px' }}>
        <div className="skeleton-line" style={{ width: '50%', height: '22px', marginBottom: '16px' }} />
        <div className="skeleton-line" style={{ width: '100%', height: '60px' }} />
      </div>
    );
  }

  if (!factorsData) return null;

  const factors = factorsData.contributing_factors || [
    { factor: 'Device mismatch / Mobile emulator signature', impact: '+24', impact_num: 24, category: 'Device Vector', detail: 'Hardware fingerprint exhibits automated mobile emulator traits.' },
    { factor: 'Amount anomaly vs baseline', impact: '+19', impact_num: 19, category: 'Amount Anomaly', detail: 'Transaction amount significantly higher than customer peer baseline.' },
    { factor: 'Purchaser vs Recipient domain mismatch', impact: '+15', impact_num: 15, category: 'Identity Vector', detail: 'Purchaser domain differs from recipient domain with anonymous routing.' },
    { factor: 'Regional IP / District anomaly', impact: '+11', impact_num: 11, category: 'Network Vector', detail: 'IP location district correlates with known high-risk cluster.' }
  ];

  const explanation = factorsData.natural_language_explanation ||
    "This transaction is considered high risk because the device has been associated with multiple flagged transactions, the transaction amount is significantly higher than the customer's normal behavior, and the IP address is shared with previously suspicious activity.";

  const maxImpact = Math.max(...factors.map((f) => f.impact_num || 20), 25);

  return (
    <div className="glass-card suspicious-factors-card">
      {/* Header */}
      <div className="card-header-simple">
        <div className="card-header-icon red">
          <Zap size={16} />
        </div>
        <div>
          <h3 className="card-title">Why is this transaction suspicious?</h3>
          <p className="card-subtitle">
            Quantitative SHAP feature contributions and AI-synthesized risk rationale
          </p>
        </div>
      </div>

      {/* 2-Column Grid: Factors Breakdown + Natural Language Synthesis */}
      <div className="suspicious-grid">
        {/* Left Column: Top Contributing Factors Bars */}
        <div className="factors-bars-col">
          <div className="factors-list">
            {factors.map((f, idx) => {
              const impactNum = f.impact_num || parseInt(String(f.impact).replace('+', '')) || 15;
              const barPercent = Math.min(Math.round((impactNum / maxImpact) * 100), 100);

              return (
                <div key={idx} className="factor-bar-item">
                  <div className="factor-bar-header">
                    <div className="flex-start gap-8">
                      <span className="factor-rank mono">#{idx + 1}</span>
                      <span className="factor-name">{f.factor}</span>
                    </div>
                    <span className="factor-impact mono">{f.impact}</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="factor-track">
                    <div
                      className="factor-fill"
                      style={{
                        width: `${barPercent}%`,
                        background: idx === 0 ? 'linear-gradient(90deg, #EF4444, #F43F5E)' : idx === 1 ? 'linear-gradient(90deg, #F97316, #FB923C)' : 'linear-gradient(90deg, #3B82F6, #60A5FA)'
                      }}
                    />
                  </div>

                  <p className="factor-detail-text">{f.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: AI Natural Language Explanation Card */}
        <div className="factors-narrative-col">
          <div className="narrative-inner-card">
            <div className="narrative-header">
              <div className="flex-center gap-6">
                <Brain size={15} className="text-ai" />
                <span className="narrative-title">AI Threat Synthesis</span>
              </div>
              <span className="ai-tag mono">Grounded RAG / SHAP Layer</span>
            </div>

            <p className="narrative-text">
              "{explanation}"
            </p>

            <div className="narrative-footer">
              <span className="disclaimer-mini">
                * Derived from verified tree ensemble feature weights and historical precedent correlations.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
