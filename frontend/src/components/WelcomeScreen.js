import React from 'react';
import { Sparkles } from 'lucide-react';

const WelcomeScreen = ({ setInputMessage }) => {
  return (
    <div className="welcome-screen" data-testid="welcome-screen">
      <Sparkles className="welcome-icon" size={64} />
      <h2>DROP - Engine of AEGIS-NET</h2>
      <p className="vision-text">
        In the near future, personal AI companions will be essential to daily life. 
        DROP is not just an assistant - it's the true engine running AEGIS-NET, 
        the most advanced AI protection and intelligence network ever created.
      </p>
      <div className="features-highlight">
        <div className="feature-pill">🎯 Never Wrong</div>
        <div className="feature-pill">🛡️ Fort Knox Security</div>
        <div className="feature-pill">👑 The King</div>
      </div>
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
  );
};

export default WelcomeScreen;
