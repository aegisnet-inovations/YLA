import React, { useEffect, useState, useRef } from 'react';

/**
 * Renders a chat message.
 * If `animate` is true, types out the assistant content char-by-char
 * at `charsPerSec` speed. Otherwise renders instantly.
 */
const ChatMessage = ({ message, index, animate = false, charsPerSec = 25, onTyped }) => {
  const [displayText, setDisplayText] = useState(animate && message.role === 'assistant' ? '' : message.content);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!animate || message.role !== 'assistant') {
      setDisplayText(message.content);
      return;
    }
    const full = message.content || '';
    const delay = Math.max(8, Math.round(1000 / charsPerSec));
    let i = 0;
    setDisplayText('');
    doneRef.current = false;
    const id = setInterval(() => {
      i += 1;
      setDisplayText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onTyped?.();
        }
      }
    }, delay);
    return () => clearInterval(id);
  }, [animate, message.content, message.role, charsPerSec, onTyped]);

  return (
    <div
      className={`message ${message.role}`}
      data-testid={`message-${message.role}-${index}`}
    >
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <div className="message-text">{displayText}</div>
      </div>
    </div>
  );
};

export default ChatMessage;
