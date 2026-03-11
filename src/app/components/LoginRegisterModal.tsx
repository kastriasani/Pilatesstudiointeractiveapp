import { useState } from 'react';
import { User, ArrowLeft, Loader } from 'lucide-react';
import { Language, translations } from '../translations';
import { useLanguage } from '@/contexts/LanguageContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { logo } from '../../assets/images';
import { validateEmail } from '@/utils/emailValidation';

type LoginRegisterModalProps = {
  onClose: () => void;
  onLoginSuccess: (user: any, needsActivation: boolean) => void;
  language: Language;
};

export function LoginRegisterModal({ onClose, onLoginSuccess, language }: LoginRegisterModalProps) {
  const t = translations[language];
  const { setLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t.memberActivation?.error || 'Please fill in all fields');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email: email.trim(), password: password }),
        }
      );

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse login response as JSON:', jsonError);
        setError('Server error. Please try again.');
        setTimeout(() => setError(''), 3000);
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || 'Invalid email or password');
        setTimeout(() => setError(''), 3000);
        setIsSubmitting(false);
        return;
      }

      // Store session token in localStorage
      if (data.session) {
        localStorage.setItem('wellnest_session', data.session);
        localStorage.setItem('wellnest_user', JSON.stringify(data.user));
        const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
        localStorage.setItem('wellnest_session_expiry', expiryTime.toString());
      }

      // Set language from user preference
      if (data.user?.language) {
        const userLang = data.user.language.toUpperCase() as Language;
        if (['SQ', 'MK', 'EN'].includes(userLang)) {
          setLanguage(userLang);
        }
      }

      // Pass the full user data to parent
      onLoginSuccess(data.user, false);
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please try again.');
      setTimeout(() => setError(''), 3000);
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailCheck = validateEmail(forgotEmail.trim());
    if (!forgotEmail || !emailCheck.valid) {
      let msg = t.invalidEmail || 'Please enter a valid email address';
      if (emailCheck.suggestion) {
        msg = `${t.emailDidYouMean || 'Did you mean'} ${emailCheck.suggestion}?`;
      } else if (emailCheck.reason === 'invalid_domain') {
        msg = t.invalidEmailDomain || 'The email domain is not valid';
      }
      setForgotMessage({ type: 'error', text: msg });
      return;
    }

    setForgotLoading(true);
    setForgotMessage(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
        }
      );

      await response.json();
      setForgotMessage({ type: 'success', text: t.forgotPasswordSuccess || 'If an account exists with this email, a password reset link will be sent.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      setForgotMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f5f0ed] flex items-center justify-center z-50 px-4 pt-12">
      {/* Back Button */}
      <button
        onClick={onClose}
        className="absolute top-6 left-6 hover:bg-[#e8dfd8] rounded-lg p-2 transition-colors z-10"
        disabled={isSubmitting}
      >
        <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl text-[#3d2f28] mb-2">{t.memberLogin}</h1>
          <p className="text-sm text-[#6b5949]">{t.memberLoginDesc}</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#F5F0EE] rounded-xl p-6 shadow-lg border border-[#e8dfd8]">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-[#e8dfd8] rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-[#6b5949]" />
            </div>
          </div>

          {showForgotPassword ? (
            <div className="space-y-4">
              <p className="text-sm text-[#6b5949] mb-2">
                {t.forgotPasswordDescription || 'Enter your email and we will send you a link to reset your password.'}
              </p>
              <div>
                <label className="block text-sm text-[#3d2f28] mb-1">{t.email}</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => { setForgotEmail(e.target.value); setForgotMessage(null); }}
                  placeholder={t.emailPlaceholder}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-[#e8e6e3] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] focus:border-transparent"
                  disabled={forgotLoading}
                />
              </div>

              {forgotMessage && (
                <div className={`px-3 py-2 rounded-lg text-sm ${
                  forgotMessage.type === 'success'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {forgotMessage.text}
                </div>
              )}

              <button
                onClick={handleForgotPassword}
                disabled={forgotLoading || forgotMessage?.type === 'success'}
                className="w-full bg-[#6b5949] text-white py-3 rounded-lg text-sm hover:bg-[#5a4838] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {forgotLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t.submitting || 'Loading...'}
                  </>
                ) : (
                  t.sendResetLink || 'Send Reset Link'
                )}
              </button>

              <button
                onClick={() => { setShowForgotPassword(false); setForgotMessage(null); }}
                className="w-full text-sm text-[#6b5949] hover:underline"
              >
                &larr; {t.login || 'Back to Login'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#3d2f28] mb-1">{t.email}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t.emailPlaceholder}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-[#e8e6e3] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] focus:border-transparent"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm text-[#3d2f28] mb-1">{t.password}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t.passwordPlaceholder || 'Enter your password'}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-[#e8e6e3] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] focus:border-transparent"
                  disabled={isSubmitting}
                />
                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setForgotMessage(null); setForgotEmail(email || ''); }}
                    className="text-xs text-[#9ca571] hover:underline"
                  >
                    {t.forgotPassword || 'Forgot your password?'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={isSubmitting}
                className="w-full bg-[#6b5949] text-white py-3 rounded-lg text-sm hover:bg-[#5a4838] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t.submitting || 'Loading...'}
                  </>
                ) : (
                  t.login
                )}
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-[#8b7764]">Gjuro Gjakovikj 59, Kumanovo 1300</p>
          <p className="text-xs text-[#8b7764] mt-1">© 2025 Wellnest Pilates</p>
        </div>
      </div>
    </div>
  );
}
