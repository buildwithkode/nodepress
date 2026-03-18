'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/axios';

/* ─── Password strength helper ─────────────────────────────── */
function getStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: '', color: 'transparent', width: '0%' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Very Weak', color: '#d63638', width: '20%' };
  if (score === 2) return { label: 'Weak', color: '#dba617', width: '40%' };
  if (score === 3) return { label: 'Medium', color: '#dba617', width: '60%' };
  if (score === 4) return { label: 'Strong', color: '#00a32a', width: '80%' };
  return { label: 'Very Strong', color: '#00a32a', width: '100%' };
}

/* ─── Styles (WordPress-inspired) ──────────────────────────── */
const s = {
  page: {
    minHeight: '100vh',
    background: '#f0f0f1',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    color: '#1d2327',
  } as React.CSSProperties,

  logo: {
    textAlign: 'center' as const,
    padding: '36px 0 20px',
  },

  logoBox: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#2271b1',
    color: '#fff',
    fontSize: 36,
    fontWeight: 800,
    boxShadow: '0 4px 16px rgba(34,113,177,0.35)',
    letterSpacing: -1,
  } as React.CSSProperties,

  logoText: {
    display: 'block',
    marginTop: 12,
    fontSize: 13,
    color: '#50575e',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },

  container: {
    background: '#fff',
    border: '1px solid #c3c4c7',
    borderRadius: 4,
    maxWidth: 530,
    margin: '0 auto 40px',
    padding: '26px 36px 36px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  } as React.CSSProperties,

  h1: {
    fontSize: 23,
    fontWeight: 400,
    color: '#1d2327',
    margin: '0 0 20px',
    borderBottom: '1px solid #e6e6e6',
    paddingBottom: 14,
  } as React.CSSProperties,

  infoText: {
    color: '#50575e',
    lineHeight: 1.7,
    marginBottom: 24,
    fontSize: 14,
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: 8,
  },

  th: {
    textAlign: 'right' as const,
    padding: '10px 16px 10px 0',
    verticalAlign: 'top' as const,
    fontWeight: 600,
    fontSize: 14,
    color: '#1d2327',
    width: 160,
    lineHeight: 1.4,
  } as React.CSSProperties,

  td: {
    padding: '8px 0',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '6px 10px',
    fontSize: 14,
    border: '1px solid #8c8f94',
    borderRadius: 4,
    boxSizing: 'border-box' as const,
    color: '#1d2327',
    background: '#fff',
    outline: 'none',
    height: 36,
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  hint: {
    fontSize: 12,
    color: '#646970',
    marginTop: 5,
    lineHeight: 1.5,
  } as React.CSSProperties,

  error: {
    fontSize: 12,
    color: '#d63638',
    marginTop: 4,
  } as React.CSSProperties,

  btn: {
    display: 'inline-block',
    padding: '6px 22px',
    fontSize: 14,
    fontWeight: 600,
    background: '#2271b1',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    lineHeight: '2.15384615',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.15s',
  } as React.CSSProperties,

  btnHover: { background: '#135e96' } as React.CSSProperties,

  successTable: {
    borderCollapse: 'collapse' as const,
    width: '100%',
    marginBottom: 20,
  },

  successTh: {
    textAlign: 'right' as const,
    padding: '8px 16px 8px 0',
    fontWeight: 600,
    width: 140,
    verticalAlign: 'top' as const,
  } as React.CSSProperties,

  successTd: {
    padding: '8px 0',
    verticalAlign: 'top' as const,
    color: '#1d2327',
  } as React.CSSProperties,

  noticeBox: {
    background: '#fcf9e8',
    border: '1px solid #dba617',
    borderLeft: '4px solid #dba617',
    padding: '12px 16px',
    marginBottom: 20,
    borderRadius: 2,
    fontSize: 13,
    color: '#50575e',
  } as React.CSSProperties,

  footer: {
    textAlign: 'center' as const,
    color: '#646970',
    fontSize: 13,
    paddingBottom: 24,
  },
};

/* ─── Component ─────────────────────────────────────────────── */
export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const [siteName, setSiteName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');

  const strength = getStrength(password);

  useEffect(() => {
    api.get('/auth/setup-status').then((res) => {
      if (!res.data.required) router.replace('/login');
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!siteName.trim()) e.siteName = 'Site name is required.';
    if (!email.trim()) e.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (password !== confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setServerError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { email, password });
      login(res.data.access_token, res.data.user);
      if (siteName) localStorage.setItem('np_site_name', siteName);
      setCreatedEmail(email);
      setDone(true);
    } catch (err: any) {
      setServerError(err.response?.data?.message || 'Installation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#50575e' }}>Loading…</div>
    </div>
  );

  return (
    <div style={s.page}>
      {/* Logo */}
      <div style={s.logo}>
        <div style={s.logoBox}>N</div>
        <span style={s.logoText}>NodePress</span>
      </div>

      <div style={s.container}>
        {!done ? (
          <>
            <h1 style={s.h1}>Information needed</h1>
            <p style={s.infoText}>
              Please provide the following information. Don't worry, you can always change these settings later.
            </p>

            {serverError && (
              <div style={{ ...s.noticeBox, background: '#fce9e9', border: '1px solid #d63638', borderLeft: '4px solid #d63638', color: '#d63638' }}>
                <strong>Error:</strong> {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <table style={s.table}>
                <tbody>

                  {/* Site Name */}
                  <tr>
                    <th style={s.th}>
                      <label htmlFor="siteName">Site Title</label>
                    </th>
                    <td style={s.td}>
                      <input
                        id="siteName"
                        style={{ ...s.input, ...(errors.siteName ? { borderColor: '#d63638' } : {}) }}
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        placeholder="My Awesome Site"
                        autoFocus
                      />
                      {errors.siteName && <div style={s.error}>{errors.siteName}</div>}
                    </td>
                  </tr>

                  {/* Email */}
                  <tr>
                    <th style={s.th}>
                      <label htmlFor="email">Admin Email</label>
                    </th>
                    <td style={s.td}>
                      <input
                        id="email"
                        type="email"
                        style={{ ...s.input, ...(errors.email ? { borderColor: '#d63638' } : {}) }}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                      {errors.email
                        ? <div style={s.error}>{errors.email}</div>
                        : <div style={s.hint}>Double-check your email address before continuing.</div>
                      }
                    </td>
                  </tr>

                  {/* Password */}
                  <tr>
                    <th style={s.th}>
                      <label htmlFor="password">Password</label>
                    </th>
                    <td style={s.td}>
                      <input
                        id="password"
                        type="password"
                        style={{ ...s.input, ...(errors.password ? { borderColor: '#d63638' } : {}) }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                      />
                      {/* Strength bar */}
                      {password && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s, background 0.3s', borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 12, color: strength.color, marginTop: 3, fontWeight: 600 }}>
                            Strength: {strength.label}
                          </div>
                        </div>
                      )}
                      {errors.password && <div style={s.error}>{errors.password}</div>}
                    </td>
                  </tr>

                  {/* Confirm Password */}
                  <tr>
                    <th style={s.th}>
                      <label htmlFor="confirm">Confirm Password</label>
                    </th>
                    <td style={s.td}>
                      <input
                        id="confirm"
                        type="password"
                        style={{ ...s.input, ...(errors.confirm ? { borderColor: '#d63638' } : {}) }}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat password"
                      />
                      {errors.confirm && <div style={s.error}>{errors.confirm}</div>}
                    </td>
                  </tr>

                </tbody>
              </table>

              <div style={{ marginTop: 24 }}>
                <button
                  type="submit"
                  style={{ ...s.btn, ...(btnHover ? s.btnHover : {}), opacity: loading ? 0.7 : 1 }}
                  onMouseEnter={() => setBtnHover(true)}
                  onMouseLeave={() => setBtnHover(false)}
                  disabled={loading}
                >
                  {loading ? 'Installing…' : 'Install NodePress'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ ...s.h1, color: '#00a32a' }}>Success!</h1>
            <p style={s.infoText}>
              NodePress has been installed. Thank you, and enjoy!
            </p>

            <div style={s.noticeBox}>
              <strong>Note:</strong> Save your login details in a safe place. If you lose your password, you will need to reset it manually.
            </div>

            <table style={s.successTable}>
              <tbody>
                <tr>
                  <th style={s.successTh}>Site Title</th>
                  <td style={s.successTd}>{siteName}</td>
                </tr>
                <tr>
                  <th style={s.successTh}>Email</th>
                  <td style={s.successTd}>{createdEmail}</td>
                </tr>
                <tr>
                  <th style={s.successTh}>Password</th>
                  <td style={s.successTd}>
                    <span style={{ background: '#f0f0f1', padding: '2px 8px', borderRadius: 3, fontFamily: 'monospace', fontSize: 13 }}>
                      Your chosen password
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <button
              style={{ ...s.btn, ...(btnHover ? s.btnHover : {}) }}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              onClick={() => router.push('/')}
            >
              Log In to Dashboard
            </button>
          </>
        )}
      </div>

      <div style={s.footer}>
        NodePress &mdash; Headless CMS &mdash; v1.0
      </div>
    </div>
  );
}
