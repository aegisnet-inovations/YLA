import React from 'react';
import { Send } from 'lucide-react';

const ChatInput = ({ 
  inputMessage, 
  setInputMessage, 
  isLoading, 
  onSend 
}) => {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="input-container" data-testid="input-container">
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
