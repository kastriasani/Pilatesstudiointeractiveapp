import { ChevronRight, Banknote, ChevronLeft } from 'lucide-react';
import { BookingData } from '@/contexts/BookingContext';
import { Language, translations } from '../translations';
import { logo } from '../../assets/images';
import { useState } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { validateEmail } from '@/utils/emailValidation';

type ConfirmationScreenProps = {
  bookingData: BookingData;
  onConfirm: () => void;
  onBack: () => void;
  onPaymentToggle: (value: boolean) => void;
  onUpdateBookingData: (data: Partial<BookingData>) => void;
  language: Language;
};

export function ConfirmationScreen({ bookingData, onConfirm, onBack, onPaymentToggle, onUpdateBookingData, language }: ConfirmationScreenProps) {
  const t = translations[language];
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEmailRegistered, setIsEmailRegistered] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return; // Prevent double-submit

    const newErrors: Record<string, boolean> = {};

    if (!(bookingData.name || '').trim()) newErrors.name = true;
    if (!(bookingData.surname || '').trim()) newErrors.surname = true;
    if (!(bookingData.mobile || '').trim()) newErrors.mobile = true;
    const emailVal = (bookingData.email || '').trim();
    if (!emailVal) {
      newErrors.email = true;
    } else {
      const emailCheck = validateEmail(emailVal);
      if (!emailCheck.valid) {
        newErrors.email = true;
        if (emailCheck.suggestion) {
          setErrorMessage(`${t.emailDidYouMean || 'Did you mean'} ${emailCheck.suggestion}?`);
        } else {
          setErrorMessage(emailCheck.reason === 'invalid_domain' ? (t.invalidEmailDomain || 'The email domain is not valid') : (t.invalidEmail || 'Please enter a valid email address'));
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Save booking to backend
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          userId: bookingData.email, // Use email as userId
          serviceType: bookingData.trainingType || 'single',
          name: bookingData.name,
          surname: bookingData.surname,
          mobile: bookingData.mobile,
          email: bookingData.email,
          dateKey: bookingData.dateKey,
          timeSlot: bookingData.timeSlot,
          packageType: bookingData.selectedPackage,
          language: language,
        }),
      });

      // Get response text first to handle both JSON and non-JSON responses
      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse response as JSON:', jsonError);
        console.error('Response was:', responseText);
        setErrorMessage(t.bookingError || 'Server error. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        if (data.errorType === 'EMAIL_ALREADY_REGISTERED') {
          setIsEmailRegistered(true);
        }
        setErrorMessage(data.error || t.bookingError || 'Failed to create booking. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // NOTE: Booking flow must NOT store session data
      // Dashboard access only after admin activation + password setup

      // Navigate to success page (no alert needed - success page shows confirmation)
      onConfirm();
    } catch (error) {
      console.error('Error creating booking:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`${t.bookingError || 'Failed to create booking'}: ${message}`);
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: 'name' | 'surname' | 'mobile' | 'email', value: string) => {
    onUpdateBookingData({ [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: false });
    }
    // Clear error message when user starts typing
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-4 pt-12">
      {/* Header with Back Button */}
      <div className="flex items-center mb-4">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-[#6b5949] hover:bg-[#f5f0ed] rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg text-[#3d2f28] ml-2">{t.confirmReservation}</h1>
      </div>

      {/* Booking Details Card */}
      <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
        <div className="space-y-2">
          <div className="text-[#6b5949]">
            <p className="text-xs mb-0.5">{bookingData.date}</p>
            {bookingData.timeSlot !== 'package' && (
              <p className="text-sm">{bookingData.timeSlot} ({t.lessonDuration})</p>
            )}
            {bookingData.selectedPackage && (
              <p className="text-sm">
                {bookingData.selectedPackage === 'package8' ? `8 ${t.sessions}` : bookingData.selectedPackage === 'package10' ? `10 ${t.sessions}` : `12 ${t.sessions}`} - {t.package}
              </p>
            )}
          </div>
          {/* Show price only for single sessions */}
          {bookingData.timeSlot !== 'package' && !bookingData.selectedPackage && (
            <div className="pt-2 border-t border-[#f5f0ed]">
              <div className="flex justify-between items-center">
                <p className="text-sm text-[#6b5949]">{t.price}:</p>
                <p className="text-base text-[#3d2f28]">600 DEN</p>
              </div>
            </div>
          )}
          {/* Show package pricing */}
          {bookingData.selectedPackage && (
            <div className="pt-2 border-t border-[#f5f0ed]">
              <div className="flex justify-between items-center">
                <p className="text-sm text-[#6b5949]">{t.totalPrice}:</p>
                <p className="text-base text-[#3d2f28]">
                  {bookingData.selectedPackage === 'package8' 
                    ? '3500 DEN' 
                    : bookingData.selectedPackage === 'package10' 
                    ? '4200 DEN' 
                    : '4800 DEN'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Information Form */}
      <div className="bg-white rounded-xl p-4 mb-3 shadow-sm space-y-3">
        <div>
          <input
            type="text"
            placeholder={`${t.name}*`}
            value={bookingData.name || ''}
            onChange={(e) => handleInputChange('name', e.target.value)}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] disabled:opacity-50 ${
              errors.name ? 'ring-2 ring-red-500' : ''
            }`}
          />
        </div>
        <div>
          <input
            type="text"
            placeholder={`${t.surname}*`}
            value={bookingData.surname || ''}
            onChange={(e) => handleInputChange('surname', e.target.value)}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] disabled:opacity-50 ${
              errors.surname ? 'ring-2 ring-red-500' : ''
            }`}
          />
        </div>
        <div>
          <input
            type="tel"
            placeholder={`${t.mobile}*`}
            value={bookingData.mobile || ''}
            onChange={(e) => handleInputChange('mobile', e.target.value)}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] disabled:opacity-50 ${
              errors.mobile ? 'ring-2 ring-red-500' : ''
            }`}
          />
        </div>
        <div>
          <input
            type="email"
            placeholder={`${t.email}*`}
            value={bookingData.email || ''}
            onChange={(e) => handleInputChange('email', e.target.value)}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 rounded-lg bg-[#f5f0ed] text-sm text-[#3d2f28] placeholder:text-[#8b7764] focus:outline-none focus:ring-2 focus:ring-[#6b5949] disabled:opacity-50 ${
              errors.email ? 'ring-2 ring-red-500' : ''
            }`}
          />
        </div>
      </div>

      {/* Payment Option */}
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-3.5 border border-[#e8e6e3]/50 shadow-inner mb-6">
        <input
          type="checkbox"
          id="payInStudio"
          checked={true}
          disabled
          className="w-4.5 h-4.5 accent-[#9ca571] rounded opacity-100"
        />
        <label htmlFor="payInStudio" className="text-xs text-[#6b5949] font-semibold flex-1">
          {t.payInStudio}
        </label>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{errorMessage}</p>
          {isEmailRegistered && (
            <a
              href="/login"
              className="inline-block mt-2 text-sm font-medium text-[#9ca571] hover:underline"
            >
              {t.goToLogin || 'Go to Login'} &rarr;
            </a>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleConfirm}
          className="w-full bg-[#9ca571] text-white py-3 rounded-lg text-sm hover:bg-[#8a9463] transition-colors"
          disabled={isSubmitting}
        >
          {isSubmitting ? t.submitting : t.confirmBooking}
        </button>
      </div>

      {/* Logo */}
      <div className="text-center mt-6 mb-4">
        <img src={logo} alt="Logo" className="w-12 h-12 mx-auto mb-2" />
        <p className="text-xs text-[#8b7764]">{t.location}</p>
        <p className="text-xs text-[#8b7764] mt-1">{t.copyright}</p>
      </div>
    </div>
  );
}