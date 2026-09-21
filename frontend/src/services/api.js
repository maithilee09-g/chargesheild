import axios from 'axios';
import { API_BASE_URL } from '../config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fetch general API health status
 */
export async function getApiHealth() {
  try {
    const response = await apiClient.get('/api/health');
    return { ok: true, data: response.data };
  } catch (err) {
    return { ok: false, error: err.message || 'API unavailable' };
  }
}

/**
 * Fetch MongoDB database health status
 */
export async function getDbHealth() {
  try {
    const response = await apiClient.get('/api/db/health');
    return { ok: true, data: response.data };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || err.message || 'MongoDB unavailable' };
  }
}

/**
 * Fetch all recent cases stored in MongoDB
 */
export async function getStoredCases(limit = 50) {
  try {
    const response = await apiClient.get(`/api/db/cases?limit=${limit}`);
    return { ok: true, data: response.data?.cases || [] };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to fetch cases from database',
      data: []
    };
  }
}

/**
 * Fetch specific investigation case by ID with automatic fallback to file reports
 */
export async function getCaseDetails(caseId) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    // Attempt to load from MongoDB first
    const response = await apiClient.get(`/api/db/cases/${cleanId}`);
    if (response.data && !response.data.error) {
      return { ok: true, data: response.data, source: 'database' };
    }
  } catch (err) {
    // If not in DB, fall through to filesystem endpoint
  }

  try {
    // Fallback to reports directory via backend /api/cases/:id
    const fileResponse = await apiClient.get(`/api/cases/${cleanId}`);
    if (fileResponse.data && !fileResponse.data.error) {
      return { ok: true, data: fileResponse.data, source: 'filesystem' };
    }
    return { ok: false, error: `Case #${cleanId} not found` };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || `Case #${cleanId} not found on server`
    };
  }
}

/**
 * Retrieve similar historical cases via FAISS
 */
export async function getSimilarCases(caseId, topK = 5) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    const response = await apiClient.get(`/api/cases/${cleanId}/similar?top_k=${topK}`);
    return {
      ok: true,
      data: response.data?.similar_cases || [],
      caseId: cleanId
    };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || 'Unable to retrieve similar cases from FAISS engine',
      data: []
    };
  }
}

/**
 * Fetch RAG explanation from MongoDB with fallback to direct engine generation
 */
export async function getRagExplanation(caseId, topK = 5) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    const response = await apiClient.get(`/api/db/cases/${cleanId}/rag`);
    if (response.data && !response.data.error) {
      return { ok: true, data: response.data, source: 'database' };
    }
  } catch (err) {
    // If not in DB, fallback to live explanation endpoint
  }

  try {
    const fallbackRes = await apiClient.get(`/api/cases/${cleanId}/explanation?top_k=${topK}`);
    if (fallbackRes.data && !fallbackRes.data.error) {
      return { ok: true, data: fallbackRes.data, source: 'live_generator' };
    }
    return { ok: false, error: `RAG explanation not found for case #${cleanId}` };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || 'Unable to generate RAG explanation'
    };
  }
}

/**
 * Live transaction analysis (XGBoost + FAISS + RAG + MongoDB pipeline)
 * Uses extended 120-second timeout to allow the complete ML and RAG pipeline to finish.
 */
export async function analyzeTransaction(payload) {
  try {
    const response = await apiClient.post('/api/analyze', payload, {
      timeout: 120000,
    });
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Transaction analysis failed'
    };
  }
}

/**
 * Fetch Fraud Network relationship graph and ring summary for a case
 */
export async function getCaseNetwork(caseId) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    const response = await apiClient.get(`/api/cases/${cleanId}/network`);
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to fetch fraud network data',
      data: null
    };
  }
}

/**
 * Fetch quantitative SHAP contributing factors and natural language explanation
 */
export async function getCaseSuspiciousFactors(caseId) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    const response = await apiClient.get(`/api/cases/${cleanId}/suspicious-factors`);
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to fetch suspicious factors',
      data: null
    };
  }
}

/**
 * Fetch Evidence Strength score (0-100%) and 4-pillar source breakdown
 */
export async function getCaseEvidenceStrength(caseId) {
  const cleanId = String(caseId).replace(/^[#\s]*(case_)?/i, '');
  try {
    const response = await apiClient.get(`/api/cases/${cleanId}/evidence-strength`);
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to fetch evidence strength',
      data: null
    };
  }
}

/**
 * Ask ChargeShield Investigator Copilot
 */
export async function askCopilot(caseId, query, transactionData = null) {
  const cleanId = String(caseId || '').replace(/^[#\s]*(case_)?/i, '');
  try {
    const payload = {
      query,
      case_id: cleanId || undefined,
      transaction_data: transactionData || undefined
    };
    const response = await apiClient.post('/api/copilot/query', payload);
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to query investigator copilot',
      data: null
    };
  }
}

/**
 * Fetch platform-wide fraud ring and network analytics statistics
 */
export async function getNetworkAnalytics() {
  try {
    const response = await apiClient.get('/api/analytics/network-stats');
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message || 'Failed to fetch network analytics',
      data: null
    };
  }
}

export default {
  getApiHealth,
  getDbHealth,
  getStoredCases,
  getCaseDetails,
  getSimilarCases,
  getRagExplanation,
  analyzeTransaction,
  getCaseNetwork,
  getCaseSuspiciousFactors,
  getCaseEvidenceStrength,
  askCopilot,
  getNetworkAnalytics,
};
