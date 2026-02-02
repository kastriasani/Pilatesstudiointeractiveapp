import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBooking } from '@/contexts/BookingContext';
import { BookingScreen } from './BookingScreen';

export function BookingSinglePage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { updateBookingData } = useBooking();

  const handleBack = () => {
    navigate('/');
  };

  const handleSubmit = (bookingData: any) => {
    updateBookingData({ ...bookingData, trainingType: 'single' });
    navigate('/book/confirm');
  };

  const handleInstructorClick = (instructorName: string) => {
    // Instructor profiles are not used anymore, just ignore
  };

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      <BookingScreen
        trainingType="single"
        onBack={handleBack}
        onSubmit={handleSubmit}
        onInstructorClick={handleInstructorClick}
        language={language}
      />
    </div>
  );
}
