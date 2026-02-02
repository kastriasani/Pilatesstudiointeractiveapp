import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserDashboard } from './UserDashboard';
import { useLanguage } from '@/contexts/LanguageContext';

type UserData = {
  email: string;
  name: string;
  surname: string;
  packageType?: string;
  remainingSessions?: number;
};

export function UserRoute() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [user, setUser] = useState<UserData | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem('wellnest_session');
    const userData = localStorage.getItem('wellnest_user');
    const expiry = localStorage.getItem('wellnest_session_expiry');

    if (session && userData) {
      // Check expiry if exists
      if (expiry && Date.now() >= parseInt(expiry)) {
        // Session expired
        localStorage.removeItem('wellnest_session');
        localStorage.removeItem('wellnest_user');
        localStorage.removeItem('wellnest_session_expiry');
        setIsLoading(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setSessionToken(session);
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('wellnest_session');
    localStorage.removeItem('wellnest_user');
    localStorage.removeItem('wellnest_session_expiry');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f0eb]">
        <div className="text-[#6b5949]">Loading...</div>
      </div>
    );
  }

  if (!user || !sessionToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#f5f0eb]">
        <h1 className="text-xl font-semibold mb-4 text-[#3d2f28]">Session Expired</h1>
        <p className="text-[#6b5949] mb-6 text-center">
          Please check your email for a login link or log in again.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-[#6b5949] text-white rounded-lg hover:bg-[#5a4a3d] transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <UserDashboard
      userEmail={user.email}
      language={language}
      sessionToken={sessionToken}
      onBack={() => navigate('/')}
    />
  );
}
