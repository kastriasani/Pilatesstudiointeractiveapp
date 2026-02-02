import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { IndividualTraining } from './IndividualTraining';

export function BookingIndividualPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [logoClickTimer, setLogoClickTimer] = useState<NodeJS.Timeout | null>(null);

  const handleBack = () => {
    navigate('/');
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

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <IndividualTraining
        onBack={handleBack}
        language={language}
        onLogoClick={handleLogoClick}
      />
    </div>
  );
}
