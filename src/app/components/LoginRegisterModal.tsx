import { useState } from 'react';
import { User, ArrowLeft, Loader } from 'lucide-react';
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
      console.log('Raw login response:', responseText);

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
        console.error('Login error:', data);
        setError(data.error || 'Invalid email or password');
        setTimeout(() => setError(''), 3000);
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
      setTimeout(() => setError(''), 3000);
      setIsSubmitting(false);
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

          {/* Contact Info */}
          <div className="text-center mt-6 pt-4 border-t border-[#e8dfd8]">
            <p className="text-xs text-[#8b7764] mb-1">
              {t.needHelp || 'Need help?'}
            </p>
            <p className="text-xs text-[#6b5949]">
              {t.contactUs} info@wellnestpilates.mk
            </p>
          </div>
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
