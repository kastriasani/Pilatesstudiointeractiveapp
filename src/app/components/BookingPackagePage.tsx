import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { PackageOverview } from './PackageOverview';

export function BookingPackagePage() {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <PackageOverview
        onBack={handleBack}
        language={language}
      />
    </div>
  );
}
