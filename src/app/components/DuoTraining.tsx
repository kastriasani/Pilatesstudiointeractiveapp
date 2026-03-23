import { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CheckCircle, X, Calendar, Clock, Package } from 'lucide-react';
import { Language, translations } from '@/app/translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { logo } from '../../assets/images';
import {
  formatDateKeyLegacy,
  isTimeSlotPast
} from '../../utils/dateUtils';
import { useRealtimeAvailability } from '@/hooks/useRealtimeAvailability';

type DuoTrainingProps = {
  onBack: () => void;
  language: Language;
  onLogoClick: () => void;
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
  packageType: string;
};

type DateSlot = {
  date: Date;
  dateKey: string;
  displayDate: string;
  timeSlots: TimeSlotInfo[];
};

type TimeSlotInfo = {
  time: string;
  available: number;
  isBooked: boolean;
  classType: string;
  isBookable: boolean;
};

export function DuoTraining({ onBack, language, onLogoClick }: DuoTrainingProps) {
  const t = translations[language];
  const [expandedPackage, setExpandedPackage] = useState<'1class' | '8classes' | '12classes' | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    surname: '',
    mobile: '',
    email: '',
    payInStudio: true,
  });

  // 2-step flow state
  const [packageData, setPackageData] = useState<PackageData | null>(null);
  const [showPackageCreatedPopup, setShowPackageCreatedPopup] = useState(false);
  const [showFirstSessionModal, setShowFirstSessionModal] = useState(false);
  const [bookingSlots, setBookingSlots] = useState<DateSlot[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [isBookingFirstSession, setIsBookingFirstSession] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const packages = [
    {
      type: '1class' as const,
      sessions: 1,
      label: t.individual1Class,
      description: t.duo1ClassDesc || 'One duo class',
      price: 2100,
      perClass: 2100,
      savings: 0,
      isRecommended: false,
    },
    {
      type: '8classes' as const,
      sessions: 8,
      label: t.individual8Classes,
      description: t.individual8ClassDesc,
      price: 13400,
      perClass: 1675,
      savings: 3400,
      isRecommended: true,
    },
    {
      type: '12classes' as const,
      sessions: 12,
      label: t.individual12Classes,
      description: t.individual12ClassDesc,
      price: 18400,
      perClass: 1533,
      savings: 6800,
      isRecommended: false,
    },
  ];

  const handlePackageClick = (packageType: '1class' | '8classes' | '12classes') => {
    if (expandedPackage === packageType) {
      setExpandedPackage(null);
    } else {
      setExpandedPackage(packageType);
    }
  };

  // Load available time slots — shows ALL live days with class type info
  const loadAvailableSlots = async () => {
    setIsLoadingSlots(true);
    try {
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

      // Fetch time slots for each live day from API
      const slotsPromises = liveDays.map((isoDate: string) =>
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots?date=${isoDate}`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        ).then(res => res.json())
      );

      const slotsResults = await Promise.all(slotsPromises);

      const slots: DateSlot[] = [];

      for (let i = 0; i < liveDays.length; i++) {
        const isoDate = liveDays[i];
        const apiSlots = slotsResults[i]?.slots || [];

        if (apiSlots.length === 0) continue;

        const [year, month, day] = isoDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const dateKey = isoDate;
        const legacyKey = formatDateKeyLegacy(date);

        const dayBookings = existingBookings.filter((b: any) =>
          (b.dateKey === dateKey || b.dateKey === legacyKey) &&
          (b.status === 'confirmed' || b.status === 'attended' || b.status === 'pending')
        );

        const availableTimeSlots: TimeSlotInfo[] = apiSlots.map((slot: any) => {
          const time = slot.start_time;
          const maxCapacity = slot.max_capacity || 4;
          const classType = slot.class_type || 'group';

          const slotBookings = dayBookings.filter((b: any) => b.timeSlot === time);
          const seatsOccupied = slotBookings.reduce((total: number, booking: any) => {
            if (booking.serviceType === 'duo') return total + 2;
            if (booking.serviceType === 'individual') return total + 4;
            return total + 1;
          }, 0);

          const hasPrivateSession = slotBookings.some((b: any) =>
            b.serviceType === 'individual' || b.serviceType === 'duo'
          );

          const available = hasPrivateSession ? 0 : Math.max(0, maxCapacity - seatsOccupied);
          const isPastTime = isTimeSlotPast(date, time);

          // Only duo class_type slots are bookable for duo packages
          const isBookable = classType === 'duo' && available > 0 && !isPastTime;

          return {
            time,
            available: isPastTime ? 0 : available,
            isBooked: available <= 0 || isPastTime,
            classType,
            isBookable,
          };
        });

        // Only add dates that have at least one bookable duo slot
        if (availableTimeSlots.some((slot) => slot.isBookable)) {
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
      if (slots.length > 0) {
        setExpandedDate(slots[0].dateKey);
      }
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Live availability: re-fetch when any reservation changes
  useRealtimeAvailability(loadAvailableSlots);

  // Step 2: Book first session
  const handleBookFirstSession = async (dateKey: string, timeSlot: string) => {
    if (!packageData) return;

    setIsBookingFirstSession(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/packages/${packageData.packageId}/first-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            dateKey,
            timeSlot,
            appUrl: window.location.origin,
          }),
        }
      );

      const responseText = await response.text();

      if (!response.ok) {
        setFormError(responseText || 'Failed to book first session. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        setFormError('Server response error. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      if (!data.success) {
        setFormError(data.error || 'Failed to book first session. Please try again.');
        setIsBookingFirstSession(false);
        return;
      }

      setSuccessData({
        packageType: packageData.packageType,
        firstSession: {
          date: data.reservation?.date || dateKey,
          time: timeSlot,
        },
        remainingSessions: data.package?.remainingSessions || 0,
        isPreviewMode: data.isPreviewMode,
        previewRegistrationLink: data.previewRegistrationLink,
      });

      setShowFirstSessionModal(false);
      setPackageData(null);
      setFormData({ name: '', surname: '', mobile: '', email: '', payInStudio: true });
      setShowSuccessPopup(true);
      setIsBookingFirstSession(false);
    } catch (error) {
      console.error('Error booking first session:', error);
      setFormError('An error occurred. Please try again.');
      setIsBookingFirstSession(false);
    }
  };

  const handleTimeSlotClick = (dateSlot: DateSlot, timeSlot: TimeSlotInfo) => {
    if (!timeSlot.isBookable || isBookingFirstSession) return;
    handleBookFirstSession(dateSlot.dateKey, timeSlot.time);
  };

  const handleOpenFirstSessionModal = async () => {
    setShowPackageCreatedPopup(false);
    await loadAvailableSlots();
    setShowFirstSessionModal(true);
  };

  const handleSkipFirstSession = () => {
    setShowPackageCreatedPopup(false);
    setSuccessData({
      packageType: packageData?.packageType,
      skippedFirstSession: true,
    });
    setPackageData(null);
    setFormData({ name: '', surname: '', mobile: '', email: '', payInStudio: true });
    setShowSuccessPopup(true);
  };

  const handleSubmit = async (packageType: '1class' | '8classes' | '12classes') => {
    if (!formData.name || !formData.surname || !formData.mobile || !formData.email) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const packageTypeMap: Record<string, string> = {
        '1class': 'duo1',
        '8classes': 'duo8',
        '12classes': 'duo12',
      };

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
            packageType: packageTypeMap[packageType],
            name: formData.name,
            surname: formData.surname,
            mobile: formData.mobile,
            email: formData.email,
            language,
          }),
        }
      );

      const data = await response.json();

      if (data.success || data.packageId) {
        // Store package data for 2-step flow
        setPackageData({
          packageId: data.packageId,
          packageType: packageTypeMap[packageType],
        });
        setShowPackageCreatedPopup(true);
        setExpandedPackage(null);
        setIsSubmitting(false);
      } else {
        alert(data.error || 'Booking failed. Please try again.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('An error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const getSessionLabel = (pkgType: string) => {
    if (pkgType === 'duo1') return '1';
    if (pkgType === 'duo8') return '8';
    if (pkgType === 'duo12') return '12';
    return '';
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
                {getSessionLabel(packageData.packageType)} {t.sessions || 'CLASSES'} (DUO)
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

      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-5">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-7 max-w-sm w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 animate-scale-in">
            <div className="flex justify-between items-start mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <button
                onClick={() => { setShowSuccessPopup(false); setSuccessData(null); }}
                className="text-[#8b7764] hover:text-[#6b5949] transition-all hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-xl font-semibold text-[#3d2f28] mb-2 tracking-tight">
              {successData?.skippedFirstSession
                ? (t.packageCreatedSuccess || 'Your package is ready!')
                : (t.bookingConfirmed || 'Booking Confirmed!')}
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
                  {getSessionLabel(successData.packageType)} {t.sessions || 'CLASSES'} (DUO)
                </p>
              </div>
            )}

            {successData?.isPreviewMode && successData?.previewRegistrationLink ? (
              <div className="mb-5 bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-900 mb-2">
                  PREVIEW MODE - Email NOT Sent
                </p>
                <p className="text-xs text-amber-800 mb-3">
                  Click the link below to complete registration:
                </p>
                <a
                  href={successData.previewRegistrationLink}
                  className="block w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-2.5 px-3 rounded-lg transition-colors text-center break-all"
                >
                  Complete Registration
                </a>
              </div>
            ) : (
              <p className="text-sm text-[#6b5949] mb-5 leading-relaxed">
                {successData?.skippedFirstSession
                  ? (t.packageSavedDesc || 'Your package has been saved. Please visit the studio to complete payment and book your first session.')
                  : (t.bookingConfirmedDesc || 'Check your email to complete registration. The activation code will be sent by admin after payment confirmation.')}
              </p>
            )}

            <button
              onClick={() => { setShowSuccessPopup(false); setSuccessData(null); }}
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

            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

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
                {/* Date Tabs */}
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
                          disabled={!timeSlot.isBookable || isBookingFirstSession}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            timeSlot.isBookable && !isBookingFirstSession
                              ? 'bg-white hover:bg-gradient-to-r hover:from-[#9ca571] hover:to-[#8a9463] text-[#3d2f28] hover:text-white hover:scale-105 active:scale-95 border border-[#e8e6e3] hover:border-transparent shadow-sm hover:shadow-md'
                              : timeSlot.classType !== 'duo'
                                ? 'bg-[#e8e6e3]/30 text-[#8b7764]/40 cursor-not-allowed border border-dashed border-[#d4c4ba]/30'
                                : 'bg-[#e8e6e3]/50 text-[#8b7764]/50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{timeSlot.time}</span>
                          </div>
                          <div className="text-[10px] mt-0.5 opacity-70">
                            {timeSlot.classType !== 'duo'
                              ? (timeSlot.classType === 'individual' ? (t.classTypeIndividual || 'Individual') : (t.groupClass || 'Group'))
                              : timeSlot.isBookable
                                ? timeSlot.available === 1
                                  ? `1 ${t.spot} ${t.availableSingular}`
                                  : `${timeSlot.available} ${t.spots} ${t.available}`
                                : (t.slotFull || 'Full')}
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
          onClick={onBack}
          className="p-2.5 hover:bg-white/80 backdrop-blur-sm rounded-xl transition-all hover:shadow-md hover:scale-105 mr-3 border border-transparent hover:border-[#9ca571]/20"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[#3d2f28] tracking-tight">{t.duoTitle}</h1>
          <p className="text-[11px] text-[#8b7764] mt-1 font-medium tracking-wide">{t.choosePackage}</p>
        </div>
      </div>

      {/* Package Cards */}
      <div className="space-y-5 mb-6">
        {packages.map((pkg) => (
          <div
            key={pkg.type}
            className={`w-full rounded-3xl transition-all backdrop-blur-sm cursor-pointer ${
              expandedPackage === pkg.type
                ? pkg.isRecommended
                  ? 'bg-gradient-to-br from-white via-white to-[#f8f9f4] border-2 border-[#9ca571]/60 shadow-[0_12px_40px_rgb(156,165,113,0.2)] scale-[1.01]'
                  : 'bg-white border-2 border-[#9ca571]/40 shadow-[0_8px_30px_rgba(156,165,113,0.15)] scale-[1.01]'
                : pkg.isRecommended
                  ? 'bg-gradient-to-br from-white via-white to-[#f8f9f4] border-2 border-[#b5a582]/40 shadow-[0_8px_30px_rgb(181,165,130,0.15)] hover:shadow-[0_12px_40px_rgb(181,165,130,0.25)]'
                  : 'bg-white/90 border border-[#e8e6e3] shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
            } hover:scale-[1.01] active:scale-[0.99] duration-200`}
          >
            {/* Package Header - Clickable */}
            <button
              onClick={() => handlePackageClick(pkg.type)}
              className="w-full p-5 text-left"
            >
              {/* Recommended Badge */}
              {pkg.isRecommended && (
                <div className="bg-gradient-to-r from-[#b5a582] to-[#a89876] text-white text-[10px] px-3 py-1.5 rounded-full inline-block mb-4 font-semibold uppercase tracking-wider shadow-md shadow-[#b5a582]/30">
                  {t.recommended}
                </div>
              )}

              {/* Sessions */}
              <div className={pkg.isRecommended ? 'mb-4' : 'mb-4 mt-7'}>
                <div className="text-[28px] font-bold text-[#3d2f28] mb-1.5 tracking-tight">{pkg.label}</div>
                <p className="text-sm text-[#9ca571] font-semibold tracking-wide">{pkg.description}</p>
              </div>

              {/* Pricing */}
              <div className="mb-3">
                <div className="text-[32px] font-bold text-[#3d2f28] tracking-tight">
                  {pkg.price} <span className="text-base font-semibold text-[#6b5949]">DEN</span>
                </div>
              </div>

              {/* Package Description */}
              {pkg.type !== '1class' && (
                <div className="mb-4">
                  <p className="text-xs text-[#8b7764] leading-relaxed">
                    {pkg.type === '8classes' && (t.duo8Detail || '8 training packages for two people (twice a week). For 35 days.')}
                    {pkg.type === '12classes' && (t.duo12Detail || '12 training packages for two people (three times a week). For 35 days.')}
                  </p>
                </div>
              )}

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
                  <span>{t.privateStudio || 'Private studio included'}</span>
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
        <h2 className="text-sm font-semibold text-[#3d2f28] mb-4 tracking-tight">{t.whatIsDuo}</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit1}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit2}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit3}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit4}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-white to-[#f8f9f4] shadow-md flex items-center justify-center border border-[#e8e6e3]/50 cursor-pointer hover:scale-105 transition-transform">
          <img
            src={logo}
            alt="Logo"
            className="w-8 h-8"
            onClick={onLogoClick}
          />
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
