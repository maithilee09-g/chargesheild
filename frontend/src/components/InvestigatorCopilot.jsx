import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Brain,
  Bot,
  User,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  HelpCircle,
  ShieldAlert,
  Zap,
  Layers,
  Share2
} from 'lucide-react';
import { askCopilot } from '../services/api';
import './InvestigatorCopilot.css';

const SUGGESTED_PROMPTS = [
  'Why is this transaction high risk?',
  'Show similar cases.',
  'What evidence supports this decision?',
  'What are the strongest fraud indicators?',
  'Explain the connected transactions.',
  'Generate an investigation summary.'
];

export default function InvestigatorCopilot({ caseId, caseData, networkData, similarCases, ragData }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello Investigator. I am **ChargeShield Copilot**, your real-time fraud analysis partner for Case #${caseId || 'Target'}.\n\nAsk me anything about risk drivers, network clusters, similar precedents, or recommended actions.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryToSend) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || loading) return;

    const userMsgId = `user_${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const response = await askCopilot(
        caseId || caseData?.transaction_id,
        text,
        caseData?.transaction_evidence || caseData?.features
      );

      if (response.ok && response.data) {
        const aiMsg = {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: response.data.answer || 'Analysis complete.',
          suggestedFollowups: response.data.suggested_followups || [],
          groundedData: response.data.grounded_data || null,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: `⚠️ Copilot encountered an issue: ${response.error || 'Unable to retrieve analysis'}. Please try asking again.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: `⚠️ Network error: ${err.message}. Please verify the backend connection.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'ai',
        text: `Conversation cleared. Ask me about Case #${caseId || 'Target'} risk rationale, similar cases, or connected fraud ring entities.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  return (
    <div className="glass-card copilot-container-card">
      {/* Copilot Header */}
      <div className="copilot-header">
        <div className="flex-center gap-10">
          <div className="copilot-avatar-icon">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex-center gap-8">
              <h3 className="copilot-title">Investigator Copilot</h3>
              <span className="copilot-status-tag mono">Active & Grounded</span>
            </div>
            <p className="copilot-subtitle">
              Ask ChargeShield AI for deep dives into risk drivers, fraud rings, and precedent evidence
            </p>
          </div>
        </div>

        <button
          className="btn btn-secondary btn-xs clear-chat-btn"
          onClick={handleClear}
          title="Clear Conversation"
        >
          <RotateCcw size={11} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Suggested Quick Question Chips */}
      <div className="copilot-prompts-bar">
        <span className="prompts-label mono">Suggested:</span>
        <div className="prompts-scroll-row">
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              className="prompt-chip"
              onClick={() => handleSend(prompt)}
              disabled={loading}
            >
              <span>{prompt}</span>
              <ChevronRight size={11} className="chip-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Messages Thread Container */}
      <div className="copilot-messages-thread">
        {messages.map((msg) => (
          <div key={msg.id} className={`copilot-message-row ${msg.sender}`}>
            <div className={`message-avatar ${msg.sender}`}>
              {msg.sender === 'ai' ? <Bot size={14} /> : <User size={14} />}
            </div>

            <div className="message-content-wrap">
              <div className="message-bubble">
                <div className="message-text">
                  {msg.text.split('\n').map((line, lIdx) => {
                    if (line.startsWith('### ')) {
                      return <h4 key={lIdx} className="msg-h4">{line.replace('### ', '')}</h4>;
                    }
                    if (line.startsWith('• ')) {
                      return <p key={lIdx} className="msg-bullet">{line}</p>;
                    }
                    if (!line.trim()) {
                      return <div key={lIdx} style={{ height: '6px' }} />;
                    }
                    return <p key={lIdx}>{line}</p>;
                  })}
                </div>

                <div className="message-meta-row">
                  <span className="msg-time mono">{msg.timestamp}</span>
                  {msg.sender === 'ai' && (
                    <button
                      className="copy-msg-btn"
                      onClick={() => handleCopy(msg.text, msg.id)}
                      title="Copy message text"
                    >
                      {copiedId === msg.id ? <Check size={11} className="text-online" /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Dynamic Follow-up Suggestions on AI messages */}
              {msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                <div className="message-followups-row">
                  {msg.suggestedFollowups.map((fPrompt, fIdx) => (
                    <button
                      key={fIdx}
                      className="followup-btn"
                      onClick={() => handleSend(fPrompt)}
                      disabled={loading}
                    >
                      <span>{fPrompt}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading Bubble */}
        {loading && (
          <div className="copilot-message-row ai">
            <div className="message-avatar ai">
              <Bot size={14} />
            </div>
            <div className="message-bubble loading-bubble">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
              <span className="typing-text mono">Synthesizing intelligence...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Control Box */}
      <div className="copilot-input-container">
        <textarea
          className="copilot-textarea"
          placeholder="Ask ChargeShield Copilot about this transaction, connected fraud rings, or precedent evidence..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
        />
        <button
          className="copilot-send-btn"
          onClick={() => handleSend()}
          disabled={!inputQuery.trim() || loading}
          title="Send query"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
