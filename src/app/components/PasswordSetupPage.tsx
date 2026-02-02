import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface PasswordSetupPageProps {
  onComplete?: (session: string, user: any) => void;
}

export function PasswordSetupPage({ onComplete }: PasswordSetupPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query params or hash (for backwards compatibility)
    const tokenFromParams = searchParams.get('token');
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const tokenFromHash = hashParams.get('token');

    const foundToken = tokenFromParams || tokenFromHash;

    if (foundToken) {
      setToken(foundToken);
    } else {
      setError('No registration token found in URL. Please use the link from your email.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/setup-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            password
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to set up password');
      }

      setSuccess(true);

      // Store session in localStorage with expiry
      localStorage.setItem('wellnest_session', data.session);
      localStorage.setItem('wellnest_user', JSON.stringify(data.user));
      const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      localStorage.setItem('wellnest_session_expiry', expiryTime.toString());

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        if (onComplete) {
          onComplete(data.session, data.user);
        } else {
          navigate('/dashboard');
        }
      }, 2000);

    } catch (err: any) {
      console.error('Password setup error:', err);
      setError(err.message || 'Failed to set up password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f0ed] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-[#3d2f28] mb-2">Registration Complete! 🎉</h2>
          <p className="text-[#6b5949] mb-4">
            Your account has been set up successfully. Redirecting to your dashboard...
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9ca571] mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0ed] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-[#3d2f28] mb-2">Complete Your Registration</h1>
          <p className="text-sm text-[#6b5949]">
            WellNest Pilates - Gjuro Gjakovikj 59, Kumanovo 1300
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!token && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-yellow-800">
              Please use the registration link sent to your email.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#3d2f28] mb-2">
              Create Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#e8e6e3] focus:outline-none focus:ring-2 focus:ring-[#9ca571] bg-white text-[#3d2f28]"
              placeholder="Enter password (min 6 characters)"
              required
              minLength={6}
              disabled={!token || loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#3d2f28] mb-2">
              Confirm Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#e8e6e3] focus:outline-none focus:ring-2 focus:ring-[#9ca571] bg-white text-[#3d2f28]"
              placeholder="Confirm password"
              required
              minLength={6}
              disabled={!token || loading}
            />
          </div>

          <div className="bg-[#fff8f0] border-l-4 border-[#9ca571] p-4 rounded">
            <p className="text-xs text-[#6b5949] leading-relaxed">
              <strong className="text-[#3d2f28]">Important:</strong><br />
              • After setting your password, you can log in anytime<br />
              • Your package activation code will be sent by our admin<br />
              • You can log in before receiving the activation code
            </p>
          </div>

          <button
            type="submit"
            disabled={!token || loading}
            className="w-full bg-[#9ca571] hover:bg-[#8a9463] text-white font-semibold py-3 rounded-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up...' : 'Complete Registration'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[#6b5949]">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-[#9ca571] hover:underline font-medium"
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
