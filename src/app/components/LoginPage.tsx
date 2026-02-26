import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { translations } from '../translations';

interface LoginPageProps {
  onLogin?: (session: string, user: any) => void;
  onBack?: () => void;
}

export function LoginPage({ onLogin, onBack }: LoginPageProps) {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Request Login state
  const [showRequestLogin, setShowRequestLogin] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check for existing valid session on mount
  useEffect(() => {
    const session = localStorage.getItem('wellnest_session');
    const userData = localStorage.getItem('wellnest_user');
    const expiry = localStorage.getItem('wellnest_session_expiry');

    if (session && userData) {
      // Check if session is still valid (require expiry to be present and not expired)
      if (expiry && Date.now() < parseInt(expiry)) {
        // Valid session exists, redirect to dashboard
        navigate('/dashboard', { replace: true });
      } else {
        // Session expired, clear it
        localStorage.removeItem('wellnest_session');
        localStorage.removeItem('wellnest_user');
        localStorage.removeItem('wellnest_session_expiry');
      }
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            password
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store session in localStorage with expiry
      localStorage.setItem('wellnest_session', data.session);
      localStorage.setItem('wellnest_user', JSON.stringify(data.user));
      const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      localStorage.setItem('wellnest_session_expiry', expiryTime.toString());

      // Set language from user preference
      if (data.user?.language) {
        const userLang = data.user.language.toUpperCase() as Language;
        if (['SQ', 'MK', 'EN'].includes(userLang)) {
          setLanguage(userLang);
        }
      }

      // Use callback if provided, otherwise navigate
      if (onLogin) {
        onLogin(data.session, data.user);
      } else {
        navigate('/dashboard');
      }

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestLogin = async () => {
    if (!requestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail.trim())) {
      setRequestMessage({ type: 'error', text: t.invalidEmail || 'Please enter a valid email address' });
      return;
    }

    setRequestLoading(true);
    setRequestMessage(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/request-login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: requestEmail.trim().toLowerCase() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setRequestMessage({ type: 'error', text: data.error || t.requestLoginNoAccount || 'No account found with this email.' });
      } else {
        setRequestMessage({ type: 'success', text: t.requestLoginSuccess || 'Request sent! The admin will send your login credentials shortly.' });
      }
    } catch (err) {
      console.error('Request login error:', err);
      setRequestMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setRequestLoading(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f0ed] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-[#3d2f28] mb-2">Welcome Back</h1>
          <p className="text-sm text-[#6b5949]">
            WellNest Pilates - Gjuro Gjakovikj 59, Kumanovo 1300
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            {error.includes('registration') && (
              <p className="text-xs text-red-700 mt-2">
                Check your email for the registration link to complete your account setup.
              </p>
            )}
          </div>
        )}

        {!showRequestLogin ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#3d2f28] mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#e8e6e3] focus:outline-none focus:ring-2 focus:ring-[#9ca571] bg-white text-[#3d2f28]"
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#3d2f28] mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#e8e6e3] focus:outline-none focus:ring-2 focus:ring-[#9ca571] bg-white text-[#3d2f28]"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#9ca571] hover:bg-[#8a9463] text-white font-semibold py-3 rounded-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            <div className="mt-6 text-center space-y-3">
              <p className="text-sm text-[#6b5949]">
                Don't have an account?{' '}
                <button
                  onClick={handleBack}
                  className="text-[#9ca571] hover:underline font-medium"
                >
                  Book a package
                </button>
              </p>

              <div className="pt-3 border-t border-[#e8e6e3]">
                <button
                  onClick={() => { setShowRequestLogin(true); setRequestMessage(null); setRequestEmail(email || ''); }}
                  className="text-xs text-[#9ca571] hover:underline font-medium"
                >
                  {t.requestLogin || 'Request Login'} &rarr;
                </button>
                <p className="text-xs text-[#8b7764] mt-1">
                  {t.requestLoginDescription || "Don't have your login credentials? Request access."}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-[#6b5949] mb-4">
                {t.requestLoginDescription || "Don't have your login credentials? Enter your email to request access."}
              </p>
              <label className="block text-sm font-medium text-[#3d2f28] mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={requestEmail}
                onChange={(e) => { setRequestEmail(e.target.value); setRequestMessage(null); }}
                className="w-full px-4 py-3 rounded-xl border border-[#e8e6e3] focus:outline-none focus:ring-2 focus:ring-[#9ca571] bg-white text-[#3d2f28]"
                placeholder="your@email.com"
                disabled={requestLoading}
              />
            </div>

            {requestMessage && (
              <div className={`rounded-xl p-3 text-sm ${
                requestMessage.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {requestMessage.text}
              </div>
            )}

            <button
              onClick={handleRequestLogin}
              disabled={requestLoading || requestMessage?.type === 'success'}
              className="w-full bg-[#9ca571] hover:bg-[#8a9463] text-white font-semibold py-3 rounded-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {requestLoading ? '...' : (t.requestLogin || 'Request Login')}
            </button>

            <div className="text-center pt-3 border-t border-[#e8e6e3]">
              <button
                onClick={() => { setShowRequestLogin(false); setRequestMessage(null); }}
                className="text-sm text-[#9ca571] hover:underline font-medium"
              >
                &larr; Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
