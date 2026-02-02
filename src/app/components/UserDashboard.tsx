import React, { useState, useEffect } from 'react';
import { ArrowLeft, Package, Calendar, Clock, CreditCard, CheckCircle, AlertCircle, Edit2, Plus } from 'lucide-react';
import { Language, translations } from '../translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type UserDashboardProps = {
  onBack: () => void;
  language: Language;
  sessionToken: string;
  userEmail: string;
};

type PackageDetails = {
  id: string;
  packageType: string;
  packageStatus: 'pending' | 'active';
  totalSessions: number;
  remainingSessions: number;
  sessionsBooked: string[];
  firstSession: {
    id: string;
    date: string;
    dateKey: string;
    time: string;
    endTime: string;
  } | null;
  createdAt: string;
  activationCodeId: string;
};

type TimeSlot = {
  time: string;
  available: number;
  isBooked: boolean;
};

type DateSlot = {
  date: Date;
  dateKey: string;
  displayDate: string;
  timeSlots: TimeSlot[];
};

type Reservation = {
  id: string;
  dateKey: string;
  timeSlot: string;
  reservationStatus: 'pending' | 'confirmed' | 'attended' | 'cancelled' | 'no_show';
  paymentStatus: 'paid' | 'unpaid';
  packageId: string | null;
  createdAt: string;
};

