import { useState, useEffect } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CheckCircle, X, Calendar, Clock, Package } from 'lucide-react';
import { Language, translations } from '@/app/translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { logo } from '../../assets/images';
import {
  formatDateKeyLegacy,
  isTimeSlotPast
} from '../../utils/dateUtils';

type PackageOverviewProps = {
  onBack: () => void;
  language: Language;
};

type FormData = {
  name: string;
  surname: string;
  mobile: string;
  email: string;
  payInStudio: boolean;
};

type PackageData = {
  packageId: string;
  activationCode: string;
  packageType: string;
};

type DateSlot = {
  date: Date;
  dateKey: string;
  displayDate: string;
  timeSlots: TimeSlot[];
};

type TimeSlot = {
  time: string;
  available: number;
  isBooked: boolean;
};

export function PackageOverview({ onBack, language }: PackageOverviewProps) {
  const t = translations[language];
  const [expandedPackage, setExpandedPackage] = useState<'package8' | 'package10' | 'package12' | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    surname: '',
    mobile: '',
    email: '',
    payInStudio: true,
  });
  const [couponCode, setCouponCode] = useState('');
  const [couponValidation, setCouponValidation] = useState<{status: 'idle' | 'validating' | 'valid' | 'invalid', message?: string}>({ status: 'idle' });
  const [formError, setFormError] = useState<string | null>(null);

  // New 2-step flow state
  const [showPackageCreatedPopup, setShowPackageCreatedPopup] = useState(false);
  const [showFirstSessionModal, setShowFirstSessionModal] = useState(false);
  const [packageData, setPackageData] = useState<PackageData | null>(null);
  const [bookingSlots, setBookingSlots] = useState<DateSlot[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [isBookingFirstSession, setIsBookingFirstSession] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const packages = [
    {
      type: 'package8' as const,
      sessions: 8,
      label: t.package8Sessions || '8 CLASSES',
      savings: 500,
      price: 3500,
      isRecommended: false,
    },
    {
      type: 'package10' as const,
      sessions: 10,
      label: t.package10Sessions || '10 CLASSES',
      savings: 800,
      price: 4200,
      isRecommended: true,
    },
    {
      type: 'package12' as const,
      sessions: 12,
      label: t.package12Sessions || '12 CLASSES',
      savings: 1200,
      price: 4800,
      isRecommended: false,
    },
  ];

  const handlePackageClick = (packageType: 'package8' | 'package10' | 'package12') => {
    if (expandedPackage === packageType) {
      setExpandedPackage(null);
    } else {
      setExpandedPackage(packageType);
      // Reset coupon validation when switching packages
      setCouponCode('');
      setCouponValidation({ status: 'idle' });
    }
  };

  // Validate coupon code
  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponValidation({ status: 'idle' });
      return;
    }

    setCouponValidation({ status: 'validating' });

    try {
      console.log('🔍 Validating coupon:', couponCode.trim());
      console.log('📡 API URL:', `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/validate-coupon`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/validate-coupon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            code: couponCode.trim(),
          }),
        }
      );

      console.log('📥 Response status:', response.status);
      const data = await response.json();
      console.log('📦 Response data:', data);

      if (data.valid) {
        console.log('✅ Coupon is valid!');
        setCouponValidation({ 
          status: 'valid', 
          message: t.couponValid || '✓ Valid coupon! +1 free class' 
        });
      } else {
        console.log('❌ Coupon is invalid:', data.error);
        setCouponValidation({ 
          status: 'invalid', 
          message: data.error || t.couponInvalid || 'Invalid or expired coupon code' 
        });
      }
    } catch (error) {
      console.error('💥 Error validating coupon:', error);
      setCouponValidation({ 
        status: 'invalid', 
        message: t.couponError || 'Error validating coupon' 
      });
    }
  };

  // Step 1: Create package
  const handleSubmit = async (packageType: 'package8' | 'package10' | 'package12') => {
    if (!formData.name || !formData.surname || !formData.mobile || !formData.email) {
      setFormError(t.fillAllFields || 'Please fill in all required fields');
      return;
    }
    const emailVal = formData.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setFormError(t.invalidEmail || 'Please enter a valid email address');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      console.log('🎯 Step 1/2: Creating package...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/packages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId: formData.email,
            packageType: packageType,
            name: formData.name,
            surname: formData.surname,
            mobile: formData.mobile,
            email: formData.email,
            language: language,
            couponCode: couponValidation.status === 'valid' ? couponCode.trim() : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('❌ Package creation failed:', data);
        setFormError(data.error || 'Package creation failed. Please try again.');
        setIsSubmitting(false);
        return;
      }

      console.log('✅ Package created:', data.packageId);
      console.log('📧 Activation code sent to email:', formData.email);

      // Store package data
      setPackageData({
        packageId: data.packageId,
        activationCode: data.activationCode,
        packageType: packageType,
      });

      // Show package created popup with option to book first session
      setShowPackageCreatedPopup(true);
      setExpandedPackage(null);
      setIsSubmitting(false);
    } catch (error) {
      console.error('❌ Error creating package:', error);
      setFormError('An error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Load available time slots for first session - shows ALL live days
  const loadAvailableSlots = async () => {
    setIsLoadingSlots(true);
    try {
      // Fetch bookings availability and live days in parallel
      const [bookingsResponse, liveDaysResponse] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/availability`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/live-days`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        )
      ]);

      const bookingsData = await bookingsResponse.json();
      const existingBookings = bookingsData.bookings || [];

      const liveDaysData = await liveDaysResponse.json();
      const liveDays: string[] = liveDaysData.dates || [];

      // Fetch time slots for each live day from API (not hardcoded)
      const slotsPromises = liveDays.map((isoDate: string) =>
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots?date=${isoDate}`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        ).then(res => res.json())
      );

      const slotsResults = await Promise.all(slotsPromises);

      // Build slots per date from API responses
      const slots: DateSlot[] = [];

      for (let i = 0; i < liveDays.length; i++) {
        const isoDate = liveDays[i];
        const apiSlots = slotsResults[i]?.slots || [];

        // Skip dates with no configured slots
        if (apiSlots.length === 0) continue;

        // Parse ISO date (YYYY-MM-DD) to Date object
        const [year, month, day] = isoDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const dateKey = isoDate; // ISO format for booking API
        const legacyKey = formatDateKeyLegacy(date); // Legacy format for matching old bookings

        // Get all confirmed/attended bookings for this date (match both ISO and legacy formats)
        const dayBookings = existingBookings.filter((b: any) =>
          (b.dateKey === dateKey || b.dateKey === legacyKey) &&
          (b.status === 'confirmed' || b.status === 'attended' || b.status === 'pending')
        );

        const availableTimeSlots = apiSlots.map((slot: any) => {
          const time = slot.start_time;
          const maxCapacity = slot.max_capacity || 4;

          // Calculate actual seats occupied for this time slot
          const slotBookings = dayBookings.filter((b: any) => b.timeSlot === time);

          // Sum up seats occupied based on serviceType: duo=2, individual=4, others=1
          const seatsOccupied = slotBookings.reduce((total: number, booking: any) => {
            if (booking.serviceType === 'duo') return total + 2;
            if (booking.serviceType === 'individual') return total + 4;
            return total + 1;
          }, 0);

          // Check for private sessions (individual/duo blocks entire slot)
          const hasPrivateSession = slotBookings.some((b: any) =>
            b.serviceType === 'individual' || b.serviceType === 'duo'
          );

          const available = hasPrivateSession ? 0 : Math.max(0, maxCapacity - seatsOccupied);

          // Filter out past time slots for today
          const isPastTime = isTimeSlotPast(date, time);

          return {
            time,
            available: isPastTime ? 0 : available,
            isBooked: available <= 0 || isPastTime,
          };
        });

        // Only add dates that have at least one available slot
        if (availableTimeSlots.some((slot: any) => slot.available > 0)) {
          slots.push({
            date,
            dateKey,
            displayDate: date.toLocaleDateString(language === 'sq' ? 'sq-AL' : language === 'mk' ? 'mk-MK' : 'en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            }),
            timeSlots: availableTimeSlots,
          });
        }
      }

      setBookingSlots(slots);
      // Auto-select first date
      if (slots.length > 0) {
        setExpandedDate(slots[0].dateKey);
      }
      console.log(`📅 Loaded ${slots.length} available live dates with dynamic time slots`);
    } catch (error) {
      console.error('❌ Error loading slots:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Step 2: Book first session
  const handleBookFirstSession = async (dateKey: string, timeSlot: string) => {
    if (!packageData) return;

    setIsBookingFirstSession(true);

    try {
      console.log('📅 Booking first session for package:', packageData.packageId);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/packages/${packageData.packageId}/first-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            dateKey: dateKey,
            timeSlot: timeSlot,
            appUrl: window.location.origin, // Send current app URL for email link
          }),
        }
      );

      const responseText = await response.text();
      
      if (!response.ok) {
        console.error('❌ First session booking failed:', response.status, responseText);
        setFormError(responseText || 'Failed to book first session. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.log('Response text was:', responseText);
        setFormError('Server response error. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      if (!data.success) {
        console.error('❌ First session booking failed:', data);
        setFormError(data.error || 'Failed to book first session. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      console.log('✅ Package & first session booked successfully!');
      
      // Check if this is preview mode
      if (data.isPreviewMode && data.previewRegistrationLink) {
        console.log('🔧 PREVIEW MODE: Registration link:', data.previewRegistrationLink);
      } else {
        console.log('📧 Registration email sent to:', formData.email);
      }
      
      console.log('🎟️ Activation code (admin will send later):', data.package?.activationCodeId);

      // Show success with detailed info
      setSuccessData({
        packageType: packageData.packageType,
        firstSession: {
          date: data.reservation?.date || dateKey,
          time: timeSlot,
        },
        remainingSessions: data.package?.remainingSessions || 0,
        activationCode: data.package?.activationCodeId,
        isPreviewMode: data.isPreviewMode,
        previewRegistrationLink: data.previewRegistrationLink,
      });

      // Close first session modal
      setShowFirstSessionModal(false);
      setPackageData(null);
      
      // Reset form
      setFormData({
        name: '',
        surname: '',
        mobile: '',
        email: '',
        payInStudio: true,
      });
      setCouponCode('');
      setCouponValidation({ status: 'idle' });

      // Show success popup
      setShowSuccessPopup(true);

      // User must manually close the success popup

      setIsBookingFirstSession(false);
    } catch (error) {
      console.error('❌ Error booking first session:', error);
      setFormError('An error occurred. Please try again.');
      setIsBookingFirstSession(false);
    }
  };

  const handleTimeSlotClick = (dateSlot: DateSlot, timeSlot: TimeSlot) => {
    if (timeSlot.available <= 0 || isBookingFirstSession) return;
    handleBookFirstSession(dateSlot.dateKey, timeSlot.time);
  };

  // Handle when user chooses to book first session from package created popup
  const handleOpenFirstSessionModal = async () => {
    setShowPackageCreatedPopup(false);
    await loadAvailableSlots();
    setShowFirstSessionModal(true);
  };

  // Handle when user skips booking first session
  const handleSkipFirstSession = () => {
    setShowPackageCreatedPopup(false);
    setShowSuccessPopup(true);
    
    // Show final success with package info only
    setSuccessData({
      packageType: packageData?.packageType,
      activationCode: packageData?.activationCode,
      skippedFirstSession: true,
    });

    // Clear package data and form
    setPackageData(null);
    setFormData({
      name: '',
      surname: '',
      mobile: '',
      email: '',
      payInStudio: true,
    });
    setCouponCode('');
    setCouponValidation({ status: 'idle' });

    // User must manually close the success popup
  };

  const formatDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-4 pt-12 relative bg-gradient-to-br from-[#faf9f7] via-[#f5f3f0] to-[#f0ede8]">
      {/* Package Created Popup - Ask to book first session */}
      {showPackageCreatedPopup && packageData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-5">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-7 max-w-sm w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 animate-scale-in">
            <div className="flex justify-between items-start mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <button
                onClick={handleSkipFirstSession}
                className="text-[#8b7764] hover:text-[#6b5949] transition-all hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-xl font-semibold text-[#3d2f28] mb-2 tracking-tight">
              {t.packageCreated || 'Package Created Successfully!'}
            </h2>
            <p className="text-sm text-[#6b5949] mb-5 leading-relaxed">
              {t.packageCreatedDesc || 'Your package has been registered. Would you like to book your first session now?'}
            </p>
            
            <div className="bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-[#9ca571]" />
                <p className="text-xs text-[#6b5949] font-semibold">
                  {t.package || 'Package'}:
                </p>
              </div>
              <p className="text-sm text-[#3d2f28] font-medium pl-6">
                {packageData.packageType === 'package8' ? '8 ' : packageData.packageType === 'package10' ? '10 ' : '12 '}
                {t.sessions || 'CLASSES'}
              </p>

            </div>

            <div className="space-y-2">
              <button
                onClick={handleOpenFirstSessionModal}
                className="w-full bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white py-3.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-[#9ca571]/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {t.bookFirstSessionNow || 'BOOK FIRST SESSION'}
              </button>
              <button
                onClick={handleSkipFirstSession}
                className="w-full bg-white text-[#6b5949] py-3.5 rounded-xl text-sm font-medium border border-[#e8e6e3] hover:bg-[#f5f3f0] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {t.skipForNow || 'Skip for Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Popup - Enhanced with First Session Info */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-5">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-7 max-w-sm w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 animate-scale-in">
            <div className="flex justify-between items-start mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="text-[#8b7764] hover:text-[#6b5949] transition-all hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-xl font-semibold text-[#3d2f28] mb-2 tracking-tight">
              {successData?.skippedFirstSession 
                ? (t.packageCreatedSuccess || 'Your package is ready!')
                : (t.bookingConfirmed || 'Package Confirmed!')}
            </h2>
            
            {successData && !successData.skippedFirstSession && successData.firstSession && (
              <div className="mb-4 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9ca571]" />
                  <p className="text-xs text-[#6b5949] font-semibold">
                    {t.firstSession || 'First Session'}:
                  </p>
                </div>
                <p className="text-sm text-[#3d2f28] font-medium pl-6">
                  {successData.firstSession.date} at {successData.firstSession.time}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Package className="w-4 h-4 text-[#9ca571]" />
                  <p className="text-xs text-[#6b5949]">
                    {successData.remainingSessions} {t.sessionsRemaining || 'sessions remaining'}
                  </p>
                </div>
              </div>
            )}
            
            {successData?.skippedFirstSession && (
              <div className="mb-4 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#9ca571]" />
                  <p className="text-xs text-[#6b5949] font-semibold">
                    {t.package || 'Package'}:
                  </p>
                </div>
                <p className="text-sm text-[#3d2f28] font-medium pl-6">
                  {successData.packageType === 'package8' ? '8 ' : successData.packageType === 'package10' ? '10 ' : '12 '}
                  {t.sessions || 'CLASSES'}
                </p>
              </div>
            )}
            
            {/* Preview Mode Registration Link */}
            {successData?.isPreviewMode && successData?.previewRegistrationLink ? (
              <div className="mb-5 bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-900 mb-2">
                  🔧 PREVIEW MODE - Email NOT Sent
                </p>
                <p className="text-xs text-amber-800 mb-3">
                  Click the link below to complete registration:
                </p>
                <a
                  href={successData.previewRegistrationLink}
                  className="block w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-2.5 px-3 rounded-lg transition-colors text-center break-all"
                >
                  Complete Registration →
                </a>
                <p className="text-xs text-amber-700 mt-2">
                  💡 In production, this will be sent via email
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#6b5949] mb-5 leading-relaxed">
                {successData?.skippedFirstSession 
                  ? (t.packageSavedDesc || 'Your package has been saved. Please visit the studio to complete payment and book your first session.')
                  : (t.bookingConfirmedDesc || 'Check your email to complete registration. The activation code will be sent by admin after payment confirmation.')}
              </p>
            )}
            
            <button
              onClick={() => {
                setShowSuccessPopup(false);
                setSuccessData(null);
              }}
              className="w-full bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white py-3.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-[#9ca571]/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {t.close || 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* First Session Selection Modal */}
      {showFirstSessionModal && packageData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-5 overflow-y-auto">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 max-w-md w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 animate-scale-in my-10 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="text-xl font-semibold text-[#3d2f28] tracking-tight">
                  {t.selectFirstSession || 'Select First Session'}
                </h2>
                <p className="text-xs text-[#8b7764] mt-1">
                  {t.selectDateTimeForFirst || 'Choose date and time for your first class'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowFirstSessionModal(false);
                  setPackageData(null);
                }}
                className="text-[#8b7764] hover:text-[#6b5949] transition-all hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingSlots ? (
              <div className="py-10 text-center">
                <div className="w-8 h-8 border-4 border-[#9ca571] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-[#8b7764]">{t.loading || 'Loading...'}</p>
              </div>
            ) : bookingSlots.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar className="w-12 h-12 text-[#8b7764]/30 mx-auto mb-3" />
                <p className="text-sm text-[#6b5949] font-medium mb-1">{t.noSlotsAvailable || 'No slots available'}</p>
                <p className="text-xs text-[#8b7764]">{t.tryAgainLater || 'Please try again later or contact us.'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Date Tabs - Horizontal scrollable list for all live days */}
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                  {bookingSlots.map((dateSlot) => (
                    <button
                      key={dateSlot.dateKey}
                      onClick={() => setExpandedDate(dateSlot.dateKey)}
                      className={`flex-shrink-0 min-w-[90px] px-3 py-3 rounded-xl text-center transition-all border-2 snap-center ${
                        expandedDate === dateSlot.dateKey
                          ? 'bg-gradient-to-br from-[#9ca571] to-[#8a9463] text-white border-[#9ca571] shadow-lg'
                          : 'bg-white text-[#3d2f28] border-[#e8e6e3] hover:border-[#9ca571] hover:shadow-md'
                      }`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80 mb-1">
                        {dateSlot.date.toLocaleDateString(language === 'sq' ? 'sq-AL' : language === 'mk' ? 'mk-MK' : 'en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-sm font-bold">
                        {dateSlot.date.getDate()} {dateSlot.date.toLocaleDateString(language === 'sq' ? 'sq-AL' : language === 'mk' ? 'mk-MK' : 'en-US', { month: 'short' })}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Time Slots Grid */}
                {expandedDate && bookingSlots.find(slot => slot.dateKey === expandedDate) && (
                  <div className="bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4 border border-[#e8e6e3]/50">
                    <div className="grid grid-cols-3 gap-2">
                      {bookingSlots.find(slot => slot.dateKey === expandedDate)!.timeSlots.map((timeSlot) => (
                        <button
                          key={timeSlot.time}
                          onClick={() => handleTimeSlotClick(bookingSlots.find(slot => slot.dateKey === expandedDate)!, timeSlot)}
                          disabled={timeSlot.available <= 0 || isBookingFirstSession}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            timeSlot.available > 0 && !isBookingFirstSession
                              ? 'bg-white hover:bg-gradient-to-r hover:from-[#9ca571] hover:to-[#8a9463] text-[#3d2f28] hover:text-white hover:scale-105 active:scale-95 border border-[#e8e6e3] hover:border-transparent shadow-sm hover:shadow-md'
                              : 'bg-[#e8e6e3]/50 text-[#8b7764]/50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{timeSlot.time}</span>
                          </div>
                          <div className="text-[10px] mt-0.5 opacity-70">
                            {timeSlot.available > 0 
                              ? timeSlot.available === 1 
                                ? `1 ${t.spot} ${t.availableSingular}` 
                                : `${timeSlot.available} ${t.spots} ${t.available}`
                              : t.slotFull || 'Full'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isBookingFirstSession && (
              <div className="mt-4 bg-gradient-to-r from-[#9ca571]/10 to-[#8a9463]/10 rounded-xl p-4 text-center">
                <div className="w-6 h-6 border-3 border-[#9ca571] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-[#6b5949] font-medium">
                  {t.bookingInProgress || 'Booking first session...'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => {
            setExpandedPackage(null);
            setPackageData(null);
            setShowPackageCreatedPopup(false);
            setShowFirstSessionModal(false);
            setFormError(null);
            onBack();
          }}
          className="p-2.5 hover:bg-white/80 backdrop-blur-sm rounded-xl transition-all hover:shadow-md hover:scale-105 mr-3 border border-transparent hover:border-[#9ca571]/20"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[#3d2f28] tracking-tight">{t.packageOverviewTitle}</h1>
          <p className="text-[11px] text-[#8b7764] mt-1 font-medium tracking-wide">{t.packageOverviewSubtitle}</p>
        </div>
      </div>

      {/* Package Cards */}
      <div className="space-y-5 mb-6">
        {packages.map((pkg) => (
          <div
            key={pkg.type}
            className={`w-full rounded-3xl transition-all backdrop-blur-sm ${
              pkg.isRecommended 
                ? 'bg-gradient-to-br from-white via-white to-[#f8f9f4] border-2 border-[#9ca571]/40 shadow-[0_8px_30px_rgb(156,165,113,0.15)] hover:shadow-[0_12px_40px_rgb(156,165,113,0.25)]' 
                : 'bg-white/90 border border-[#e8e6e3] shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
            } hover:scale-[1.01] duration-300`}
          >
            {/* Package Header - Clickable */}
            <button
              onClick={() => handlePackageClick(pkg.type)}
              className="w-full p-5 text-left"
            >
              {/* Recommended Badge */}
              {pkg.isRecommended && (
                <div className="bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white text-[10px] px-3 py-1.5 rounded-full inline-block mb-4 font-semibold uppercase tracking-wider shadow-md shadow-[#9ca571]/30">
                  {t.recommended}
                </div>
              )}

              {/* Sessions */}
              <div className={pkg.isRecommended ? 'mb-4' : 'mb-4 mt-7'}>
                <div className="text-[28px] font-bold text-[#3d2f28] mb-1.5 tracking-tight">{pkg.label}</div>
              </div>

              {/* Pricing */}
              <div className="mb-3">
                <div className="text-[32px] font-bold text-[#3d2f28] tracking-tight">
                  {pkg.price} <span className="text-base font-semibold text-[#6b5949]">DEN</span>
                </div>
              </div>

              {/* Package Description */}
              <div className="mb-4">
                <p className="text-xs text-[#8b7764] leading-relaxed">
                  {pkg.type === 'package8' && (t.package8Detail || '8 training packages in a group (twice a week). For 35 days.')}
                  {pkg.type === 'package10' && (t.package10Detail || '10 training packages in a group (twice a week). For 35 days.')}
                  {pkg.type === 'package12' && (t.package12Detail || '12 training packages in a group (three times a week). For 35 days.')}
                </p>
              </div>

              {/* Key Purchase Context */}
              <div className="mb-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.classDuration || '50 min'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.validityPeriod || 'Valid 35 days'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.groupClass || 'Group class'}</span>
                </div>
              </div>

              {/* Toggle Button */}
              <div className={`flex items-center justify-center gap-2 text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-md ${
                pkg.isRecommended 
                  ? 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] hover:shadow-lg hover:shadow-[#9ca571]/30 hover:scale-[1.02]' 
                  : 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] hover:shadow-lg hover:shadow-[#9ca571]/30 hover:scale-[1.02]'
              } active:scale-[0.98]`}>
                <span>{expandedPackage === pkg.type ? t.hideDetails || 'Hide Details' : t.selectPackage}</span>
                {expandedPackage === pkg.type ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {/* Expandable Form Section */}
            {expandedPackage === pkg.type && (
              <div className="px-5 pb-5 space-y-3.5 border-t border-[#e8e6e3]/50 pt-5 animate-slide-down bg-gradient-to-b from-transparent to-[#faf9f7]/30">
                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.name}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t.namePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.surname}</label>
                  <input
                    type="text"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    placeholder={t.surnamePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.mobile}</label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder={t.mobilePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.email}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder={t.emailPlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                {/* Coupon Code Section */}
                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">
                    {t.couponCode || 'Coupon Code'} <span className="font-normal text-[#8b7764]/60">({t.optional || 'Optional'})</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponValidation({ status: 'idle' });
                      }}
                      placeholder={t.couponPlaceholder || 'Enter code'}
                      className={`flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 transition-all shadow-inner border ${
                        couponValidation.status === 'valid' 
                          ? 'border-green-500 focus:ring-green-500/50' 
                          : couponValidation.status === 'invalid'
                          ? 'border-red-500 focus:ring-red-500/50'
                          : 'border-[#e8e6e3]/50 focus:ring-[#9ca571]/50'
                      } focus:bg-white uppercase`}
                    />
                    <button
                      type="button"
                      onClick={validateCoupon}
                      disabled={!couponCode.trim() || couponValidation.status === 'validating'}
                      className="px-4 py-2.5 bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white rounded-xl text-xs font-semibold hover:shadow-lg hover:shadow-[#9ca571]/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {couponValidation.status === 'validating' ? '...' : (t.apply || 'Apply')}
                    </button>
                  </div>
                  {couponValidation.status === 'valid' && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {couponValidation.message}
                    </p>
                  )}
                  {couponValidation.status === 'invalid' && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <X className="w-3 h-3" />
                      {couponValidation.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-3.5 border border-[#e8e6e3]/50 shadow-inner">
                  <input
                    type="checkbox"
                    id={`payInStudio-${pkg.type}`}
                    checked={formData.payInStudio}
                    disabled
                    className="w-4.5 h-4.5 accent-[#9ca571] rounded opacity-100"
                  />
                  <label htmlFor={`payInStudio-${pkg.type}`} className="text-xs text-[#6b5949] font-semibold flex-1">
                    {t.payInStudio}
                  </label>
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                    {formError}
                  </div>
                )}

                <button
                  onClick={() => handleSubmit(pkg.type)}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#6b5949] to-[#5a4838] text-white py-3.5 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[#6b5949]/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSubmitting ? (t.processing || 'Processing...') : (t.confirmBooking || 'Confirm Booking')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Benefits Section */}
      <div className="bg-gradient-to-br from-white via-white to-[#f8f9f4] rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] mb-6 border border-[#e8e6e3]/50">
        <h2 className="text-sm font-semibold text-[#3d2f28] mb-4 tracking-tight">{t.packageBenefits}</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.benefit1}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.benefit2}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.benefit3}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-white to-[#f8f9f4] shadow-md flex items-center justify-center border border-[#e8e6e3]/50">
          <img src={logo} alt="Logo" className="w-8 h-8" />
        </div>
        <p className="text-[10px] text-[#8b7764] font-medium tracking-wide">{t.location}</p>
        <p className="text-[10px] text-[#8b7764] mt-1 opacity-70 tracking-wide">{t.copyright}</p>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slide-down {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 1000px;
          }
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }

        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
