import React, { useState, useEffect, useRef } from 'react';
import '@/App.css';
import axios from 'axios';
import { Send, Trash2, Sparkles, Code, Search, Mail } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize session
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
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const loadChatHistory = async (sid) => {
    try {
      const response = await axios.get(`${API}/chat/history/${sid}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
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
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header" data-testid="app-header">
        <div className="header-content">
          <div className="logo-section">
            <Sparkles className="logo-icon" size={32} />
            <h1 className="app-title">Grok AI Assistant</h1>
          </div>
          <div className="capabilities">
            <div className="capability-badge" data-testid="code-capability">
              <Code size={16} />
              <span>Code</span>
            </div>
            <div className="capability-badge" data-testid="search-capability">
              <Search size={16} />
              <span>Search</span>
            </div>
            <div className="capability-badge" data-testid="email-capability">
              <Mail size={16} />
              <span>Email</span>
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
          <div className="welcome-screen" data-testid="welcome-screen">
            <Sparkles className="welcome-icon" size={64} />
            <h2>Welcome to Your Personal AI Assistant</h2>
            <p>Powered by Grok - Ask me anything!</p>
            <div className="example-prompts">
              <button 
                onClick={() => setInputMessage('Help me debug this Python code')}
                className="example-prompt"
                data-testid="example-prompt-1"
              >
                Help me debug code
              </button>
              <button 
                onClick={() => setInputMessage('Explain quantum computing in simple terms')}
                className="example-prompt"
                data-testid="example-prompt-2"
              >
                Explain a concept
              </button>
              <button 
                onClick={() => setInputMessage('Write a Python function to sort a list')}
                className="example-prompt"
                data-testid="example-prompt-3"
              >
                Write code for me
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-list" data-testid="messages-list">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.role}`}
                data-testid={`message-${msg.role}-${index}`}
              >
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-content">
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
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
      <div className="input-container" data-testid="input-container">
        <div className="input-wrapper">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Grok anything..."
            className="message-input"
            data-testid="message-input"
            rows="1"
            disabled={isLoading}
          />
          <button 
            onClick={sendMessage} 
            disabled={!inputMessage.trim() || isLoading}
            className="send-button"
            data-testid="send-button"
          >
            <Send size={20} />
          </button>
        </div>
        <div className="input-footer">
          <span className="powered-by">Powered by xAI Grok</span>
        </div>
      </div>
    </div>
  );
}

export default App;