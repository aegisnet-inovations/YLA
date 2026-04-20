import React, { useState } from 'react';
import { Mail, Sparkles } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const api = axios.create({ baseURL: API, withCredentials: true });

export default function EmailGate({ sessionId, onComplete }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/register-email', { session_id: sessionId, email });
      localStorage.setItem('yla_email', email);
      onComplete();
    } catch (error) {
      setErr(error.response?.data?.detail || 'Please enter a valid email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <form
        onSubmit={submit}
        data-testid="email-gate-form"
        style={{
          background: 'white', padding: '2.25rem', borderRadius: 16, width: '100%', maxWidth: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <Sparkles size={28} color="#667eea" />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Welcome to YLA</h1>
        </div>
        <p style={{ color: '#4b5563', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Drop your email to start your <strong>24-hour free trial</strong>. No spam — we'll only contact you about your account.
        </p>

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Email address</label>
        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
          <Mail size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            data-testid="email-gate-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%', padding: '0.8rem 0.8rem 0.8rem 2.35rem',
              border: '2px solid #e5e7eb', borderRadius: 10, fontSize: '1rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {err && <p data-testid="email-gate-error" style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: 0 }}>{err}</p>}

        <button
          data-testid="email-gate-submit"
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '0.9rem', background: '#667eea', color: 'white',
            border: 'none', borderRadius: 10, fontSize: '1rem', fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
            marginTop: '0.75rem',
          }}
        >
          {busy ? 'Starting trial…' : 'Start my 24-hour free trial'}
        </button>

        <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginTop: '1rem' }}>
          By continuing you agree to receive account-related emails only.
        </p>
      </form>
    </div>
  );
}
