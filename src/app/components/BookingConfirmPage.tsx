import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBooking } from '@/contexts/BookingContext';
import { ConfirmationScreen } from './ConfirmationScreen';

export function BookingConfirmPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();

  // Redirect to home if no booking data (require both dateKey and timeSlot)
  useEffect(() => {
    if (!bookingData.dateKey || !bookingData.timeSlot) {
      navigate('/', { replace: true });
    }
  }, [bookingData, navigate]);

  // Don't render if booking data incomplete (will redirect)
  if (!bookingData.dateKey || !bookingData.timeSlot) {
    return null;
  }

  const handleBack = () => {
    // Go back to the booking type page
    const type = bookingData.trainingType || 'single';
    navigate(`/book/${type}`);
  };

  const handleConfirm = () => {
    navigate('/book/success');
  };

  const handlePaymentToggle = (value: boolean) => {
    updateBookingData({ payInStudio: value });
  };

  const handleUpdateBookingData = (data: Partial<typeof bookingData>) => {
    updateBookingData(data);
  };

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <ConfirmationScreen
        bookingData={bookingData}
        onConfirm={handleConfirm}
        onBack={handleBack}
        onPaymentToggle={handlePaymentToggle}
        onUpdateBookingData={handleUpdateBookingData}
        language={language}
      />
    </div>
  );
}
