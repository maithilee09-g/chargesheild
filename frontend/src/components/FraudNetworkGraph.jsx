import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Share2,
  Smartphone,
  Globe,
  CreditCard,
  Mail,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  Filter,
  Maximize2,
  RotateCcw,
  Zap,
  Info
} from 'lucide-react';
import RiskBadge from './RiskBadge';
import './FraudNetworkGraph.css';

export default function FraudNetworkGraph({ networkData, currentCaseId }) {
  const [filterType, setFilterType] = useState('all'); // 'all', 'device', 'payment', 'ip', 'high_risk'
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const cleanCurrentId = String(currentCaseId || '').replace(/^[#\s]*(case_)?/i, '');

  const graph = networkData?.graph || { nodes: [], edges: [] };
  const rawNodes = graph.nodes || [];
  const rawEdges = graph.edges || [];

  // Filter nodes & edges based on active filter
  const { nodes, edges } = useMemo(() => {
    if (!rawNodes.length) return { nodes: [], edges: [] };

    let filteredNodes = rawNodes;

    if (filterType === 'device') {
      filteredNodes = rawNodes.filter(
        (n) => n.is_center || n.type === 'shared_device' || (n.type === 'connected_transaction' && n.shared_links?.some((l) => l.toLowerCase().includes('device')))
      );
    } else if (filterType === 'payment') {
      filteredNodes = rawNodes.filter(
        (n) => n.is_center || n.type === 'shared_payment_identifier' || (n.type === 'connected_transaction' && n.shared_links?.some((l) => l.toLowerCase().includes('payment') || l.toLowerCase().includes('card')))
      );
    } else if (filterType === 'ip') {
      filteredNodes = rawNodes.filter(
        (n) => n.is_center || n.type === 'shared_ip_address' || (n.type === 'connected_transaction' && n.shared_links?.some((l) => l.toLowerCase().includes('ip') || l.toLowerCase().includes('district')))
      );
    } else if (filterType === 'high_risk') {
      filteredNodes = rawNodes.filter(
        (n) => n.is_center || n.is_entity || (n.type === 'connected_transaction' && (n.risk_level === 'HIGH' || n.risk_score >= 70))
      );
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = rawEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [rawNodes, rawEdges, filterType]);

  // Layout calculations (Center at (360, 240))
  const width = 740;
  const height = 480;
  const centerX = width / 2;
  const centerY = height / 2;

  const nodePositions = useMemo(() => {
    const posMap = {};
    const centerNode = nodes.find((n) => n.is_center) || nodes[0];
    if (!centerNode) return posMap;

    posMap[centerNode.id] = { x: centerX, y: centerY };

    const entityNodes = nodes.filter((n) => n.is_entity);
    const connectedNodes = nodes.filter((n) => !n.is_center && !n.is_entity);

    // Position Entity Nodes on an inner ellipse ring
    const entityRadiusX = 175;
    const entityRadiusY = 110;
    entityNodes.forEach((node, idx) => {
      const angle = (idx / Math.max(entityNodes.length, 1)) * 2 * Math.PI - Math.PI / 2;
      posMap[node.id] = {
        x: centerX + entityRadiusX * Math.cos(angle),
        y: centerY + entityRadiusY * Math.sin(angle),
      };
    });

    // Position Connected Transaction Nodes on an outer orbit ring
    const outerRadiusX = 300;
    const outerRadiusY = 195;
    connectedNodes.forEach((node, idx) => {
      const angle = (idx / Math.max(connectedNodes.length, 1)) * 2 * Math.PI - Math.PI / 4;
      posMap[node.id] = {
        x: centerX + outerRadiusX * Math.cos(angle),
        y: centerY + outerRadiusY * Math.sin(angle),
      };
    });

    return posMap;
  }, [nodes, centerX, centerY]);

  if (!rawNodes.length) {
    return null;
  }

  const getEntityIcon = (type) => {
    if (type?.includes('device')) return <Smartphone size={13} />;
    if (type?.includes('ip')) return <Globe size={13} />;
    if (type?.includes('payment')) return <CreditCard size={13} />;
    if (type?.includes('email')) return <Mail size={13} />;
    return <Share2 size={13} />;
  };

  const getEntityColor = (type) => {
    if (type?.includes('device')) return '#38BDF8'; // Sky cyan
    if (type?.includes('ip')) return '#818CF8';     // Indigo
    if (type?.includes('payment')) return '#FBBF24';// Amber
    if (type?.includes('email')) return '#A78BFA';  // Purple
    return '#60A5FA';
  };

  const getNodeRiskColor = (level, score) => {
    if (level === 'HIGH' || score >= 70) return '#EF4444';
    if (level === 'MEDIUM' || score >= 40) return '#F59E0B';
    return '#10B981';
  };

  const activeFocusNode = hoveredNode || selectedNode;

  return (
    <div className="glass-card fraud-network-graph-card">
      {/* Graph Toolbar */}
      <div className="graph-toolbar">
        <div className="graph-title-group">
          <div className="card-header-icon purple">
            <Share2 size={16} />
          </div>
          <div>
            <h3 className="card-title">Fraud Ring Relationship Graph</h3>
            <p className="card-subtitle">
              Interactive multi-hop entity linkage mapping shared devices, IPs, and payment credentials
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="graph-controls-row">
          <div className="filter-pill-group">
            <span className="filter-label">
              <Filter size={11} />
              <span>Filter:</span>
            </span>
            <button
              className={`graph-filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All Links
            </button>
            <button
              className={`graph-filter-btn ${filterType === 'device' ? 'active' : ''}`}
              onClick={() => setFilterType('device')}
            >
              Shared Device
            </button>
            <button
              className={`graph-filter-btn ${filterType === 'payment' ? 'active' : ''}`}
              onClick={() => setFilterType('payment')}
            >
              Shared Payment
            </button>
            <button
              className={`graph-filter-btn ${filterType === 'ip' ? 'active' : ''}`}
              onClick={() => setFilterType('ip')}
            >
              Shared IP
            </button>
            <button
              className={`graph-filter-btn danger ${filterType === 'high_risk' ? 'active' : ''}`}
              onClick={() => setFilterType('high_risk')}
            >
              High-Risk Only
            </button>
          </div>

          <button
            className="btn btn-secondary btn-xs reset-btn"
            onClick={() => {
              setFilterType('all');
              setSelectedNode(null);
            }}
            title="Reset Graph Selection"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="graph-canvas-container">
        <svg
          className="graph-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => setSelectedNode(null)}
        >
          <defs>
            {/* Center Pulse Glow */}
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
            {/* Entity Glow */}
            <radialGradient id="entityGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Orbit Ring Guides */}
          <ellipse
            cx={centerX}
            cy={centerY}
            rx={175}
            ry={110}
            className="orbit-ring inner"
          />
          <ellipse
            cx={centerX}
            cy={centerY}
            rx={300}
            ry={195}
            className="orbit-ring outer"
          />

          {/* Graph Edges */}
          <g className="edges-group">
            {edges.map((edge) => {
              const srcPos = nodePositions[edge.source];
              const tgtPos = nodePositions[edge.target];
              if (!srcPos || !tgtPos) return null;

              const isHighlighted =
                activeFocusNode &&
                (activeFocusNode.id === edge.source || activeFocusNode.id === edge.target);

              return (
                <line
                  key={edge.id}
                  x1={srcPos.x}
                  y1={srcPos.y}
                  x2={tgtPos.x}
                  y2={tgtPos.y}
                  className={`graph-edge ${isHighlighted ? 'highlighted' : ''}`}
                />
              );
            })}
          </g>

          {/* Graph Nodes */}
          <g className="nodes-group">
            {nodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;

              const isCenter = node.is_center;
              const isEntity = node.is_entity;
              const isSelected = selectedNode?.id === node.id;
              const isHovered = hoveredNode?.id === node.id;
              const riskColor = getNodeRiskColor(node.risk_level, node.risk_score);
              const entityColor = getEntityColor(node.type);

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className={`graph-node-group ${isCenter ? 'center-node' : ''} ${isEntity ? 'entity-node' : ''} ${isSelected ? 'selected' : ''}`}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Outer Glow Halo */}
                  {isCenter && (
                    <circle
                      r={38}
                      fill="url(#centerGlow)"
                      className="pulse-halo"
                    />
                  )}

                  {/* Main Node Circle */}
                  {isCenter ? (
                    <circle
                      r={24}
                      fill="#1E293B"
                      stroke={riskColor}
                      strokeWidth={3.5}
                      className="center-circle"
                    />
                  ) : isEntity ? (
                    <circle
                      r={18}
                      fill="#0F172A"
                      stroke={entityColor}
                      strokeWidth={2.5}
                      className="entity-circle"
                    />
                  ) : (
                    <circle
                      r={16}
                      fill="#1E293B"
                      stroke={riskColor}
                      strokeWidth={2}
                      className="tx-circle"
                    />
                  )}

                  {/* Node Badge / Score Pill on Connected Tx */}
                  {!isCenter && !isEntity && node.risk_score && (
                    <circle
                      cx={10}
                      cy={-10}
                      r={5}
                      fill={riskColor}
                    />
                  )}

                  {/* Node Label Text */}
                  <text
                    y={isCenter ? 38 : isEntity ? 30 : 28}
                    textAnchor="middle"
                    className={`node-label ${isCenter ? 'center-label' : isEntity ? 'entity-label' : 'tx-label'}`}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Floating Node Detail Card on Click / Selection */}
        {selectedNode && (
          <div className="node-detail-floating-card glass-card">
            <div className="detail-card-top">
              <div className="flex-center gap-6">
                <span className="dot" style={{ background: selectedNode.is_entity ? getEntityColor(selectedNode.type) : getNodeRiskColor(selectedNode.risk_level, selectedNode.risk_score) }} />
                <span className="detail-title mono">{selectedNode.label}</span>
              </div>
              <button
                className="close-detail-btn"
                onClick={() => setSelectedNode(null)}
              >
                ×
              </button>
            </div>

            <div className="detail-card-body">
              {selectedNode.is_center ? (
                <>
                  <div className="detail-row">
                    <span className="detail-k">Role:</span>
                    <span className="detail-v text-accent">Current Investigation Target</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Risk Score:</span>
                    <span className="detail-v mono text-danger">{selectedNode.risk_score} / 100</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Risk Tier:</span>
                    <RiskBadge level={selectedNode.risk_level} size="sm" />
                  </div>
                </>
              ) : selectedNode.is_entity ? (
                <>
                  <div className="detail-row">
                    <span className="detail-k">Entity Type:</span>
                    <span className="detail-v text-cyan">{selectedNode.type?.replace('shared_', '').toUpperCase()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Identifier:</span>
                    <span className="detail-v mono">{selectedNode.full_value}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Linked Cases:</span>
                    <span className="detail-v mono">{selectedNode.count} transactions</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="detail-row">
                    <span className="detail-k">Transaction ID:</span>
                    <span className="detail-v mono">#{selectedNode.details?.id || selectedNode.id.replace('tx_', '')}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Risk Score:</span>
                    <span className="detail-v mono text-danger">{selectedNode.risk_score} / 100</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Shared Via:</span>
                    <span className="detail-v text-warning">{selectedNode.shared_links?.join(', ') || 'Shared Credentials'}</span>
                  </div>
                  <div className="detail-actions">
                    <Link
                      to={`/cases/${selectedNode.details?.id || selectedNode.id.replace('tx_', '')}`}
                      className="btn btn-primary btn-xs"
                    >
                      <span>Inspect Case</span>
                      <ExternalLink size={10} />
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Graph Legend */}
      <div className="graph-legend-row">
        <div className="legend-item">
          <span className="legend-dot center" />
          <span>Target Transaction</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot device" />
          <span>Shared Device</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot payment" />
          <span>Shared Payment BIN</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot ip" />
          <span>Shared IP / District</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot high-risk" />
          <span>High-Risk Connected Tx</span>
        </div>
      </div>
    </div>
  );
}
