import { X, Loader } from 'lucide-react';
import { useState } from 'react';
import { Language, translations } from '../translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { logo } from '../../assets/images';

type LoginRegisterModalProps = {
  onClose: () => void;
  onLoginSuccess: (user: any, needsActivation: boolean) => void;
  language: Language;
};

export function LoginRegisterModal({ onClose, onLoginSuccess, language }: LoginRegisterModalProps) {
  const t = translations[language];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t.memberActivation?.error || 'Please fill in all fields');
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
      console.log('Raw login response:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse login response as JSON:', jsonError);
        setError('Server error. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        console.error('Login error:', data);
        setError(data.error || 'Invalid email or password');
        setIsSubmitting(false);
        return;
      }

      console.log('Login successful:', data);

      // Store session token in localStorage
      if (data.session) {
        localStorage.setItem('wellnest_session', data.session);
        localStorage.setItem('wellnest_user', JSON.stringify(data.user));
        console.log('✅ Session token stored:', data.session);
      }

      // Pass the full user data to parent
      onLoginSuccess(data.user, false);
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f5f0ed] bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-[#f5f0ed] rounded-xl w-full max-w-md relative shadow-xl border border-[#e8dfd8]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="w-8 h-8" />
            <h2 className="text-lg text-[#3d2f28]">{t.memberLogin}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#e8dfd8] rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5 text-[#6b5949]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-[#6b5949] mb-4">
            {t.memberLoginDesc}
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[#3d2f28] mb-1">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t.emailPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-white text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949]"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-sm text-[#3d2f28] mb-1">
                {t.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t.passwordPlaceholder || 'Enter your password'}
                className="w-full px-3 py-2 rounded-lg bg-white text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949]"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-[#9ca571] text-white py-3 rounded-lg text-sm font-medium hover:bg-[#8a9463] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={isSubmitting}
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

          <div className="text-center pt-4 border-t border-[#e8dfd8] mt-4">
            <p className="text-xs text-[#8b7764] mb-1">
              {t.needHelp || 'Need help?'}
            </p>
            <p className="text-xs text-[#6b5949]">
              {t.contactUs} info@wellnestpilates.mk
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
