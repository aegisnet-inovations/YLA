import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LogOut, Users, Star, MessageSquare, DollarSign, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// All admin calls use cookies; no token stored in JS.
const adminAxios = axios.create({ baseURL: API, withCredentials: true });

const card = {
  background: 'white',
  padding: '1.5rem',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: '1px solid #e5e7eb',
};

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminAxios.post('/admin/login', { email, password });
      onLogin();
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '1rem',
    }}>
      <form onSubmit={submit} style={{ ...card, width: '100%', maxWidth: 420 }} data-testid="admin-login-form">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>YLA Admin</h1>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Owner access only.</p>

        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email</label>
        <input
          data-testid="admin-email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', marginBottom: '1rem', fontSize: '1rem' }}
        />

        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password</label>
        <input
          data-testid="admin-password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', marginBottom: '1rem', fontSize: '1rem' }}
        />

        {error && <p data-testid="admin-login-error" style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

        <button
          data-testid="admin-login-submit"
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '0.85rem', background: '#667eea', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '1rem', textAlign: 'center' }}>
          Once signed in, your regular chat on this device unlocks unlimited access.
        </p>
      </form>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={card} data-testid={`admin-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: color, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} />
        </div>
        <span style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, r] = await Promise.all([
        adminAxios.get('/admin/stats'),
        adminAxios.get('/admin/users'),
        adminAxios.get('/admin/reviews'),
      ]);
      setStats(s.data);
      setUsers(u.data.users);
      setReviews(r.data.reviews);
    } catch (err) {
      if (err.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    try { await adminAxios.post('/admin/logout'); } catch { /* noop */ }
    onLogout();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{
        background: 'white', borderBottom: '1px solid #e5e7eb', padding: '1rem 2rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>YLA Admin Dashboard</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>Welcome back, owner.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            data-testid="admin-refresh"
            onClick={load}
            style={{ padding: '0.5rem 1rem', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <a
            href="/"
            style={{ padding: '0.5rem 1rem', background: '#667eea', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}
          >
            Open Chat
          </a>
          <button
            data-testid="admin-logout"
            onClick={handleLogout}
            style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
        {loading && !stats ? (
          <p>Loading…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <Stat icon={Users} label="Total Users" value={stats?.total_users ?? 0} color="#667eea" />
              <Stat icon={DollarSign} label="Paid" value={stats?.paid_users ?? 0} color="#10b981" />
              <Stat icon={Star} label="Reviewed" value={stats?.reviewed_users ?? 0} color="#f59e0b" />
              <Stat icon={MessageSquare} label="Messages" value={stats?.total_messages ?? 0} color="#8b5cf6" />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                data-testid="admin-tab-users"
                onClick={() => setTab('users')}
                style={{ padding: '0.5rem 1rem', background: tab === 'users' ? '#667eea' : '#e5e7eb', color: tab === 'users' ? 'white' : '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >Users ({users.length})</button>
              <button
                data-testid="admin-tab-reviews"
                onClick={() => setTab('reviews')}
                style={{ padding: '0.5rem 1rem', background: tab === 'reviews' ? '#667eea' : '#e5e7eb', color: tab === 'reviews' ? 'white' : '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >Reviews ({reviews.length})</button>
            </div>

            {tab === 'users' && (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="admin-users-table">
                    <thead>
                      <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Session ID</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Trial Start</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Hours</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.session_id} style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.session_id.slice(0, 16)}…</td>
                          <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{u.trial_start?.slice(0, 16).replace('T', ' ')}</td>
                          <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{u.hours_since_start ?? '—'}h</td>
                          <td style={{ padding: '0.75rem' }}>
                            {u.has_paid ? <span style={{ color: '#10b981', fontWeight: 600 }}>Paid</span>
                              : u.has_reviewed ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>Reviewed</span>
                              : u.trial_expired ? <span style={{ color: '#ef4444', fontWeight: 600 }}>Expired</span>
                              : <span style={{ color: '#6b7280' }}>Trial</span>}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div style={{ display: 'grid', gap: '1rem' }} data-testid="admin-reviews-list">
                {reviews.map((r) => (
                  <div key={r.session_id} style={card}>
                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={18} fill="#f59e0b" stroke="#f59e0b" />
                      ))}
                    </div>
                    <p style={{ color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>{r.review_text}</p>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>Session: {r.session_id.slice(0, 12)}…</p>
                  </div>
                ))}
                {reviews.length === 0 && (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No reviews yet</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  // null = still checking session, true = authed, false = not authed
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminAxios.get('/admin/me')
      .then(() => { if (!cancelled) setAuthed(true); })
      .catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, []);

  if (authed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        Loading…
      </div>
    );
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
