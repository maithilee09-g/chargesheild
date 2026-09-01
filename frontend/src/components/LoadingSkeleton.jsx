import React from 'react';
import './LoadingSkeleton.css';

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="skeleton-table-wrapper">
      <div className="skeleton-row header">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton-box pulse" style={{ width: `${60 + (i % 3) * 20}px`, height: '16px' }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-row">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton-box pulse" style={{ width: `${50 + ((r + c) % 4) * 25}%`, height: '14px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card skeleton-card">
      <div className="skeleton-box pulse" style={{ width: '40%', height: '14px', marginBottom: '16px' }} />
      <div className="skeleton-box pulse" style={{ width: '70%', height: '32px', marginBottom: '12px' }} />
      <div className="skeleton-box pulse" style={{ width: '50%', height: '12px' }} />
    </div>
  );
}

export function DetailsSkeleton() {
  return (
    <div className="skeleton-details">
      <div className="glass-card skeleton-banner">
        <div className="skeleton-box pulse" style={{ width: '30%', height: '24px', marginBottom: '16px' }} />
        <div className="skeleton-box pulse" style={{ width: '60%', height: '18px' }} />
      </div>
      <div className="skeleton-grid">
        <div className="glass-card skeleton-card" style={{ height: '260px' }} />
        <div className="glass-card skeleton-card" style={{ height: '260px' }} />
      </div>
    </div>
  );
}

export default { TableSkeleton, CardSkeleton, DetailsSkeleton };
