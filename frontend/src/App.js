import React, { useState, useEffect, useRef, useCallback } from 'react';
import '@/App.css';
import axios from 'axios';
import { Trash2, Sparkles, Code, Search, Clock, Star, HelpCircle, Shield, Mic, MicOff } from 'lucide-react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import WelcomeScreen from '@/components/WelcomeScreen';
import ReviewModal from '@/components/ReviewModal';
import HowToUse from '@/components/HowToUse';
import AdminPage from '@/components/AdminPage';
import EmailGate from '@/components/EmailGate';
import useVoiceSentinel from '@/hooks/useVoiceSentinel';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// All requests include credentials so the httpOnly admin cookie is sent when present.
const api = axios.create({ baseURL: API, withCredentials: true });

// Helper function to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(() => !!localStorage.getItem('yla_email'));
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('yla_voice') === '1');
  const [animatingId, setAnimatingId] = useState(null);
  const messagesEndRef = useRef(null);

  // Memoized scroll function
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load chat history function
  const loadChatHistory = useCallback(async (sid) => {
    try {
      const response = await api.get(`/chat/history/${sid}`);
      setMessages(response.data.messages);
    } catch {
      // non-fatal: show empty chat
    }
  }, []);

  // Check access status
  const checkAccess = useCallback(async (sid) => {
    try {
      const response = await api.get(`/access/${sid}`);
      setAccessStatus(response.data);
    } catch {
      // non-fatal: banner will simply not render
    }
  }, []);

  // Initialize session - now with proper dependencies
  useEffect(() => {
    const storedSessionId = localStorage.getItem('grok_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadChatHistory(storedSessionId);
      checkAccess(storedSessionId);
    } else {
      const newSessionId = generateUUID();
      setSessionId(newSessionId);
      localStorage.setItem('grok_session_id', newSessionId);
      checkAccess(newSessionId);
    }
  }, [loadChatHistory, checkAccess]);

  // Auto-scroll with proper dependency
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendText = useCallback(async (text, { spoken = false } = {}) => {
    const trimmed = (text || '').trim();
    if (!trimmed || isLoading) return;

    // Check access
    if (accessStatus && !accessStatus.has_access) {
      if (!spoken) { alert(accessStatus.message); setShowReviewModal(true); }
      return;
    }

    const userMessage = {
      id: generateUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await api.post('/chat', {
        message: trimmed,
        session_id: sessionId
      });

      const assistantMessage = {
        id: response.data.message_id,
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
        _fresh: true,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setAnimatingId(assistantMessage.id);
      if (spoken && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(assistantMessage.content);
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        } catch { /* noop */ }
      }
    } catch {
      const errorMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [accessStatus, isLoading, sessionId]);

  const sendMessage = () => sendText(inputMessage);

  // AEGIS Sentinel: always-on voice (wake word "YLA")
  const handleVoiceCommand = useCallback((spokenText) => {
    sendText(spokenText, { spoken: true });
  }, [sendText]);

  const voice = useVoiceSentinel({
    enabled: voiceEnabled,
    onCommand: handleVoiceCommand,
  });

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem('yla_voice', next ? '1' : '0');
  };

  const clearChat = async () => {
    if (window.confirm('Are you sure you want to clear all chat history?')) {
      try {
        await api.delete(`/chat/history/${sessionId}`);
        setMessages([]);
        const newSessionId = generateUUID();
        setSessionId(newSessionId);
        localStorage.setItem('grok_session_id', newSessionId);
      } catch {
        // non-fatal
      }
    }
  };

  const showEmailGate =
    sessionId &&
    !emailCaptured &&
    accessStatus &&
    accessStatus.access_type !== 'owner';

  return (
    <div className="app-container">
      {showEmailGate && (
        <EmailGate
          sessionId={sessionId}
          onComplete={() => setEmailCaptured(true)}
        />
      )}
      {/* Header */}
      <div className="header" data-testid="app-header">
        <div className="header-content">
          <div className="logo-section">
            <Sparkles className="logo-icon" size={32} />
            <h1 className="app-title">YLA</h1>
          </div>
          {accessStatus && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: accessStatus.access_type === 'owner' ? '#111827' : (accessStatus.has_access ? '#10b981' : '#ef4444'),
              color: 'white',
              borderRadius: '20px',
              fontSize: '0.875rem'
            }}>
              {accessStatus.access_type === 'owner' && <Shield size={16} />}
              {accessStatus.access_type === 'trial' && <Clock size={16} />}
              {accessStatus.access_type === 'review' && <Star size={16} fill="white" />}
              <span>{accessStatus.access_type === 'owner' ? 'OWNER' : (accessStatus.time_remaining || accessStatus.access_type.toUpperCase())}</span>
              {/* Only show offer button after 12 hours */}
              {accessStatus.access_type === 'trial' && accessStatus.message.includes('SPECIAL OFFER') && (
                <button
                  onClick={() => setShowReviewModal(true)}
                  style={{
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.75rem',
                    background: 'white',
                    color: '#10b981',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  🎁 Special Offer
                </button>
              )}
            </div>
          )}
          <div className="capabilities">
            <div className="capability-badge" data-testid="accuracy-badge">
              <Code size={16} />
              <span>Never Wrong</span>
            </div>
            <div className="capability-badge" data-testid="security-badge">
              <Search size={16} />
              <span>Fort Knox Security</span>
            </div>
          </div>
          <button
            onClick={toggleVoice}
            className="clear-button"
            data-testid="voice-toggle"
            title={voice.supported ? (voiceEnabled ? `AEGIS Sentinel: ${voice.status}` : 'Enable always-on voice (say "YLA…")') : 'Voice not supported in this browser'}
            disabled={!voice.supported}
            style={{
              background: voiceEnabled
                ? (voice.status === 'speaking' ? '#8b5cf6' : voice.status === 'armed' ? '#f59e0b' : '#10b981')
                : '#6b7280',
              marginRight: '0.5rem',
              opacity: voice.supported ? 1 : 0.5,
              cursor: voice.supported ? 'pointer' : 'not-allowed',
            }}
          >
            {voiceEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button 
            onClick={() => setShowHowTo(true)}
            className="clear-button"
            style={{ background: '#667eea', marginRight: '0.5rem' }}
            title="How to use YLA"
          >
            <HelpCircle size={20} />
          </button>
          <button 
            onClick={clearChat} 
            className="clear-button"
            data-testid="clear-chat-button"
            title="Clear chat history"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {voiceEnabled && voice.supported && (
        <div
          data-testid="voice-status-banner"
          style={{
            background:
              voice.status === 'speaking' ? '#ede9fe'
              : voice.status === 'armed' ? '#fef3c7'
              : voice.status === 'denied' ? '#fee2e2'
              : '#dcfce7',
            color: '#111827',
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <Mic size={14} />
          {voice.status === 'denied' && 'Microphone permission denied. Enable it in your browser settings.'}
          {voice.status === 'speaking' && 'YLA is speaking…'}
          {voice.status === 'armed' && 'Listening for your command…'}
          {(voice.status === 'listening' || voice.status === 'idle') &&
            'AEGIS Sentinel active — say "YLA" followed by your command.'}
        </div>
      )}

      {/* Chat Container */}
      <div className="chat-container" data-testid="chat-container">
        {messages.length === 0 ? (
          <WelcomeScreen setInputMessage={setInputMessage} />
        ) : (
          <div className="messages-list" data-testid="messages-list">
            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                index={idx}
                animate={msg.id === animatingId}
                charsPerSec={25}
                onTyped={() => { if (msg.id === animatingId) setAnimatingId(null); }}
              />
            ))}
            {isLoading && (
              <div className="message assistant" data-testid="loading-indicator">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <ChatInput 
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        isLoading={isLoading}
        onSend={sendMessage}
      />
      
      {showReviewModal && (
        <ReviewModal
          sessionId={sessionId}
          onSuccess={() => {
            setShowReviewModal(false);
            checkAccess(sessionId);
            alert('🎉 Thank you! You now have unlimited FREE access to DROP!');
          }}
          onClose={() => setShowReviewModal(false)}
        />
      )}
      
      {showHowTo && (
        <HowToUse onClose={() => setShowHowTo(false)} />
      )}
    </div>
  );
}

export default App;
