import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserDashboard } from './UserDashboard';
import { useLanguage, Language } from '@/contexts/LanguageContext';

type UserData = {
  email: string;
  name: string;
  surname: string;
  packageType?: string;
  remainingSessions?: number;
  language?: string;
};

export function UserRoute() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
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

        // Set the language from user's preference
        if (parsedUser.language) {
          const userLang = parsedUser.language.toUpperCase() as Language;
          if (['SQ', 'MK', 'EN'].includes(userLang)) {
            setLanguage(userLang);
          }
        }
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
    setIsLoading(false);
  }, [setLanguage]);

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
      onLogout={handleLogout}
    />
  );
}
