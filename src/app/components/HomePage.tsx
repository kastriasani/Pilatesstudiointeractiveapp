import { useState } from 'react';
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
