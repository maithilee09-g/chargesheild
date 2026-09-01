import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseDetails from './pages/CaseDetails';
import Analytics from './pages/Analytics';
import Investigate from './pages/Investigate';
import './App.css';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const location = useLocation();

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Determine current page title & subtitle based on pathname
  const getPageInfo = () => {
    const p = location.pathname;
    if (p === '/') {
      return {
        title: 'Fraud Investigation Dashboard',
        subtitle: 'Real-time telemetry and risk overview'
      };
    }
    if (p === '/investigate') {
      return {
        title: 'Investigate Transaction',
        subtitle: 'Submit transaction telemetry for ML risk triage, FAISS precedent search, and RAG analysis'
      };
    }
    if (p === '/cases') {
      return {
        title: 'Investigation Cases Repository',
        subtitle: 'Browse, search, and filter fraud investigation dossiers'
      };
    }
    if (p.startsWith('/cases/')) {
      const id = p.split('/')[2];
      return {
        title: `Case #${id} Investigation`,
        subtitle: 'SHAP risk factors, evidence, and RAG contextual precedent explanation'
      };
    }
    if (p === '/analytics') {
      return {
        title: 'Risk Intelligence Analytics',
        subtitle: 'Distributions, trend metrics, and operational breakdown'
      };
    }
    return { title: 'ChargeShield AI', subtitle: 'Fraud Investigation Platform' };
  };

  const pageInfo = getPageInfo();

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        totalCasesCount={totalCount}
      />

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        <Navbar
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          pageTitle={pageInfo.title}
          subtitle={pageInfo.subtitle}
        />

        <main className="main-content">
          <Routes key={refreshKey}>
            <Route path="/" element={<Dashboard setTotalCount={setTotalCount} />} />
            <Route path="/investigate" element={<Investigate />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:caseId" element={<CaseDetails />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<Dashboard setTotalCount={setTotalCount} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
