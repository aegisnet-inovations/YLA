import React from 'react';
import { Send } from 'lucide-react';

const ChatInput = ({ 
  inputMessage, 
  setInputMessage, 
  isLoading, 
  onSend,
  ownerKey,
  setOwnerKey
}) => {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="input-container" data-testid="input-container">
      <div className="owner-auth" style={{marginBottom: '0.5rem', fontSize: '0.75rem', color: '#666'}}>
        <input
          type="password"
          value={ownerKey}
          onChange={(e) => setOwnerKey(e.target.value)}
          placeholder="Owner Key (Required)"
          className="owner-key-input"
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            width: '200px',
            fontSize: '0.875rem'
          }}
        />
        <span style={{marginLeft: '0.5rem', opacity: 0.7}}>🔑 Owner is the Key</span>
      </div>
      <div className="input-wrapper">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="How may I assist you?"
          className="message-input"
          data-testid="message-input"
          rows="1"
          disabled={isLoading}
        />
        <button 
          onClick={onSend} 
          disabled={!inputMessage.trim() || isLoading}
          className="send-button"
          data-testid="send-button"
        >
          <Send size={20} />
        </button>
      </div>
      <div className="input-footer">
        <span className="powered-by">DROP • Powered by xAI</span>
      </div>
    </div>
  );
};

export default ChatInput;
