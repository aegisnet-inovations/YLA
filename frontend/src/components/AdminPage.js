import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LogOut, Users, Star, MessageSquare, DollarSign, RefreshCw, Brain, Trash2, Plus } from 'lucide-react';

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

const btnBase = {
  padding: '0.35rem 0.65rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'white',
};
const btnGreen = { ...btnBase, background: '#10b981' };
const btnAmber = { ...btnBase, background: '#f59e0b' };
const btnRed = { ...btnBase, background: '#ef4444' };

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
  const [memory, setMemory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [actionBusy, setActionBusy] = useState(null);
  const [newFact, setNewFact] = useState('');
  const [memBusy, setMemBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, r, m] = await Promise.all([
        adminAxios.get('/admin/stats'),
        adminAxios.get('/admin/users'),
        adminAxios.get('/admin/reviews'),
        adminAxios.get('/admin/memory'),
      ]);
      setStats(s.data);
      setUsers(u.data.users);
      setReviews(r.data.reviews);
      setMemory(m.data.facts);
    } catch (err) {
      if (err.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (path, session_id) => {
    setActionBusy(session_id + path);
    try {
      await adminAxios.post(path, { session_id });
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Action failed');
    } finally {
      setActionBusy(null);
    }
  };

  const addFact = async (e) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    setMemBusy(true);
    try {
      await adminAxios.post('/admin/memory', { fact: newFact.trim() });
      setNewFact('');
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add fact');
    } finally {
      setMemBusy(false);
    }
  };

  const deleteFact = async (id) => {
    if (!window.confirm('Forget this fact permanently?')) return;
    try {
      await adminAxios.delete(`/admin/memory/${id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed');
    }
  };

  const clearAllMemory = async () => {
    if (!window.confirm('Wipe ALL owner memory? YLA will forget everything it has learned about you.')) return;
    try {
      await adminAxios.delete('/admin/memory');
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Clear failed');
    }
  };

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
              <button
                data-testid="admin-tab-memory"
                onClick={() => setTab('memory')}
                style={{ padding: '0.5rem 1rem', background: tab === 'memory' ? '#667eea' : '#e5e7eb', color: tab === 'memory' ? 'white' : '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              ><Brain size={16} /> Memory ({memory.length})</button>
            </div>

            {tab === 'users' && (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="admin-users-table">
                    <thead>
                      <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Started</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Hours</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const busyKey = (p) => actionBusy === u.session_id + p;
                        return (
                          <tr key={u.session_id} style={{ borderTop: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                              {u.email ? (
                                <a href={`mailto:${u.email}`} style={{ color: '#667eea', textDecoration: 'none', fontWeight: 500 }}>
                                  {u.email}
                                </a>
                              ) : (
                                <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>(anonymous)</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{u.trial_start?.slice(0, 16).replace('T', ' ')}</td>
                            <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{u.hours_since_start ?? '—'}h</td>
                            <td style={{ padding: '0.75rem' }}>
                              {u.has_paid ? <span style={{ color: '#10b981', fontWeight: 600 }}>Paid</span>
                                : u.has_reviewed ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>Lifetime</span>
                                : u.trial_expired ? <span style={{ color: '#ef4444', fontWeight: 600 }}>Expired</span>
                                : <span style={{ color: '#6b7280' }}>Trial</span>}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {!u.has_paid && (
                                  <button
                                    data-testid={`action-mark-paid-${u.session_id}`}
                                    disabled={busyKey('/admin/users/mark-paid')}
                                    onClick={() => runAction('/admin/users/mark-paid', u.session_id)}
                                    style={btnGreen}
                                  >{busyKey('/admin/users/mark-paid') ? '…' : 'Mark Paid'}</button>
                                )}
                                {!u.has_reviewed && !u.has_paid && (
                                  <button
                                    data-testid={`action-grant-${u.session_id}`}
                                    disabled={busyKey('/admin/users/grant-lifetime')}
                                    onClick={() => runAction('/admin/users/grant-lifetime', u.session_id)}
                                    style={btnAmber}
                                  >{busyKey('/admin/users/grant-lifetime') ? '…' : 'Grant'}</button>
                                )}
                                {(u.has_paid || u.has_reviewed) && (
                                  <button
                                    data-testid={`action-revoke-${u.session_id}`}
                                    disabled={busyKey('/admin/users/revoke')}
                                    onClick={() => {
                                      if (window.confirm(`Revoke access for ${u.email || u.session_id.slice(0, 8)}?`)) {
                                        runAction('/admin/users/revoke', u.session_id);
                                      }
                                    }}
                                    style={btnRed}
                                  >{busyKey('/admin/users/revoke') ? '…' : 'Revoke'}</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {users.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No users yet</td></tr>
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
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                      {r.email ? (
                        <a href={`mailto:${r.email}`} style={{ color: '#667eea', textDecoration: 'none' }}>{r.email}</a>
                      ) : 'Anonymous'}
                      {' • '}Session: {r.session_id.slice(0, 12)}…
                    </p>
                  </div>
                ))}
                {reviews.length === 0 && (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No reviews yet</p>
                )}
              </div>
            )}

            {tab === 'memory' && (
              <div data-testid="admin-memory-panel">
                <div style={{ ...card, marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Brain size={20} color="#667eea" />
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>AEGIS Owner Memory</h2>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                    Persistent facts YLA knows about you. Auto-extracted from every owner chat and injected into YLA's system prompt so she remembers you across sessions.
                  </p>
                  <form onSubmit={addFact} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      data-testid="memory-add-input"
                      type="text"
                      value={newFact}
                      onChange={(e) => setNewFact(e.target.value)}
                      placeholder="Add a fact manually (e.g., 'The Owner is based in Missouri.')"
                      style={{ flex: 1, padding: '0.65rem 0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                    <button
                      data-testid="memory-add-submit"
                      type="submit"
                      disabled={memBusy || !newFact.trim()}
                      style={{ ...btnBase, background: '#667eea', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', opacity: memBusy ? 0.6 : 1 }}
                    >
                      <Plus size={16} /> Add
                    </button>
                    {memory.length > 0 && (
                      <button
                        data-testid="memory-clear-all"
                        type="button"
                        onClick={clearAllMemory}
                        style={{ ...btnRed, padding: '0.65rem 1rem', fontSize: '0.85rem' }}
                      >
                        Wipe All
                      </button>
                    )}
                  </form>
                </div>

                <div style={{ display: 'grid', gap: '0.5rem' }} data-testid="admin-memory-list">
                  {memory.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        ...card,
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, color: '#111827', fontSize: '0.95rem' }}>{f.fact}</p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.1rem 0.5rem',
                            background: f.source === 'auto' ? '#ede9fe' : '#dbeafe',
                            color: f.source === 'auto' ? '#6d28d9' : '#1e40af',
                            borderRadius: 999,
                            fontWeight: 600,
                            marginRight: '0.5rem',
                          }}>{f.source === 'auto' ? 'AUTO' : 'MANUAL'}</span>
                          {f.created_at?.slice(0, 16).replace('T', ' ')}
                        </p>
                      </div>
                      <button
                        data-testid={`memory-delete-${f.id}`}
                        onClick={() => deleteFact(f.id)}
                        style={{ ...btnRed, padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        title="Delete fact"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {memory.length === 0 && (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
                      No memories yet. Chat with YLA while signed in as owner — she'll start learning automatically.
                    </p>
                  )}
                </div>
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
