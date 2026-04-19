import React, { useState, useEffect, useRef, useCallback } from 'react';
import '@/App.css';
import axios from 'axios';
import { Trash2, Sparkles, Code, Search, Clock, Star, HelpCircle, Shield } from 'lucide-react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import WelcomeScreen from '@/components/WelcomeScreen';
import ReviewModal from '@/components/ReviewModal';
import HowToUse from '@/components/HowToUse';
import AdminPage from '@/components/AdminPage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const ADMIN_TOKEN_KEY = 'yla_admin_token';

// Helper function to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const getAuthHeader = () => {
  const t = localStorage.getItem(ADMIN_TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const messagesEndRef = useRef(null);

  // Memoized scroll function
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load chat history function
  const loadChatHistory = useCallback(async (sid) => {
    try {
      const response = await axios.get(`${API}/chat/history/${sid}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }, []);

  // Check access status
  const checkAccess = useCallback(async (sid) => {
    try {
      const response = await axios.get(`${API}/access/${sid}`, { headers: getAuthHeader() });
      setAccessStatus(response.data);
    } catch (error) {
      console.error('Error checking access:', error);
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

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    // Check access
    if (accessStatus && !accessStatus.has_access) {
      alert(accessStatus.message);
      setShowReviewModal(true);
      return;
    }

    const userMessage = {
      id: generateUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        message: inputMessage,
        session_id: sessionId
      }, { headers: getAuthHeader() });

      const assistantMessage = {
        id: response.data.message_id,
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
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
  };

  const clearChat = async () => {
    if (window.confirm('Are you sure you want to clear all chat history?')) {
      try {
        await axios.delete(`${API}/chat/history/${sessionId}`);
        setMessages([]);
        const newSessionId = generateUUID();
        setSessionId(newSessionId);
        localStorage.setItem('grok_session_id', newSessionId);
      } catch (error) {
        console.error('Error clearing chat:', error);
      }
    }
  };

  return (
    <div className="app-container">
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

      {/* Chat Container */}
      <div className="chat-container" data-testid="chat-container">
        {messages.length === 0 ? (
          <WelcomeScreen setInputMessage={setInputMessage} />
        ) : (
          <div className="messages-list" data-testid="messages-list">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
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
