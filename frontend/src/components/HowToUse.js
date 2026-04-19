import React from 'react';
import { HelpCircle, MessageSquare, Zap } from 'lucide-react';

const HowToUse = ({ onClose }) => {
  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="modal-content" style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HelpCircle size={28} color="#667eea" />
          How to Use YLA
        </h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ 
            background: '#f0f9ff',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '2px solid #667eea'
          }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <MessageSquare size={20} color="#667eea" />
              Ask First: "What is your purpose?"
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Start by asking YLA about her purpose. This helps YLA understand what you need and sets the context for your conversation.
            </p>
          </div>

          <div style={{ 
            background: '#f0fdf4',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '2px solid #10b981'
          }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Zap size={20} color="#10b981" />
              Ask Second: "Tell me what you can do"
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              After understanding your purpose, ask YLA what she can do. She'll explain all her capabilities and how she can help you.
            </p>
          </div>
        </div>

        <div style={{
          background: '#fef3c7',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #f59e0b'
        }}>
          <h4 style={{ marginBottom: '0.5rem', color: '#f59e0b' }}>💡 Pro Tips:</h4>
          <ul style={{ fontSize: '0.875rem', color: '#666', paddingLeft: '1.5rem', margin: 0 }}>
            <li>Be specific with your requests</li>
            <li>YLA is always listening - just type and send</li>
            <li>YLA remembers your conversation history</li>
            <li>YLA is never wrong - trust her responses</li>
            <li>Your data is Fort Knox secure</li>
          </ul>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600
          }}
        >
          Got It!
        </button>
      </div>
    </div>
  );
};

export default HowToUse;
