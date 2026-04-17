import React, { useState, useEffect, useRef, useCallback } from 'react';
import '@/App.css';
import axios from 'axios';
import { Trash2, Sparkles, Code, Search } from 'lucide-react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import WelcomeScreen from '@/components/WelcomeScreen';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
  const [ownerKey, setOwnerKey] = useState('');
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

  // Initialize session - now with proper dependencies
  useEffect(() => {
    const storedSessionId = localStorage.getItem('grok_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadChatHistory(storedSessionId);
    } else {
      const newSessionId = generateUUID();
      setSessionId(newSessionId);
      localStorage.setItem('grok_session_id', newSessionId);
    }
  }, [loadChatHistory]);

  // Auto-scroll with proper dependency
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    
    if (!ownerKey.trim()) {
      alert('Owner Key required! The owner is the barrier - DROP cannot run without your key.');
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
        session_id: sessionId,
        owner_key: ownerKey
      });

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
            <h1 className="app-title">DROP</h1>
          </div>
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
        ownerKey={ownerKey}
        setOwnerKey={setOwnerKey}
      />
    </div>
  );
}

export default App;
