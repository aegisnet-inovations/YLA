import React from 'react';

const ChatMessage = ({ message, index }) => {
  return (
    <div 
      className={`message ${message.role}`}
      data-testid={`message-${message.role}-${index}`}
    >
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <div className="message-text">{message.content}</div>
      </div>
    </div>
  );
};

export default ChatMessage;
