import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBooking } from '@/contexts/BookingContext';
import { SuccessScreen } from './SuccessScreen';

export function BookingSuccessPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { bookingData, clearBookingData } = useBooking();

  // Redirect to home if no booking data
  useEffect(() => {
    if (!bookingData.dateKey && !bookingData.timeSlot && !bookingData.email) {
      navigate('/', { replace: true });
    }
  }, [bookingData, navigate]);

  // Don't render if no booking data (will redirect)
  if (!bookingData.dateKey && !bookingData.timeSlot && !bookingData.email) {
    return null;
  }

  const handleViewOther = () => {
    clearBookingData();
    navigate('/');
  };

  const handleViewPackages = () => {
    clearBookingData();
    navigate('/book/package');
  };

  const handleBack = () => {
    clearBookingData();
    navigate('/');
  };

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <SuccessScreen
        bookingData={bookingData}
        onViewOther={handleViewOther}
        onViewPackages={handleViewPackages}
        onBack={handleBack}
        language={language}
      />
    </div>
  );
}
