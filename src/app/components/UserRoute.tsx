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

  // No valid session - redirect to home (hard guard)
  if (!user || !sessionToken) {
    // Clear any partial/invalid session data
    localStorage.removeItem('wellnest_session');
    localStorage.removeItem('wellnest_user');
    localStorage.removeItem('wellnest_session_expiry');
    navigate('/');
    return null;
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
