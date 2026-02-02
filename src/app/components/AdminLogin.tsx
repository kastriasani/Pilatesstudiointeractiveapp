import { useState } from 'react';
import { Lock, ArrowLeft } from 'lucide-react';
import { logo } from '../../assets/images';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type AdminLoginProps = {
  onLogin: (sessionToken: string) => void;
  onBack: () => void;
};

export function AdminLogin({ onLogin, onBack }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter both username and password');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/auth/admin/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ username, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid credentials');
        setTimeout(() => setError(''), 3000);
        return;
      }

      // Store session token in localStorage (API returns 'session')
      const sessionToken = data.session;
      localStorage.setItem('adminSessionToken', sessionToken);

      // Call onLogin with the session token
      onLogin(sessionToken);
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-[#f5f0ed] px-4 pt-12 relative">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="absolute top-6 left-6 hover:bg-[#e8dfd8] rounded-lg p-2 transition-colors z-10"
      >
        <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
      </button>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl text-[#3d2f28] mb-2">Admin Panel</h1>
          <p className="text-sm text-[#6b5949]">Wellnest Pilates Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-[#e8dfd8] rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#6b5949]" />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#3d2f28] mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter username"
                className="w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#3d2f28] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter password"
                className="w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949]"
              />
            </div>

            {error && (
              <div className="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-[#6b5949] text-white py-3 rounded-lg text-sm hover:bg-[#5a4838] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
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