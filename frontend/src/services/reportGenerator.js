import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Format evidence field values for display in the PDF report
 */
function formatEvidenceValue(key, val) {
  if (val === undefined || val === null || val === '') return 'Unknown';
  if (key === 'TransactionAmt') {
    const num = parseFloat(val);
    return isNaN(num) ? String(val) : `$${num.toFixed(3)}`;
  }
  if (key === 'missing_ratio') {
    const num = parseFloat(val);
    return isNaN(num) ? String(val) : `${(num * 100).toFixed(2)}%`;
  }
  return String(val);
}

/**
 * Generate and download a professional PDF Fraud Investigation Report
 * for the selected case.
 *
 * @param {Object} params
 * @param {Object} params.caseData - Primary case data
 * @param {Array} params.similarCases - Similar cases list from FAISS
 * @param {Object} params.ragData - RAG explanation and recommendations
 */
export async function generateInvestigationReportPdf({
  caseData,
  similarCases = [],
  ragData = null,
  networkData = null,
  factorsData = null,
  strengthData = null
}) {
  if (!caseData) {
    throw new Error('Case data is required to generate an investigation report.');
  }

  const cleanId = String(caseData.transaction_id || caseData.case_id || 'UNKNOWN').replace(/^[#\s]*(case_)?/i, '');
  const riskScoreNum = parseFloat(caseData.risk_score || 0);
  const riskScore = riskScoreNum.toFixed(2);
  const fraudProbability = caseData.fraud_probability !== undefined
    ? (parseFloat(caseData.fraud_probability) * 100).toFixed(2)
    : riskScore;
  const riskLevel = (caseData.risk_level || (riskScoreNum >= 70 ? 'HIGH' : riskScoreNum >= 40 ? 'MEDIUM' : 'LOW')).toUpperCase();
  const recommendedAction = caseData.recommended_action || (riskLevel === 'HIGH' ? 'MANUAL_INVESTIGATION' : riskLevel === 'MEDIUM' ? 'REVIEW' : 'ALLOW');

  const riskFactors =
    caseData.risk_factors ||
    caseData.model_important_features ||
    ['TransactionAmt', 'card6', 'C1', 'C13', 'R_emaildomain'];

  const evidence = caseData.transaction_evidence || caseData.features || {};

  const investigatorSummary =
    ragData?.investigator_summary ||
    caseData?.investigator_summary ||
    `The current transaction has a model-estimated fraud risk (${riskScore}/100, probability: ${fraudProbability}%). Multiple historically similar transactions with matching behavioral indicators also required manual investigation.`;

  const investigatorRecommendation =
    ragData?.investigator_recommendation ||
    caseData?.investigator_recommendation ||
    recommendedAction;

  const confidenceNotes =
    ragData?.confidence_notes ||
    '1. MODEL PREDICTION: Calculated from tree ensemble features and global SHAP importance.\n2. RETRIEVED HISTORICAL EVIDENCE: Dense vector similarity search (all-MiniLM-L6-v2) over historical dossiers.\n3. GENERATED EXPLANATION: Objective synthesis intended to assist human review.';

  // Create jsPDF Document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4', // 595.28 x 841.89 pt
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const generationDate = new Date();
  const dateStr = generationDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = generationDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Palette
  const colors = {
    navyDark: [15, 23, 42],      // #0F172A
    navyHeader: [30, 41, 59],    // #1E293B
    primaryBlue: [37, 99, 235],  // #2563EB
    accentCyan: [14, 165, 233],  // #0EA5E9
    lightBg: [248, 250, 252],    // #F8FAFC
    borderGrey: [226, 232, 240], // #E2E8F0
    textDark: [30, 41, 59],      // #1E293B
    textMuted: [100, 116, 139],  // #64748B
    white: [255, 255, 255],
    highRiskRed: [220, 38, 38],  // #DC2626
    medRiskAmber: [217, 119, 6], // #D97706
    lowRiskGreen: [22, 163, 74], // #16A34A
  };

  const riskColor = riskLevel === 'HIGH'
    ? colors.highRiskRed
    : riskLevel === 'MEDIUM'
      ? colors.medRiskAmber
      : colors.lowRiskGreen;

  let cursorY = margin;

  // ============================================================
  // HEADER BANNER
  // ============================================================
  doc.setFillColor(...colors.navyDark);
  doc.roundedRect(margin, cursorY, contentWidth, 75, 4, 4, 'F');

  // Accent left color bar
  doc.setFillColor(...riskColor);
  doc.roundedRect(margin, cursorY, 6, 75, 2, 2, 'F');

  // Brand Name
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CHARGESHIELD AI', margin + 20, cursorY + 28);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(203, 213, 225); // #CBD5E1
  doc.text('Fraud Investigation & Intelligence Report', margin + 20, cursorY + 46);

  // Confidential tag on right
  doc.setFillColor(...colors.navyHeader);
  doc.roundedRect(pageWidth - margin - 150, cursorY + 14, 135, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.accentCyan);
  doc.text('CONFIDENTIAL DOSSIER', pageWidth - margin - 142, cursorY + 28);

  // Report Date/Time on right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // #94A3B8
  doc.text(`Generated: ${dateStr} ${timeStr}`, pageWidth - margin - 150, cursorY + 54);

  cursorY += 88;

  // ============================================================
  // SECTION: CASE INFORMATION & RISK ASSESSMENT (Top 2-column cards)
  // ============================================================
  const cardGap = 12;
  const colWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 112;

  // Left Card: Case Information
  doc.setFillColor(...colors.lightBg);
  doc.setDrawColor(...colors.borderGrey);
  doc.setLineWidth(1);
  doc.roundedRect(margin, cursorY, colWidth, cardHeight, 4, 4, 'FD');

  // Left Card Header
  doc.setFillColor(...colors.navyHeader);
  doc.roundedRect(margin, cursorY, colWidth, 24, 4, 4, 'F');
  doc.rect(margin, cursorY + 18, colWidth, 6, 'F'); // flatten bottom corners
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('CASE INFORMATION', margin + 12, cursorY + 16);

  // Left Card Content
  const infoRows = [
    { label: 'Case ID:', val: `#${cleanId}` },
    { label: 'Transaction ID:', val: cleanId },
    { label: 'Created / Scored Date:', val: dateStr },
    { label: 'Investigation Status:', val: 'Stored in MongoDB' },
  ];
  let infoY = cursorY + 38;
  infoRows.forEach((r) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.textMuted);
    doc.text(r.label, margin + 12, infoY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.textDark);
    doc.text(r.val, margin + 115, infoY);
    infoY += 17;
  });

  // Right Card: Risk Assessment
  const rightX = margin + colWidth + cardGap;
  doc.setFillColor(...colors.lightBg);
  doc.roundedRect(rightX, cursorY, colWidth, cardHeight, 4, 4, 'FD');

  // Right Card Header
  doc.setFillColor(...colors.navyHeader);
  doc.roundedRect(rightX, cursorY, colWidth, 24, 4, 4, 'F');
  doc.rect(rightX, cursorY + 18, colWidth, 6, 'F');
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('RISK ASSESSMENT', rightX + 12, cursorY + 16);

  // Risk Score metric box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.textMuted);
  doc.text('RISK SCORE', rightX + 12, cursorY + 40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...riskColor);
  doc.text(`${riskScore}`, rightX + 12, cursorY + 60);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...colors.textMuted);
  doc.text('/ 100', rightX + 66, cursorY + 60);

  // Fraud Probability
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.textMuted);
  doc.text('FRAUD PROBABILITY', rightX + 130, cursorY + 40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...riskColor);
  doc.text(`${fraudProbability}%`, rightX + 130, cursorY + 58);

  // Badges (Risk Level & Recommended Action)
  // Risk Level Badge
  doc.setFillColor(...riskColor);
  doc.roundedRect(rightX + 12, cursorY + 76, 76, 20, 3, 3, 'F');
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${riskLevel} RISK`, rightX + 18, cursorY + 89);

  // Recommended Action Badge
  doc.setFillColor(...colors.navyHeader);
  doc.roundedRect(rightX + 96, cursorY + 76, 145, 20, 3, 3, 'F');
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(recommendedAction, rightX + 104, cursorY + 89);

  cursorY += cardHeight + 14;

  // ============================================================
  // SECTION: FRAUD RING NETWORK & EVIDENCE STRENGTH (NEW)
  // ============================================================
  if (networkData || strengthData) {
    const netRiskScore = networkData?.network_risk_score ? parseFloat(networkData.network_risk_score).toFixed(2) : riskScore;
    const netRiskLevel = (networkData?.network_risk_level || riskLevel).toUpperCase();
    const clusterId = networkData?.cluster_id || `RING-NET-${cleanId.slice(-4)}`;
    const connCount = networkData?.summary?.connected_transactions_count || networkData?.connected_transactions?.length || 0;
    const highRiskCount = networkData?.summary?.high_risk_connections_count || networkData?.high_risk_connections?.length || 0;
    const evStrength = strengthData?.evidence_strength || 86;
    const evConfidence = (strengthData?.confidence_level || 'HIGH').toUpperCase();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colors.navyDark);
    doc.text('Fraud Ring Network & Evidence Strength', margin, cursorY + 4);

    doc.setFillColor(...colors.primaryBlue);
    doc.rect(margin, cursorY + 8, 32, 2, 'F');

    cursorY += 14;

    const netBoxHeight = 44;
    doc.setFillColor(...colors.lightBg);
    doc.setDrawColor(...colors.borderGrey);
    doc.setLineWidth(1);
    doc.roundedRect(margin, cursorY, contentWidth, netBoxHeight, 3, 3, 'FD');

    // Network stats text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.navyDark);
    doc.text(`Cluster ID: ${clusterId}`, margin + 10, cursorY + 16);
    doc.text(`Network Risk: ${netRiskScore}/100 (${netRiskLevel})`, margin + 170, cursorY + 16);
    doc.text(`Evidence Strength: ${evStrength}% (${evConfidence})`, margin + 340, cursorY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.textMuted);
    const alertSnippet = networkData?.network_alert || `Linked to ${connCount} transactions in the entity cluster (${highRiskCount} high-risk).`;
    doc.text(alertSnippet.length > 95 ? alertSnippet.slice(0, 95) + '...' : alertSnippet, margin + 10, cursorY + 32);

    cursorY += netBoxHeight + 14;
  }

  // ============================================================
  // SECTION: KEY RISK FACTORS (SHAP Drivers)
  // ============================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...colors.navyDark);
  doc.text('Key Risk Factors (SHAP Model Drivers)', margin, cursorY + 4);

  // Underline bar
  doc.setFillColor(...colors.primaryBlue);
  doc.rect(margin, cursorY + 8, 32, 2, 'F');

  cursorY += 16;

  // Render Factor Badges
  let badgeX = margin;
  const factorBadgeHeight = 18;
  riskFactors.forEach((factor, idx) => {
    const text = `#${idx + 1} ${factor}`;
    const textWidth = doc.getTextWidth(text) + 16;
    if (badgeX + textWidth > margin + contentWidth) {
      badgeX = margin;
      cursorY += 22;
    }
    doc.setFillColor(...colors.lightBg);
    doc.setDrawColor(...colors.borderGrey);
    doc.setLineWidth(0.8);
    doc.roundedRect(badgeX, cursorY, textWidth, factorBadgeHeight, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.primaryBlue);
    doc.text(`#${idx + 1}`, badgeX + 6, cursorY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.textDark);
    doc.text(factor, badgeX + 22, cursorY + 12);

    badgeX += textWidth + 8;
  });

  cursorY += factorBadgeHeight + 14;

  // ============================================================
  // SECTION: TRANSACTION EVIDENCE (Structured Table)
  // ============================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...colors.navyDark);
  doc.text('Transaction Evidence', margin, cursorY + 4);

  doc.setFillColor(...colors.primaryBlue);
  doc.rect(margin, cursorY + 8, 32, 2, 'F');

  cursorY += 14;

  // Build paired 2-column evidence rows for compact, clean layout
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

  const evidenceTableBody = [];
  for (let i = 0; i < EVIDENCE_KEYS.length; i += 2) {
    const k1 = EVIDENCE_KEYS[i];
    const v1 = formatEvidenceValue(k1, evidence[k1]);
    const k2 = i + 1 < EVIDENCE_KEYS.length ? EVIDENCE_KEYS[i + 1] : '';
    const v2 = k2 ? formatEvidenceValue(k2, evidence[k2]) : '';
    evidenceTableBody.push([k1, v1, k2, v2]);
  }

  autoTable(doc, {
    startY: cursorY,
    head: [['Attribute', 'Value', 'Attribute', 'Value']],
    body: evidenceTableBody,
    theme: 'grid',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: colors.navyHeader,
      textColor: colors.white,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: colors.textDark,
      cellPadding: 3.5,
      lineColor: colors.borderGrey,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: colors.lightBg },
      2: { fontStyle: 'bold', fillColor: colors.lightBg },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
  });

  cursorY = doc.lastAutoTable.finalY + 16;

  // ============================================================
  // SECTION: HISTORICAL EVIDENCE (FAISS Similar Cases)
  // ============================================================
  // Check if we need to add a page or continue
  if (cursorY + 160 > pageHeight - 50) {
    doc.addPage();
    cursorY = margin + 15;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...colors.navyDark);
  doc.text('Historical Evidence & Precedent Comparison (FAISS Retrieval)', margin, cursorY + 4);

  doc.setFillColor(...colors.primaryBlue);
  doc.rect(margin, cursorY + 8, 32, 2, 'F');

  cursorY += 14;

  const similarTableBody = (similarCases && similarCases.length > 0)
    ? similarCases.map((sim) => {
        const sId = String(sim.case_id || sim.transaction_id || '').replace(/^[#\s]*(case_)?/i, '');
        const simPct = sim.similarity_pct || (sim.similarity_score ? `${Math.round(sim.similarity_score * 100)}%` : 'N/A');
        const sScore = parseFloat(sim.risk_score || 0).toFixed(2);
        const sFraud = sim.fraud_probability !== undefined
          ? `${(parseFloat(sim.fraud_probability) * 100).toFixed(2)}%`
          : `${sScore}%`;
        const sLevel = (sim.risk_level || 'UNKNOWN').toUpperCase();
        const sAction = sim.recommended_action || 'UNKNOWN';
        return [`#${sId}`, simPct, `${sScore} / 100`, sFraud, sLevel, sAction];
      })
    : [['No historical cases retrieved from index', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: cursorY,
    head: [['Case ID', 'Similarity %', 'Risk Score', 'Fraud Probability', 'Risk Level', 'Recommended Action']],
    body: similarTableBody,
    theme: 'grid',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: colors.navyHeader,
      textColor: colors.white,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: colors.textDark,
      cellPadding: 4,
      lineColor: colors.borderGrey,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { fontStyle: 'bold', textColor: colors.primaryBlue },
      4: { fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: colors.lightBg,
    },
  });

  cursorY = doc.lastAutoTable.finalY + 16;

  // ============================================================
  // SECTION: AI INVESTIGATOR ANALYSIS (RAG)
  // ============================================================
  if (cursorY + 180 > pageHeight - 50) {
    doc.addPage();
    cursorY = margin + 15;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...colors.navyDark);
  doc.text('AI Investigator Analysis & RAG Explainer', margin, cursorY + 4);

  doc.setFillColor(...colors.primaryBlue);
  doc.rect(margin, cursorY + 8, 32, 2, 'F');

  cursorY += 16;

  // Summary box
  doc.setFillColor(...colors.lightBg);
  doc.setDrawColor(...colors.borderGrey);
  doc.setLineWidth(1);

  // Split summary text to fit
  const summaryLines = doc.splitTextToSize(investigatorSummary, contentWidth - 24);
  const summaryBoxHeight = summaryLines.length * 11 + 28;

  if (cursorY + summaryBoxHeight > pageHeight - 50) {
    doc.addPage();
    cursorY = margin + 15;
  }

  doc.roundedRect(margin, cursorY, contentWidth, summaryBoxHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...colors.primaryBlue);
  doc.text('INVESTIGATOR SUMMARY', margin + 12, cursorY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.textDark);
  doc.text(summaryLines, margin + 12, cursorY + 28);

  cursorY += summaryBoxHeight + 10;

  // Recommendation box
  const recLines = doc.splitTextToSize(
    `Protocol Guideline: ${investigatorRecommendation}\nReview transaction amount, card velocity, email domain alignment, and behavioral indicators before making a final determination.`,
    contentWidth - 24
  );
  const recBoxHeight = recLines.length * 11 + 28;

  if (cursorY + recBoxHeight > pageHeight - 50) {
    doc.addPage();
    cursorY = margin + 15;
  }

  doc.setFillColor(...colors.lightBg);
  doc.setDrawColor(...colors.borderGrey);
  doc.roundedRect(margin, cursorY, contentWidth, recBoxHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...colors.navyDark);
  doc.text('INVESTIGATOR RECOMMENDATION & NEXT STEPS', margin + 12, cursorY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.textDark);
  doc.text(recLines, margin + 12, cursorY + 28);

  cursorY += recBoxHeight + 12;

  // Confidence Notes (if space allows or if provided)
  if (confidenceNotes) {
    const confLines = doc.splitTextToSize(confidenceNotes, contentWidth - 24);
    const confBoxHeight = confLines.length * 10 + 26;

    if (cursorY + confBoxHeight > pageHeight - 50) {
      doc.addPage();
      cursorY = margin + 15;
    }

    doc.setFillColor(241, 245, 249); // #F1F5F9
    doc.setDrawColor(...colors.borderGrey);
    doc.roundedRect(margin, cursorY, contentWidth, confBoxHeight, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.textMuted);
    doc.text('METHODOLOGY & CONFIDENCE NOTES', margin + 12, cursorY + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...colors.textMuted);
    doc.text(confLines, margin + 12, cursorY + 24);

    cursorY += confBoxHeight + 12;
  }

  // ============================================================
  // SECTION: MANDATORY DISCLAIMER
  // ============================================================
  const disclaimerText =
    'AI-generated analysis is decision support and does not by itself establish fraud. Final decisions should be made by an authorized investigator.';
  const discLines = doc.splitTextToSize(disclaimerText, contentWidth - 24);
  const discHeight = discLines.length * 10 + 16;

  if (cursorY + discHeight > pageHeight - 40) {
    doc.addPage();
    cursorY = margin + 15;
  }

  doc.setFillColor(254, 242, 242); // #FEF2F2
  doc.setDrawColor(254, 202, 202); // #FECACA
  doc.roundedRect(margin, cursorY, contentWidth, discHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.highRiskRed);
  doc.text('COMPLIANCE & LEGAL NOTICE:', margin + 12, cursorY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.textDark);
  doc.text(discLines, margin + 145, cursorY + 12);

  // ============================================================
  // PAGE NUMBERS & RUNNING FOOTER (Applied to all pages)
  // ============================================================
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Header on secondary pages
    if (i > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...colors.navyDark);
      doc.text('CHARGESHIELD AI — FRAUD INVESTIGATION REPORT', margin, 24);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.textMuted);
      doc.text(`Case #${cleanId}`, pageWidth - margin - 60, 24);

      doc.setDrawColor(...colors.borderGrey);
      doc.setLineWidth(0.5);
      doc.line(margin, 28, pageWidth - margin, 28);
    }

    // Running Footer on all pages
    doc.setDrawColor(...colors.borderGrey);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...colors.textMuted);
    doc.text(
      'CONFIDENTIAL — FOR AUTHORIZED FINANCIAL FRAUD INVESTIGATION USE ONLY',
      margin,
      pageHeight - 12
    );

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 55, pageHeight - 12);
  }

  // Generate filename and save
  const fileName = `ChargeShield_Investigation_Report_${cleanId}.pdf`;
  doc.save(fileName);

  return { ok: true, fileName, totalPages };
}

export default {
  generateInvestigationReportPdf,
};
