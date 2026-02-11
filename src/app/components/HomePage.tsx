import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBooking } from '@/contexts/BookingContext';
import { TrainingTypeSelection } from './TrainingTypeSelection';
import { LoginRegisterModal } from './LoginRegisterModal';

export function HomePage() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { clearBookingData } = useBooking();
  const [showLoginRegister, setShowLoginRegister] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [logoClickTimer, setLogoClickTimer] = useState<NodeJS.Timeout | null>(null);

  // Check for existing valid session on mount and redirect to dashboard
  useEffect(() => {
    const session = localStorage.getItem('wellnest_session');
    const userData = localStorage.getItem('wellnest_user');
    const expiry = localStorage.getItem('wellnest_session_expiry');

    if (session && userData) {
      // Check if session is still valid
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

  const handleSelectTrainingType = (type: 'single' | 'package' | 'individual' | 'duo') => {
    clearBookingData(); // Clear any previous booking data
    navigate(`/book/${type}`);
  };

  const handleLogoClick = () => {
    setLogoClickCount(prevCount => prevCount + 1);

    if (logoClickTimer) {
      clearTimeout(logoClickTimer);
    }

    const newTimer = setTimeout(() => {
      if (logoClickCount >= 5) {
        navigate('/admin');
      }
      setLogoClickCount(0);
    }, 1000);

    setLogoClickTimer(newTimer);
  };

  const handleLoginSuccess = (user: any, needsActivation: boolean) => {
    setShowLoginRegister(false);
    const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
    localStorage.setItem('wellnest_session_expiry', expiryTime.toString());
    navigate('/dashboard');
  };

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <TrainingTypeSelection
        onSelectType={handleSelectTrainingType}
        language={language}
        onLanguageChange={setLanguage}
        onMemberLoginClick={() => setShowLoginRegister(true)}
        onLogoClick={handleLogoClick}
        onAdminClick={() => navigate('/admin')}
      />

      {showLoginRegister && (
        <LoginRegisterModal
          onClose={() => setShowLoginRegister(false)}
          onLoginSuccess={handleLoginSuccess}
          language={language}
        />
      )}
    </div>
  );
}