export function UserDashboard({ onBack, language, sessionToken, userEmail }: UserDashboardProps) {
  const t = translations[language];
  const [packages, setPackages] = useState<PackageDetails[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageDetails | null>(null);
  const [availableSlots, setAvailableSlots] = useState<DateSlot[]>([]);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Get session token from prop or localStorage as fallback
  const activeSessionToken = sessionToken || localStorage.getItem('wellnest_session') || '';

  // Month names for date formatting
  const monthNames: Record<Language, string[]> = {
    sq: ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'],
    mk: ['Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни', 'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };

  // Format dateKey "M-D" to human readable "D Month YYYY"
  const formatDateKey = (dateKey: string): string => {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    if (parts.length !== 2) return dateKey; // Return as-is if not M-D format
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    if (isNaN(month) || isNaN(day)) return dateKey;
    const monthName = monthNames[language]?.[month - 1] || monthNames.en[month - 1];
    return `${day} ${monthName} 2026`;
  };

  // Format time slot to time range (50 min session)
  const formatTimeRange = (timeSlot: string): string => {
    if (!timeSlot) return '';
    const [hours, minutes] = timeSlot.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return timeSlot;
    const endMinutes = minutes + 50;
    const endHours = hours + Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${timeSlot} - ${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  // Debug: Log props on mount
  useEffect(() => {
    console.log('🎯 UserDashboard mounted with props:', {
      sessionTokenProp: sessionToken ? '✅ Present' : '❌ Missing',
      sessionTokenFromStorage: localStorage.getItem('wellnest_session') ? '✅ Present' : '❌ Missing',
      activeSessionToken: activeSessionToken ? '✅ Using' : '❌ None',
      userEmail,
      language
    });
  }, []);

  // Load user's packages
  const loadPackages = async () => {
    try {
      setLoading(true);
      
      console.log('🔐 Loading packages with session token:', activeSessionToken);
      console.log('📧 User email:', userEmail);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': activeSessionToken,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to load packages:', response.status, errorData);
        alert(`Failed to load packages: ${errorData.error || 'Unknown error'}`);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setPackages(data.packages || []);
        setReservations(data.reservations || []);
        console.log('📦 Loaded user packages:', data.packages);
        console.log('📅 Loaded user reservations:', data.reservations);
      }
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSessionToken) {
      console.log('✅ Session token available, loading packages...');
      loadPackages();
    } else {
      console.warn('⚠️ No session token available - user may need to login');
      setLoading(false);
    }
  }, [activeSessionToken]);

  // Load available slots for rescheduling - uses /bookings endpoint like PackageOverview
  const loadAvailableSlots = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/bookings`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to load bookings for slots');
        return;
      }

      const data = await response.json();
      const existingBookings = data.bookings || [];

      // Generate next 7 weekdays
      const slots: DateSlot[] = [];
      const timeSlotList = ['09:00', '10:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        const dateKey = date.toISOString().split('T')[0];

        // Get bookings for this date
        const dayBookings = existingBookings.filter((b: any) =>
          b.dateKey === dateKey &&
          (b.reservationStatus === 'confirmed' || b.reservationStatus === 'attended' || b.reservationStatus === 'pending')
        );

        const availableTimeSlots = timeSlotList.map(time => {
          const slotBookings = dayBookings.filter((b: any) => b.timeSlot === time);
          const seatsOccupied = slotBookings.reduce((total: number, booking: any) => {
            return total + (booking.seatsOccupied || 1);
          }, 0);
          const hasPrivateSession = slotBookings.some((b: any) => b.isPrivateSession);
          const available = hasPrivateSession ? 0 : Math.max(0, 4 - seatsOccupied);

          // Filter out past time slots for today
          const now = new Date();
          const [hours] = time.split(':').map(Number);
          const isPastTime = i === 0 && hours <= now.getHours();

          return {
            time,
            available: isPastTime ? 0 : available,
            isBooked: available <= 0 || isPastTime,
          };
        });

        if (availableTimeSlots.some(slot => slot.available > 0)) {
          slots.push({
            date,
            dateKey,
            displayDate: date.toLocaleDateString(language === 'sq' ? 'sq-AL' : 'en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            }),
            timeSlots: availableTimeSlots,
          });
        }
      }

      setAvailableSlots(slots);
      console.log('📅 Loaded', slots.length, 'available dates for rescheduling');
    } catch (error) {
      console.error('Error loading slots:', error);
    }
  };

  const handleRescheduleClick = async (pkg: PackageDetails) => {
    if (!pkg.firstSession) {
      alert('No first session booked yet');
      return;
    }

    // Check if >24h before class
    const classDateTime = new Date(`${pkg.firstSession.dateKey}T${pkg.firstSession.time}`);
    const now = new Date();
    const hoursUntilClass = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilClass < 24) {
      alert(`Cannot reschedule within 24 hours of class time. ${Math.round(hoursUntilClass * 10) / 10} hours remaining.`);
      return;
    }

    setSelectedPackage(pkg);
    await loadAvailableSlots();
    setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (dateKey: string, timeSlot: string) => {
    if (!selectedPackage) return;

    setIsRescheduling(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages/${selectedPackage.id}/reschedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': activeSessionToken,
          },
          body: JSON.stringify({
            dateKey,
            timeSlot,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to reschedule');
        setIsRescheduling(false);
        return;
      }

      console.log('✅ Rescheduled successfully:', data);
      alert('Session rescheduled successfully!');
      
      // Reload packages
      await loadPackages();
      
      // Close modal
      setShowRescheduleModal(false);
      setSelectedPackage(null);
      setIsRescheduling(false);

    } catch (error) {
      console.error('Error rescheduling:', error);
      alert('An error occurred. Please try again.');
      setIsRescheduling(false);
    }
  };

  const getPackageDisplayName = (packageType: string): string => {
    const typeMap: Record<string, string> = {
      'package8': t.package8Classes || '8 Classes Package',
      'package10': t.package10Classes || '10 Classes Package',
      'package12': t.package12Classes || '12 Classes Package',
      '1class': t.individual1Class || '1 Individual Class',
      '8classes': t.individual8Classes || '8 Individual Classes',
      '12classes': t.individual12Classes || '12 Individual Classes',
      'duo1class': t.duo1Class || '1 DUO Class',
      'duo8classes': t.duo8Classes || '8 DUO Classes',
      'duo12classes': t.duo12Classes || '12 DUO Classes',
      'single': t.singleClass || 'Single Class',
    };
    return typeMap[packageType] || packageType;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#9ca571] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#6b5949]">Loading your packages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-8">
        <button
          onClick={onBack}
          className="hover:bg-[#e8dfd8] rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
        <h1 className="text-lg font-semibold text-[#3d2f28]">
          {t.myPackages || 'My Packages'}
        </h1>
        <div className="w-9" /> {/* Spacer */}
      </div>

      {/* User Info */}
      <div className="bg-gradient-to-br from-[#9ca571] to-[#8a9463] rounded-2xl p-4 mb-6 text-white">
        <p className="text-xs opacity-90 mb-1">{t.loggedInAs || 'Logged in as'}</p>
        <p className="text-sm font-semibold">{userEmail}</p>
      </div>

      {/* Content: Packages + Reservations */}
      {packages.length === 0 && reservations.filter(r => !r.packageId).length === 0 ? (
        // Empty state - no packages AND no standalone reservations
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 text-[#e8e6e3] mx-auto mb-4" />
          <p className="text-sm text-[#6b5949] mb-4">
            {t.whenIsNextClass || 'When is your next class?'}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-[#9ca571] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#8a9463] transition-colors"
          >
            {t.bookNow || 'Book Now'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e6e3]"
            >
              {/* Package Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-[#3d2f28] mb-2">
                    {getPackageDisplayName(pkg.packageType)}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#9ca571]" />
                    <p className="text-xs text-[#6b5949]">
                      {pkg.remainingSessions} / {pkg.totalSessions} {t.sessionsRemaining || 'sessions remaining'}
                    </p>
                  </div>
                </div>

                {/* Payment Status Badge */}
                <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                  pkg.packageStatus === 'active' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {pkg.packageStatus === 'active' ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t.paid || 'Paid'}
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      {t.needsPayment || 'Needs Payment'}
                    </>
                  )}
                </div>
              </div>

              {/* First Session Info */}
              {pkg.firstSession ? (
                <div className="bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4 mb-3">
                  <p className="text-xs font-semibold text-[#6b5949] mb-3">
                    {t.firstSession || 'First Session'}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#9ca571]" />
                      <p className="text-sm text-[#3d2f28] font-medium">
                        {pkg.firstSession.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#9ca571]" />
                      <p className="text-sm text-[#3d2f28] font-medium">
                        {pkg.firstSession.time} - {pkg.firstSession.endTime}
                      </p>
                    </div>
                  </div>

                  {/* Reschedule Button */}
                  <button
                    onClick={() => handleRescheduleClick(pkg)}
                    className="w-full mt-3 bg-white text-[#6b5949] py-2.5 rounded-lg text-xs font-medium border border-[#e8e6e3] hover:bg-[#f5f3f0] transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    {t.reschedule || 'Reschedule'}
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                  <p className="text-xs text-amber-800">
                    {t.noFirstSessionBooked || 'First session not booked yet'}
                  </p>
                </div>
              )}

              {/* Package Info Footer - only show activation code if not yet activated */}
              {pkg.activationStatus !== 'activated' && (
                <div className="pt-3 border-t border-[#e8e6e3]">
                  <p className="text-xs text-[#8b7764]">
                    {t.activationCode || 'Activation Code'}: {pkg.activationCodeId || 'Pending'}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Single Session Reservations (not linked to packages) */}
          {reservations.filter(r => !r.packageId).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-[#3d2f28] mb-3">
                {t.yourNextClass || 'Your Next Class'}
              </h3>
              <div className="space-y-3">
                {reservations.filter(r => !r.packageId).map((res) => (
                  <div key={res.id} className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e6e3]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#e8dfd8] rounded-full flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-[#6b5949]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#3d2f28]">
                          {formatDateKey(res.dateKey)}
                        </p>
                        <p className="text-xs text-[#6b5949]">
                          {formatTimeRange(res.timeSlot)}
                        </p>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${
                      res.paymentStatus === 'paid' || res.reservationStatus === 'confirmed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {res.paymentStatus === 'paid' || res.reservationStatus === 'confirmed' ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          {t.confirmed || 'Confirmed'}
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" />
                          {t.pendingPayment || 'Pending Payment'}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Book Another Class Button */}
              <button
                onClick={() => window.location.href = '/'}
                className="w-full mt-4 bg-[#9ca571] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#8a9463] transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t.bookAnotherClass || 'Book Another Class'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedPackage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto pb-safe">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-[#e8e6e3] px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#3d2f28]">
                {t.rescheduleSession || 'Reschedule Session'}
              </h2>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="text-[#8b7764] hover:text-[#6b5949]"
              >
                ✕
              </button>
            </div>

            {/* Current Session Info */}
            <div className="px-5 py-4 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6]">
              <p className="text-xs font-semibold text-[#6b5949] mb-2">
                {t.currentSession || 'Current Session'}
              </p>
              <p className="text-sm text-[#3d2f28]">
                {selectedPackage.firstSession?.date} at {selectedPackage.firstSession?.time}
              </p>
            </div>

            {/* Available Slots */}
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-[#6b5949] mb-4">
                {t.selectNewDateTime || 'Select New Date & Time'}
              </p>

              {availableSlots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#6b5949]">
                    {t.noSlotsAvailable || 'No slots available'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableSlots.map((dateSlot) => (
                    <div key={dateSlot.dateKey} className="bg-white rounded-xl border border-[#e8e6e3] p-4">
                      <p className="text-sm font-semibold text-[#3d2f28] mb-3">
                        {dateSlot.displayDate}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {dateSlot.timeSlots.map((timeSlot) => (
                          <button
                            key={timeSlot.time}
                            onClick={() => handleRescheduleSubmit(dateSlot.dateKey, timeSlot.time)}
                            disabled={timeSlot.available <= 0 || isRescheduling}
                            className={`py-2.5 px-3 rounded-lg text-xs font-medium transition-all ${
                              timeSlot.available > 0 && !isRescheduling
                                ? 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white hover:shadow-lg'
                                : 'bg-[#e8e6e3] text-[#8b7764] cursor-not-allowed'
                            }`}
                          >
                            {isRescheduling ? 'Rescheduling...' : timeSlot.time}
                            <span className="block text-xs mt-0.5 opacity-80">
                              {timeSlot.available} {t.spotsLeft || 'spots'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
