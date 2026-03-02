import React, { useState, useEffect } from 'react';
import { Package, Calendar, Clock, CheckCircle, AlertCircle, Edit2, Plus, ChevronDown, ChevronUp, Globe, Users, LogOut, Lock, ShoppingBag } from 'lucide-react';
import { Language, translations } from '../translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import { getSkopjeTime, isTimeSlotPast } from '../../utils/dateUtils';

type UserDashboardProps = {
  onBack: () => void;
  onLogout: () => void;
  language: Language;
  sessionToken: string;
  userEmail: string;
};

type BookedSession = {
  id: string;
  date: string;
  dateKey: string;
  time: string;
  endTime: string;
  slotIndex: number;
  attended?: boolean;
  isFriendBooking?: boolean;
  createdAt?: string;
};

type PackageDetails = {
  id: string;
  packageType: string;
  packageStatus: 'pending' | 'active' | 'fully_used' | 'expired' | 'cancelled';
  activationStatus?: string;
  paymentStatus?: 'paid' | 'unpaid';
  totalSessions: number;
  remainingSessions: number;
  sessionsBooked: string[];
  bookedSessions: BookedSession[]; // All booked sessions with details
  firstSession: {
    id: string;
    date: string;
    dateKey: string;
    time: string;
    endTime: string;
  } | null;
  createdAt: string;
};

type TimeSlot = {
  time: string;
  available: number;
  maxCapacity: number;
  isBooked: boolean;
  userBookings: number; // How many times user booked this slot
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
  isFriendBooking?: boolean;
  createdAt: string;
};

export function UserDashboard({ onBack, onLogout, language, sessionToken, userEmail }: UserDashboardProps) {
  const { setLanguage } = useLanguage();
  const t = translations[language];
  const [packages, setPackages] = useState<PackageDetails[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // Refresh session expiry in localStorage (keeps frontend in sync with backend sliding expiration)
  const refreshSessionExpiry = () => {
    const newExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
    localStorage.setItem('wellnest_session_expiry', newExpiry.toString());
  };

  // Handle session expired errors - use onLogout to clear storage and redirect
  const handleSessionError = (error: string): boolean => {
    if (error === 'Session expired' || error === 'Invalid session' || error === 'No session token provided') {
      // Reset loading flags before logout to prevent stale state if unmount is delayed
      setIsRescheduling(false);
      setIsBuyingPackage(false);
      toast.error('Your session has expired. Please log in again.');
      onLogout();
      return true;
    }
    return false;
  };
  const [loading, setLoading] = useState(true);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageDetails | null>(null);
  const [availableSlots, setAvailableSlots] = useState<DateSlot[]>([]);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [modalMode, setModalMode] = useState<'reschedule' | 'book'>('reschedule');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  const [inlineBookingPackageId, setInlineBookingPackageId] = useState<string | null>(null);
  const [gracePeriodTick, setGracePeriodTick] = useState(0); // Forces re-render for countdown

  // Buy new package state
  const [isBuyingPackage, setIsBuyingPackage] = useState(false);
  const [showArchivedPackages, setShowArchivedPackages] = useState(false);

  // Get session token from prop or localStorage as fallback
  const activeSessionToken = sessionToken || localStorage.getItem('wellnest_session') || '';

  // Month names for date formatting
  const monthNames: Record<Language, string[]> = {
    SQ: ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'],
    MK: ['Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни', 'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'],
    EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };

  // Format dateKey "M-D" or "YYYY-MM-DD" to human readable "D Month YYYY"
  const formatDateKey = (dateKey: string): string => {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    let year: number, month: number, day: number;
    if (parts.length === 3) {
      // ISO format: YYYY-MM-DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      // Legacy format: M-D
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = getSkopjeTime().getFullYear();
    } else {
      return dateKey;
    }
    if (isNaN(month) || isNaN(day)) return dateKey;
    const monthName = monthNames[language]?.[month - 1] || monthNames.EN[month - 1];
    return `${day} ${monthName} ${year}`;
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

  // Format date to short "D Mon" format
  const formatShortDate = (dateKey: string): string => {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    // Handle both YYYY-MM-DD and M-D formats
    let month: number, day: number;
    if (parts.length === 3) {
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else {
      return dateKey;
    }
    const shortMonths: Record<Language, string[]> = {
      SQ: ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj'],
      MK: ['Јан', 'Фев', 'Мар', 'Апр', 'Мај', 'Јун', 'Јул', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'],
      EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    };
    const monthName = shortMonths[language]?.[month - 1] || shortMonths.EN[month - 1];
    return `${day} ${monthName}`;
  };

  // Get next session from packages or reservations
  const getNextSession = (): { dateKey: string; time: string; date: string } | null => {
    const now = getSkopjeTime();
    let nextSession: { dateKey: string; time: string; date: string; dateTime: Date } | null = null;

    // Check package first sessions
    packages.forEach(pkg => {
      if (pkg.firstSession) {
        // Parse date consistently using component constructor (same as standalone path)
        const dk = pkg.firstSession.dateKey;
        const dkParts = dk.split('-').map(Number);
        const [y, mo, d] = dkParts.length === 3 ? dkParts : [now.getFullYear(), ...dkParts];
        const [h, mi] = pkg.firstSession.time.split(':').map(Number);
        const sessionDateTime = new Date(y, mo - 1, d, h, mi);
        if (sessionDateTime > now && (!nextSession || sessionDateTime < nextSession.dateTime)) {
          nextSession = {
            dateKey: pkg.firstSession.dateKey,
            time: pkg.firstSession.time,
            date: pkg.firstSession.date,
            dateTime: sessionDateTime
          };
        }
      }
    });

    // Check standalone reservations
    reservations.filter(r => !r.packageId && r.reservationStatus !== 'cancelled').forEach(res => {
      // Parse both YYYY-MM-DD and legacy M-D formats
      let year: number, month: number, day: number;
      const parts = res.dateKey.split('-').map(Number);
      if (parts.length === 3) {
        [year, month, day] = parts;
      } else {
        [month, day] = parts;
        year = getSkopjeTime().getFullYear();
      }
      const sessionDateTime = new Date(year, month - 1, day, ...res.timeSlot.split(':').map(Number));
      if (sessionDateTime > now && (!nextSession || sessionDateTime < nextSession.dateTime)) {
        nextSession = {
          dateKey: res.dateKey,
          time: res.timeSlot,
          date: formatDateKey(res.dateKey),
          dateTime: sessionDateTime
        };
      }
    });

    return nextSession ? { dateKey: nextSession.dateKey, time: nextSession.time, date: nextSession.date } : null;
  };

  // Calculate countdown string
  const calculateCountdown = (dateKey: string, time: string): string => {
    const [year, month, day] = dateKey.includes('-') && dateKey.length === 10
      ? dateKey.split('-').map(Number)
      : [getSkopjeTime().getFullYear(), ...dateKey.split('-').map(Number)];
    const [hours, minutes] = time.split(':').map(Number);

    const sessionDate = dateKey.length === 10
      ? new Date(year, month - 1, day, hours, minutes)
      : new Date(year, month - 1, day, hours, minutes);

    const now = getSkopjeTime();
    const diff = sessionDate.getTime() - now.getTime();

    if (diff <= 0) return language === 'SQ' ? 'Tani' : language === 'MK' ? 'Сега' : 'Now';

    const totalMinutes = Math.floor(diff / (1000 * 60));
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hoursLeft = totalHours % 24;
    const minutesLeft = totalMinutes % 60;

    if (days > 0) {
      const dayLabel = language === 'SQ' ? 'ditë' : language === 'MK' ? 'дена' : 'days';
      const hourLabel = language === 'SQ' ? 'orë' : language === 'MK' ? 'часа' : 'h';
      return `${days} ${dayLabel} ${hoursLeft}${hourLabel}`;
    } else if (hoursLeft > 0) {
      const hourLabel = language === 'SQ' ? 'orë' : language === 'MK' ? 'часа' : 'h';
      const minLabel = language === 'SQ' ? 'min' : language === 'MK' ? 'мин' : 'min';
      return `${hoursLeft}${hourLabel} ${minutesLeft}${minLabel}`;
    } else {
      const minLabel = language === 'SQ' ? 'minuta' : language === 'MK' ? 'минути' : 'minutes';
      return `${minutesLeft} ${minLabel}`;
    }
  };

  // Update countdown every minute
  useEffect(() => {
    const updateCountdown = () => {
      const nextSession = getNextSession();
      if (nextSession) {
        setCountdown(calculateCountdown(nextSession.dateKey, nextSession.time));
      } else {
        setCountdown('');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [packages, reservations, language]);

  // Previously had debug logging here - removed for production

  // Load user's packages. Returns fresh packages array for callers that need it immediately.
  const loadPackages = async (): Promise<PackageDetails[]> => {
    try {
      setLoading(true);

      console.log('🔐 Loading packages...');

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
        if (handleSessionError(errorData.error)) return [];
        toast.error(`Failed to load packages: ${errorData.error || 'Unknown error'}`);
        return [];
      }

      const data = await response.json();
      if (data.success) {
        refreshSessionExpiry(); // Keep frontend expiry in sync with backend
        const freshPackages = data.packages || [];
        setPackages(freshPackages);
        setReservations(data.reservations || []);
        setLastUpdated(new Date());
        console.log('📦 Loaded user packages:', data.packages);
        console.log('📅 Loaded user reservations:', data.reservations);
        return freshPackages;
      }
      return [];
    } catch (error) {
      console.error('Error loading packages:', error);
      return [];
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

  // Timer for grace period countdown - updates every second when inline calendar is open
  // Only auto-closes if the selected session was booked recently (within grace period)
  useEffect(() => {
    if (!inlineBookingPackageId || selectedSlotIndex === null) return;

    // Check if the selected session is within grace period at the time of opening
    const pkg = packages.find(p => p.id === inlineBookingPackageId);
    const session = pkg?.bookedSessions?.find(s => s.slotIndex === selectedSlotIndex);
    if (!session || !session.createdAt) return; // No session or no createdAt — nothing to auto-close

    const createdAtUTC = new Date(session.createdAt);
    const createdAt = new Date(createdAtUTC.toLocaleString('en-US', { timeZone: 'Europe/Skopje' }));
    const gracePeriodMs = 2 * 60 * 1000; // 2 minutes
    const initialElapsed = getSkopjeTime().getTime() - createdAt.getTime();

    // If already past grace period when opened, don't start the auto-close timer
    if (initialElapsed >= gracePeriodMs) return;

    const interval = setInterval(() => {
      setGracePeriodTick(prev => {
        const now = getSkopjeTime();
        const elapsedMs = now.getTime() - createdAt.getTime();
        if (elapsedMs >= gracePeriodMs) {
          // Grace period just expired - close the inline calendar
          setInlineBookingPackageId(null);
          setSelectedSlotIndex(null);
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [inlineBookingPackageId, selectedSlotIndex, packages]);

  // Load available slots for rescheduling - fetches ONLY live days from API
  const loadAvailableSlots = async (): Promise<DateSlot[]> => {
    try {
      // Fetch live days and bookings in parallel
      const [liveDaysResponse, bookingsResponse] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/live-days`,
          {
            headers: { 'Authorization': `Bearer ${publicAnonKey}` },
          }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/availability`,
          {
            headers: { 'Authorization': `Bearer ${publicAnonKey}` },
          }
        ),
      ]);

      if (!liveDaysResponse.ok) {
        console.error('Failed to load live days');
        return [];
      }

      const liveDaysData = await liveDaysResponse.json();
      const liveDays: string[] = liveDaysData.dates || [];

      if (liveDays.length === 0) {
        console.log('📅 No live days available');
        setAvailableSlots([]);
        return [];
      }

      const bookingsData = bookingsResponse.ok ? await bookingsResponse.json() : { bookings: [] };
      const existingBookings = bookingsData.bookings || [];

      // Fetch time slots for each live day
      const slotsPromises = liveDays.map(dateKey =>
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots?date=${dateKey}`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        ).then(res => res.json())
      );

      const slotsResults = await Promise.all(slotsPromises);

      const slots: DateSlot[] = [];
      const today = getSkopjeTime();
      today.setHours(0, 0, 0, 0);

      liveDays.forEach((dateKey, index) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const isToday = date.getTime() === today.getTime();

        // Get time slots from API response (or use defaults)
        const daySlots = slotsResults[index]?.slots || [];
        const timeSlotList = daySlots.length > 0
          ? daySlots.map((s: any) => s.start_time)
          : ['09:00', '10:00', '11:00', '17:00', '18:00', '19:00', '20:00'];

        // Get bookings for this date (convert ISO to short format for comparison)
        const shortDateKey = `${month}-${day}`; // e.g., "2-5" from "2026-02-05"
        const dayBookings = existingBookings.filter((b: any) =>
          (b.dateKey === dateKey || b.dateKey === shortDateKey) &&
          (b.status === 'confirmed' || b.status === 'attended' || b.status === 'pending')
        );

        const availableTimeSlots = timeSlotList.map((time: string) => {
          const slotBookings = dayBookings.filter((b: any) => b.timeSlot === time);
          // Calculate seats based on serviceType: duo=2, individual=4 (private), others=1
          const seatsOccupied = slotBookings.reduce((total: number, booking: any) => {
            if (booking.serviceType === 'duo') return total + 2;
            if (booking.serviceType === 'individual') return total + 4;
            return total + 1;
          }, 0);
          const hasPrivateSession = slotBookings.some((b: any) =>
            b.serviceType === 'individual' || b.serviceType === 'duo'
          );
          const maxCapacity = daySlots.find((s: any) => s.start_time === time)?.max_capacity || 4;
          const available = hasPrivateSession ? 0 : Math.max(0, maxCapacity - seatsOccupied);

          // Count how many bookings the current user has on this slot
          const userSlotBookings = slotBookings.filter((b: any) =>
            b.email?.toLowerCase() === userEmail?.toLowerCase()
          ).length;

          // Filter out past time slots (using Skopje timezone with 5-min buffer)
          const isPastTime = isTimeSlotPast(date, time);

          return {
            time,
            available: isPastTime ? 0 : available,
            maxCapacity,
            isBooked: available <= 0 || isPastTime,
            userBookings: userSlotBookings,
          };
        });

        if (availableTimeSlots.some(slot => slot.available > 0)) {
          slots.push({
            date,
            dateKey,
            displayDate: date.toLocaleDateString(language === 'SQ' ? 'sq-AL' : language === 'MK' ? 'mk-MK' : 'en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            }),
            timeSlots: availableTimeSlots,
          });
        }
      });

      setAvailableSlots(slots);
      console.log('📅 Loaded', slots.length, 'available LIVE dates for booking');
      return slots;
    } catch (error) {
      console.error('Error loading slots:', error);
      return [];
    }
  };

  const handleRescheduleClick = async (pkg: PackageDetails) => {
    if (!pkg.firstSession) {
      toast.error('No first session booked yet');
      return;
    }

    // Check if >24h before class (use Skopje timezone - sessions are in Skopje time)
    const now = getSkopjeTime();
    const dateKey = pkg.firstSession.dateKey;

    // Parse date from both formats: "YYYY-MM-DD" or "M-D"
    let year: number, month: number, day: number;
    if (dateKey.length > 5 && dateKey.includes('-')) {
      [year, month, day] = dateKey.split('-').map(Number);
    } else {
      [month, day] = dateKey.split('-').map(Number);
      year = now.getFullYear();
    }

    const [hours, minutes] = pkg.firstSession.time.split(':').map(Number);
    const classDateTime = new Date(year, month - 1, day, hours, minutes);
    const hoursUntilClass = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilClass < 24) {
      toast.error(`Cannot reschedule within 24 hours of class time. ${Math.round(hoursUntilClass * 10) / 10} hours remaining.`);
      return;
    }

    setSelectedPackage(pkg);
    setModalMode('reschedule');
    await loadAvailableSlots();
    setShowRescheduleModal(true);
  };

  const handleBookFirstSession = async (pkg: PackageDetails) => {
    if (pkg.remainingSessions <= 0) {
      toast.error('No sessions remaining in this package');
      return;
    }

    setSelectedPackage(pkg);
    setModalMode('book');
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
        if (handleSessionError(data.error)) return;
        toast.error(data.error || 'Failed to reschedule');
        setIsRescheduling(false);
        return;
      }

      refreshSessionExpiry();
      console.log('✅ Rescheduled successfully:', data);
      toast.success('Session rescheduled successfully!');
      
      // Reload packages
      await loadPackages();
      
      // Close modal
      setShowRescheduleModal(false);
      setSelectedPackage(null);
      setIsRescheduling(false);

    } catch (error) {
      console.error('Error rescheduling:', error);
      toast.error('An error occurred. Please try again.');
      setIsRescheduling(false);
    }
  };

  const handleBookSubmit = async (dateKey: string, timeSlot: string) => {
    if (!selectedPackage) return;

    // Check remaining sessions before submitting
    if (selectedPackage.remainingSessions <= 0) {
      toast.error(t.noSessionsRemaining || 'No sessions remaining');
      return;
    }

    setIsRescheduling(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages/${selectedPackage.id}/book-session`,
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
        if (handleSessionError(data.error)) return;
        toast.error(data.error || 'Failed to book session');
        setIsRescheduling(false);
        return;
      }

      refreshSessionExpiry();
      console.log('✅ Session booked successfully:', data);
      toast.success(t.sessionBookedSuccess || 'Session booked successfully!');

      // Reload packages
      await loadPackages();

      // Close modal
      setShowRescheduleModal(false);
      setSelectedPackage(null);
      setIsRescheduling(false);

    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('An error occurred. Please try again.');
      setIsRescheduling(false);
    }
  };

  const handleModalSubmit = (dateKey: string, timeSlot: string) => {
    if (modalMode === 'book') {
      handleBookSubmit(dateKey, timeSlot);
    } else {
      handleRescheduleSubmit(dateKey, timeSlot);
    }
  };

  // Handle inline slot click - expand calendar for booking
  const handleSlotClick = async (pkg: PackageDetails, slotIndex: number) => {
    // If already expanded for this package and same slot, close it
    if (inlineBookingPackageId === pkg.id && selectedSlotIndex === slotIndex) {
      setInlineBookingPackageId(null);
      setSelectedSlotIndex(null);
      return;
    }

    // Check if no remaining sessions and slot is not booked
    const bookedSession = pkg.bookedSessions?.find((s) => s.slotIndex === slotIndex);
    if (pkg.remainingSessions <= 0 && !bookedSession) {
      toast.error(t.noSessionsRemaining || 'No sessions remaining');
      return;
    }

    setSelectedPackage(pkg);
    setSelectedSlotIndex(slotIndex);
    setInlineBookingPackageId(pkg.id);

    // Clear stale slots before loading fresh data
    setAvailableSlots([]);
    await loadAvailableSlots();
  };

  // Handle inline booking from calendar
  const handleInlineBook = async (pkg: PackageDetails, dateKey: string, timeSlot: string) => {
    if (!pkg || selectedSlotIndex === null) return;

    // Check remaining sessions before submitting
    if (pkg.remainingSessions <= 0) {
      toast.error(t.noSessionsRemaining || 'No sessions remaining');
      return;
    }

    setIsRescheduling(true);

    // Refresh availability to prevent booking a full slot
    const freshSlots = await loadAvailableSlots();
    const freshSlot = freshSlots
      .find(d => d.dateKey === dateKey)
      ?.timeSlots.find(s => s.time === timeSlot);
    if (!freshSlot || freshSlot.available <= 0) {
      toast.error(t.slotFull || 'This slot is no longer available');
      setIsRescheduling(false);
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages/${pkg.id}/book-session`,
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
            slotIndex: selectedSlotIndex,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (handleSessionError(data.error)) return;
        toast.error(data.error || 'Failed to book session');
        setIsRescheduling(false);
        return;
      }

      refreshSessionExpiry();
      console.log('✅ Session booked via inline calendar:', data);
      toast.success(t.sessionBookedSuccess || 'Session booked successfully!');

      // Reload packages and use fresh data for auto-advance
      const freshPackages = await loadPackages();
      const freshPkg = freshPackages.find(p => p.id === pkg.id) || pkg;

      // Auto-advance to next empty slot using fresh data
      const nextEmptySlot = findNextEmptySlot(freshPkg, selectedSlotIndex);
      if (nextEmptySlot !== null && nextEmptySlot < freshPkg.totalSessions) {
        setSelectedSlotIndex(nextEmptySlot);
      } else {
        // Close inline calendar if all slots are filled
        setInlineBookingPackageId(null);
        setSelectedSlotIndex(null);
      }

      setIsRescheduling(false);

    } catch (error) {
      console.error('Error booking session:', error);
      toast.error('An error occurred. Please try again.');
      setIsRescheduling(false);
    }
  };

  // Find next empty slot in a package
  const findNextEmptySlot = (pkg: PackageDetails, currentSlot: number): number | null => {
    const bookedSlotIndices = pkg.bookedSessions?.map(s => s.slotIndex) || [];
    for (let i = currentSlot + 1; i < pkg.totalSessions; i++) {
      if (!bookedSlotIndices.includes(i)) {
        return i;
      }
    }
    return null;
  };

  // Get booked session for a specific slot index
  const getBookedSessionForSlot = (pkg: PackageDetails, slotIndex: number): BookedSession | undefined => {
    return pkg.bookedSessions?.find(s => s.slotIndex === slotIndex);
  };

  // Check if a session can be cancelled
  // Rules: 24+ hours before → always cancellable
  //        Within 24 hours → only within 2-minute grace period after booking
  const canCancelSession = (bookedSession: BookedSession): boolean => {
    if (!bookedSession || bookedSession.attended) return false;

    // Use Skopje timezone for all time calculations (sessions are in Skopje time)
    const now = getSkopjeTime();
    const dateKey = bookedSession.dateKey;

    // Parse date from both formats: "YYYY-MM-DD" or "M-D"
    let year: number, month: number, day: number;
    if (dateKey.length > 5 && dateKey.includes('-')) {
      [year, month, day] = dateKey.split('-').map(Number);
    } else {
      [month, day] = dateKey.split('-').map(Number);
      year = now.getFullYear();
    }

    const [hours, minutes] = bookedSession.time.split(':').map(Number);
    const sessionDateTime = new Date(year, month - 1, day, hours, minutes);
    const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // 24+ hours before → can cancel
    if (hoursUntilSession >= 24) return true;

    // Within 24 hours → check grace period (2 minutes from booking)
    if (bookedSession.createdAt) {
      const createdAtUTC = new Date(bookedSession.createdAt);
      const createdAt = new Date(createdAtUTC.toLocaleString('en-US', { timeZone: 'Europe/Skopje' }));
      const minutesSinceBooking = (now.getTime() - createdAt.getTime()) / (1000 * 60);
      return minutesSinceBooking <= 2;
    }

    return false;
  };

  // Get remaining grace period seconds (for sessions within 24h)
  const getGracePeriodRemaining = (bookedSession: BookedSession): number => {
    if (!bookedSession || !bookedSession.createdAt) return 0;

    const now = getSkopjeTime();
    const createdAtUTC = new Date(bookedSession.createdAt);
    const createdAt = new Date(createdAtUTC.toLocaleString('en-US', { timeZone: 'Europe/Skopje' }));
    const gracePeriodMs = 2 * 60 * 1000; // 2 minutes
    const elapsedMs = now.getTime() - createdAt.getTime();
    const remainingMs = gracePeriodMs - elapsedMs;

    return Math.max(0, Math.ceil(remainingMs / 1000));
  };

  // Check if session is within 24 hours
  const isWithin24Hours = (bookedSession: BookedSession): boolean => {
    if (!bookedSession) return false;

    // Use Skopje timezone for all time calculations (sessions are in Skopje time)
    const now = getSkopjeTime();
    const dateKey = bookedSession.dateKey;

    let year: number, month: number, day: number;
    if (dateKey.length > 5 && dateKey.includes('-')) {
      [year, month, day] = dateKey.split('-').map(Number);
    } else {
      [month, day] = dateKey.split('-').map(Number);
      year = now.getFullYear();
    }

    const [hours, minutes] = bookedSession.time.split(':').map(Number);
    const sessionDateTime = new Date(year, month - 1, day, hours, minutes);
    const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntilSession < 24;
  };

  // Cancel a booked session
  const handleCancelSession = async (pkg: PackageDetails, bookedSession: BookedSession) => {
    // Confirm cancellation
    if (!window.confirm(t.confirmCancelSession || 'Are you sure you want to cancel this session?')) {
      return;
    }

    setIsRescheduling(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages/${pkg.id}/reservations/${bookedSession.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': activeSessionToken,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (handleSessionError(data.error)) return;
        toast.error(data.error || 'Failed to cancel session');
        setIsRescheduling(false);
        return;
      }

      refreshSessionExpiry();
      console.log('✅ Session cancelled:', data);
      toast.success(t.sessionCancelledSuccess || 'Session cancelled successfully!');

      // Reload packages and refresh slot availability so freed capacity is visible
      await loadPackages();
      await loadAvailableSlots();
      setIsRescheduling(false);

    } catch (error) {
      console.error('Error cancelling session:', error);
      toast.error('An error occurred. Please try again.');
      setIsRescheduling(false);
    }
  };

  // Buy new package eligibility: all active/pending packages must have remaining_sessions <= 1
  const isEligibleForNewPackage = packages.length > 0 && packages
    .filter(p => p.packageStatus === 'active' || p.packageStatus === 'pending')
    .every(p => p.remainingSessions <= 1);

  // New package options (same as PackageOverview)
  const newPackageOptions = [
    { type: 'package8' as const, sessions: 8, label: t.package8Sessions || '8 CLASSES', price: 3500, isRecommended: false },
    { type: 'package10' as const, sessions: 10, label: t.package10Sessions || '10 CLASSES', price: 4200, isRecommended: true },
    { type: 'package12' as const, sessions: 12, label: t.package12Sessions || '12 CLASSES', price: 4800, isRecommended: false },
  ];

  // Handle purchase of a new package
  const handlePurchasePackage = async (packageType: 'package8' | 'package10' | 'package12') => {
    setIsBuyingPackage(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/packages/purchase`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': activeSessionToken,
          },
          body: JSON.stringify({ packageType }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (handleSessionError(data.error)) return;
        toast.error(data.error || 'Failed to purchase package');
        setIsBuyingPackage(false);
        return;
      }

      refreshSessionExpiry();
      toast.success(t.packagePurchased || 'Package created! You can now book sessions.');
      // Refresh packages list — the new package will appear as a line item with unpaid status
      await loadPackages();
      setIsBuyingPackage(false);

    } catch (error) {
      console.error('Error purchasing package:', error);
      toast.error('An error occurred. Please try again.');
      setIsBuyingPackage(false);
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
        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="hover:bg-[#e8dfd8] rounded-lg p-2 transition-colors"
          title={t.logout}
        >
          <LogOut className="w-6 h-6 text-[#6b5949]" />
        </button>
        <h1 className="text-lg font-semibold text-[#3d2f28]">
          {t.myPackages || 'My Packages'}
        </h1>
        {/* Language Selector */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 bg-[#f5f2ef] rounded-full">
          <Globe className="w-3 h-3 text-[#6b5949] mr-0.5" />
          <button
            onClick={() => setLanguage('SQ')}
            className={`text-[10px] font-medium px-1 py-0.5 rounded transition-colors ${
              language === 'SQ' ? 'text-[#3d2f28] bg-white' : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            SQ
          </button>
          <button
            onClick={() => setLanguage('MK')}
            className={`text-[10px] font-medium px-1 py-0.5 rounded transition-colors ${
              language === 'MK' ? 'text-[#3d2f28] bg-white' : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            МК
          </button>
          <button
            onClick={() => setLanguage('EN')}
            className={`text-[10px] font-medium px-1 py-0.5 rounded transition-colors ${
              language === 'EN' ? 'text-[#3d2f28] bg-white' : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* User Info + Next Session Countdown */}
      <div className="bg-gradient-to-br from-[#9ca571] to-[#8a9463] rounded-2xl p-4 mb-6 text-white">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs opacity-90 mb-1">{t.loggedInAs || 'Logged in as'}</p>
            <p className="text-sm font-semibold">{userEmail}</p>
          </div>
          {countdown && (
            <div className="text-right">
              <p className="text-xs opacity-90 mb-1">{t.nextClass || 'Next class'}</p>
              <p className="text-lg font-bold">{countdown}</p>
            </div>
          )}
        </div>
        {lastUpdated && (
          <p className="text-xs opacity-70 mt-2">
            {t.lastUpdated || 'Last updated'}: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
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
          {(() => {
            const terminalStatuses = ['fully_used', 'expired', 'cancelled'];
            const activePackages = packages.filter(p => !terminalStatuses.includes(p.packageStatus));
            const archivedPackages = packages.filter(p => terminalStatuses.includes(p.packageStatus));
            return (
              <>
              {activePackages.map((pkg) => {
            // Calculate session details
            const baseSessionCount = pkg.packageType === 'package8' ? 8 : pkg.packageType === 'package10' ? 10 : pkg.packageType === 'package12' ? 12 : pkg.totalSessions;
            const bonusSessions = pkg.totalSessions > baseSessionCount ? pkg.totalSessions - baseSessionCount : 0;
            const bookedSlotIndices = pkg.bookedSessions?.map(s => s.slotIndex) || [];
            const isInlineCalendarOpen = inlineBookingPackageId === pkg.id;

            return (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e6e3]"
              >
                {/* Package Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-[#3d2f28] mb-1">
                      {getPackageDisplayName(pkg.packageType)}
                    </h3>
                    <p className="text-xs text-[#6b5949]">
                      <span className="font-semibold" style={{ color: '#7A8F3A' }}>{pkg.remainingSessions}</span> / {pkg.totalSessions} {t.sessionsRemaining || 'sessions remaining'}
                    </p>
                  </div>

                  {/* Payment Status Badge */}
                  <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                    pkg.packageStatus === 'active'
                      ? 'bg-green-100 text-green-700'
                      : pkg.packageStatus === 'fully_used'
                      ? 'bg-stone-100 text-stone-600'
                      : pkg.packageStatus === 'expired'
                      ? 'bg-red-50 text-red-600'
                      : pkg.packageStatus === 'cancelled'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {pkg.packageStatus === 'active' ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {t.paid || 'Paid'}
                      </>
                    ) : pkg.packageStatus === 'fully_used' ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {t.completed || 'Completed'}
                      </>
                    ) : pkg.packageStatus === 'expired' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t.expired || 'Expired'}
                      </>
                    ) : pkg.packageStatus === 'cancelled' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t.cancelled || 'Cancelled'}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t.needsPayment || 'Needs Payment'}
                      </>
                    )}
                  </div>
                </div>

                {/* Unpaid Package Warning */}
                {pkg.paymentStatus !== 'paid' && pkg.packageStatus !== 'cancelled' && pkg.packageStatus !== 'expired' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                    <p className="text-xs text-amber-800 font-medium">
                      {t.packageUnpaid || 'Package not yet paid. Please visit the studio to complete payment.'}
                    </p>
                  </div>
                )}

                {/* Session Slots Row */}
                <div className="mb-4">
                  <p className="text-xs text-[#6b5949] mb-2">{t.yourSessions || 'Your sessions'}:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: pkg.totalSessions }).map((_, slotIndex) => {
                      const bookedSession = getBookedSessionForSlot(pkg, slotIndex);
                      const isBooked = !!bookedSession;
                      const isAttended = bookedSession?.attended === true;
                      const isSelected = selectedSlotIndex === slotIndex && inlineBookingPackageId === pkg.id;
                      const isBonus = slotIndex >= baseSessionCount;

                      return (
                        <button
                          key={slotIndex}
                          onClick={() => !isAttended && handleSlotClick(pkg, slotIndex)}
                          disabled={(pkg.remainingSessions <= 0 && !isBooked) || isAttended}
                          className={`relative flex flex-col items-center justify-center min-w-[48px] h-[52px] rounded-lg text-xs font-medium transition-all ${
                            isAttended
                              ? 'bg-[#6b5949] text-white/90 cursor-default'
                              : isBooked
                                ? isSelected
                                  ? 'bg-[#7A8F3A] text-white ring-2 ring-offset-2 ring-[#7A8F3A]'
                                  : isBonus
                                    ? 'bg-[#D8A93B] text-white'
                                    : 'bg-[#7A8F3A] text-white'
                                : isSelected
                                  ? 'bg-white border-2 border-[#7A8F3A] text-[#7A8F3A]'
                                  : pkg.remainingSessions > 0
                                    ? 'bg-white border border-dashed border-[#9ca571] text-[#9ca571] hover:border-solid hover:bg-[#f5f3f0]'
                                    : 'bg-[#f5f3f0] border border-[#e8e6e3] text-[#8b7764] cursor-not-allowed'
                          }`}
                        >
                          {isBooked ? (
                            <>
                              <span className="text-[10px] font-bold">✓</span>
                              <span className="text-[9px] opacity-90 leading-tight">
                                {formatShortDate(bookedSession.dateKey)}
                              </span>
                              <span className="text-[9px] opacity-90 leading-tight">
                                {bookedSession.time}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-lg">+</span>
                              <span className="text-[9px]">{slotIndex + 1}</span>
                            </>
                          )}
                          {/* Bonus indicator */}
                          {isBonus && !isAttended && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#D8A93B] rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                              B
                            </span>
                          )}
                          {/* Friend booking indicator */}
                          {bookedSession?.isFriendBooking && (
                            <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <Users className="w-2.5 h-2.5 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Inline Booking Calendar (when a slot is selected) */}
                {isInlineCalendarOpen && selectedSlotIndex !== null && (
                  <div className="mb-4 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-[#6b5949]">
                        {getBookedSessionForSlot(pkg, selectedSlotIndex)
                          ? (t.rescheduleSession || 'Reschedule session')
                          : (t.selectDateAndTime || 'Select date & time')}
                        {' '}<span className="text-[#9ca571]">#{selectedSlotIndex + 1}</span>
                      </p>
                      <button
                        onClick={() => {
                          setInlineBookingPackageId(null);
                          setSelectedSlotIndex(null);
                        }}
                        className="text-[#8b7764] hover:text-[#6b5949] text-sm"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Cancel button for booked sessions */}
                    {(() => {
                      const selectedSession = getBookedSessionForSlot(pkg, selectedSlotIndex);
                      if (!selectedSession) return null;

                      if (canCancelSession(selectedSession)) {
                        const within24h = isWithin24Hours(selectedSession);
                        const graceSeconds = within24h ? getGracePeriodRemaining(selectedSession) : 0;

                        return (
                          <div className={`mb-3 p-3 bg-white rounded-lg border ${within24h ? 'border-orange-300' : 'border-red-200'}`}>
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-[#6b5949]">
                                <span className="font-medium">{t.currentBooking || 'Current booking'}:</span>{' '}
                                {formatShortDate(selectedSession.dateKey)} {t.at || 'at'} {selectedSession.time}
                                {within24h && graceSeconds > 0 && (
                                  <span className="ml-2 text-orange-600 font-semibold">
                                    ⏱️ {Math.floor(graceSeconds / 60)}:{String(graceSeconds % 60).padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleCancelSession(pkg, selectedSession)}
                                disabled={isRescheduling}
                                className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                                  within24h
                                    ? 'bg-orange-500 hover:bg-orange-600'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                              >
                                {isRescheduling ? '...' : (t.cancelSession || 'Cancel')}
                              </button>
                            </div>
                            {within24h && (
                              <p className="text-[10px] text-orange-600 mt-1">
                                {t.gracePeriodWarning || 'Grace period - cancel within 2 min of booking'}
                              </p>
                            )}
                          </div>
                        );
                      }

                      // Session exists but can't be cancelled — show explanation if within 24h
                      if (isWithin24Hours(selectedSession) && !selectedSession.attended) {
                        return (
                          <div className="mb-3 p-3 bg-white rounded-lg border border-[#e8e6e3]">
                            <div className="text-xs text-[#6b5949]">
                              <span className="font-medium">{t.currentBooking || 'Current booking'}:</span>{' '}
                              {formatShortDate(selectedSession.dateKey)} {t.at || 'at'} {selectedSession.time}
                            </div>
                            <p className="text-[10px] text-[#8b7764] mt-1">
                              {t.cannotCancelWithin24h || 'Cancellation is not available within 24 hours of class time.'}
                            </p>
                          </div>
                        );
                      }

                      return null;
                    })()}

                    {availableSlots.length === 0 ? (
                      <p className="text-xs text-[#6b5949] text-center py-4">
                        {t.noSlotsAvailable || 'No slots available'}
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {availableSlots.map((dateSlot) => (
                          <div key={dateSlot.dateKey} className="bg-white rounded-lg p-3">
                            <p className="text-xs font-semibold text-[#3d2f28] mb-2">
                              {dateSlot.displayDate}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {dateSlot.timeSlots.map((timeSlot) => (
                                <button
                                  key={timeSlot.time}
                                  onClick={() => handleInlineBook(pkg, dateSlot.dateKey, timeSlot.time)}
                                  disabled={timeSlot.available <= 0 || isRescheduling}
                                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                                    timeSlot.available > 0 && !isRescheduling
                                      ? 'bg-[#9ca571] text-white hover:bg-[#8a9463]'
                                      : 'bg-[#e8e6e3] text-[#8b7764] cursor-not-allowed'
                                  }`}
                                >
                                  <span className="font-semibold">{isRescheduling ? '...' : timeSlot.time}</span>
                                  {timeSlot.userBookings > 0 && (
                                    <span className="ml-1 text-[10px]">●{timeSlot.userBookings}</span>
                                  )}
                                  <span className={`block text-[10px] mt-0.5 ${timeSlot.available > 0 ? 'text-white/80' : 'text-[#8b7764]'}`}>
                                    {timeSlot.available <= 0
                                      ? (t.full || 'Full')
                                      : `${timeSlot.available} ${timeSlot.available === 1
                                          ? (t.spotFree || 'spot')
                                          : (t.spotsFree || 'spots')}`
                                    }
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b7764] mb-3">
                  <span className="flex items-center gap-1">
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#6b5949', display: 'inline-block' }} />
                    {t.attended || 'Attended'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#7A8F3A', display: 'inline-block' }} />
                    {t.booked || 'Booked'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', border: '1px dashed #9ca571', display: 'inline-block' }} />
                    {t.available || 'Available'}
                  </span>
                  {bonusSessions > 0 && (
                    <span className="flex items-center gap-1">
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#D8A93B', display: 'inline-block' }} />
                      {t.bonus || 'Bonus'}
                    </span>
                  )}
                </div>

                {/* Package status footer for non-activated packages */}
                {pkg.activationStatus !== 'activated' && (
                  <div className="pt-3 border-t border-[#e8e6e3]">
                    <p className="text-xs text-[#8b7764]">
                      {t.pendingPayment || 'Pending Payment'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

              {/* Archived Packages Section */}
              {archivedPackages.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowArchivedPackages(!showArchivedPackages)}
                    className="flex items-center gap-2 w-full py-2 text-sm text-[#8b7764] hover:text-[#6b5949] transition-colors"
                  >
                    {showArchivedPackages ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span className="font-medium">{t.archivedPackages || 'Archived Packages'} ({archivedPackages.length})</span>
                  </button>
                  {showArchivedPackages && (
                    <div className="space-y-3 mt-2 opacity-70">
                      {archivedPackages.map((pkg) => {
                        const baseSessionCount = pkg.packageType === 'package8' ? 8 : pkg.packageType === 'package10' ? 10 : pkg.packageType === 'package12' ? 12 : pkg.totalSessions;
                        const bonusSessions = pkg.totalSessions > baseSessionCount ? pkg.totalSessions - baseSessionCount : 0;

                        return (
                          <div
                            key={pkg.id}
                            className="bg-white/60 rounded-2xl p-5 shadow-sm border border-[#e8e6e3]"
                          >
                            {/* Package Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="text-base font-semibold text-[#3d2f28] mb-1">
                                  {getPackageDisplayName(pkg.packageType)}
                                </h3>
                                <p className="text-xs text-[#6b5949]">
                                  <span className="font-semibold">{pkg.remainingSessions}</span> / {pkg.totalSessions} {t.sessionsRemaining || 'sessions remaining'}
                                </p>
                              </div>

                              {/* Status Badge */}
                              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                                pkg.packageStatus === 'fully_used'
                                  ? 'bg-stone-100 text-stone-600'
                                  : pkg.packageStatus === 'expired'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {pkg.packageStatus === 'fully_used' ? (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {t.completed || 'Completed'}
                                  </>
                                ) : pkg.packageStatus === 'expired' ? (
                                  <>
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {t.expired || 'Expired'}
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {t.cancelled || 'Cancelled'}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Session Slots Row (read-only) */}
                            <div>
                              <p className="text-xs text-[#6b5949] mb-2">{t.yourSessions || 'Your sessions'}:</p>
                              <div className="flex flex-wrap gap-2">
                                {Array.from({ length: pkg.totalSessions }).map((_, slotIndex) => {
                                  const bookedSession = getBookedSessionForSlot(pkg, slotIndex);
                                  const isBooked = !!bookedSession;
                                  const isAttended = bookedSession?.attended === true;
                                  const isBonus = slotIndex >= baseSessionCount;

                                  return (
                                    <div
                                      key={slotIndex}
                                      className={`relative flex flex-col items-center justify-center min-w-[48px] h-[52px] rounded-lg text-xs font-medium ${
                                        isAttended
                                          ? 'bg-[#6b5949] text-white/90'
                                          : isBooked
                                            ? isBonus ? 'bg-[#D8A93B] text-white' : 'bg-[#7A8F3A] text-white'
                                            : 'bg-[#f5f3f0] border border-[#e8e6e3] text-[#8b7764]'
                                      }`}
                                    >
                                      {isBooked ? (
                                        <>
                                          <span className="text-[10px] font-bold">✓</span>
                                          <span className="text-[9px] opacity-90 leading-tight">
                                            {formatShortDate(bookedSession.dateKey)}
                                          </span>
                                          <span className="text-[9px] opacity-90 leading-tight">
                                            {bookedSession.time}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[9px]">{slotIndex + 1}</span>
                                      )}
                                      {isBonus && !isAttended && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#D8A93B] rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                                          B
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              </>
            );
          })()}

          {/* Buy New Package Section - Always visible */}
          {packages.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="w-4 h-4 text-[#6b5949]" />
                <h3 className="text-sm font-semibold text-[#3d2f28]">
                  {t.buyNewPackage || 'Buy New Package'}
                </h3>
              </div>
              <div className="space-y-3">
                {newPackageOptions.map((pkg) => (
                  <div
                    key={pkg.type}
                    className={`relative rounded-2xl transition-all overflow-hidden ${
                      isEligibleForNewPackage
                        ? pkg.isRecommended
                          ? 'bg-gradient-to-br from-white via-white to-[#f8f9f4] border-2 border-[#9ca571]/40 shadow-md'
                          : 'bg-white border border-[#e8e6e3] shadow-sm'
                        : 'bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {/* Locked overlay */}
                    {!isEligibleForNewPackage && (
                      <div className="absolute inset-0 bg-gray-200/30 z-10 flex items-center justify-center rounded-xl">
                        <div className="text-center px-4">
                          <Lock className="w-6 h-6 text-[#8b7764]/60 mx-auto mb-2" />
                          <p className="text-xs text-[#8b7764] font-medium leading-snug">
                            {t.packageLockedMessage || 'Available when you have 1 class remaining'}
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (!isEligibleForNewPackage || isBuyingPackage) return;
                        handlePurchasePackage(pkg.type);
                      }}
                      disabled={!isEligibleForNewPackage || isBuyingPackage}
                      className={`w-full p-4 text-left ${!isEligibleForNewPackage ? 'opacity-40' : ''}`}
                    >
                      {/* Recommended Badge */}
                      {pkg.isRecommended && (
                        <div className={`text-white text-[10px] px-3 py-1 rounded-full inline-block mb-3 font-semibold uppercase tracking-wider ${
                          isEligibleForNewPackage
                            ? 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] shadow-sm'
                            : 'bg-gray-400'
                        }`}>
                          {t.recommended || 'Recommended'}
                        </div>
                      )}

                      {/* Package name + price row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-lg font-bold text-[#3d2f28] tracking-tight">{pkg.label}</div>
                        <div className="text-right">
                          <span className="text-xl font-bold text-[#3d2f28]">{pkg.price}</span>
                          <span className="text-xs font-semibold text-[#6b5949] ml-1">DEN</span>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-[#8b7764] leading-relaxed mb-2">
                        {pkg.type === 'package8' && (t.package8Detail || '8 training packages in a group (twice a week). For 35 days.')}
                        {pkg.type === 'package10' && (t.package10Detail || '10 training packages in a group (twice a week). For 35 days.')}
                        {pkg.type === 'package12' && (t.package12Detail || '12 training packages in a group (three times a week). For 35 days.')}
                      </p>

                      {/* Details row */}
                      <div className="flex flex-wrap gap-3 text-[11px] text-[#6b5949]">
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 bg-[#9ca571] rounded-full"></span>
                          {t.classDuration || '50 min'}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 bg-[#9ca571] rounded-full"></span>
                          {t.validityPeriod || 'Valid 35 days'}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 bg-[#9ca571] rounded-full"></span>
                          {t.groupClass || 'Group class'}
                        </span>
                      </div>
                    </button>
                  </div>
                ))}

                {/* Pay at studio note */}
                {isEligibleForNewPackage && (
                  <p className="text-xs text-[#8b7764] text-center mt-2">
                    {t.payAtStudio || 'Payment is made at the studio'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Single Session Reservations (not linked to packages) */}
          {reservations.filter(r => {
            if (r.packageId) return false;
            if (r.reservationStatus === 'cancelled' || r.reservationStatus === 'no_show' || r.reservationStatus === 'attended') return false;
            // Filter out past sessions
            const parts = r.dateKey.split('-').map(Number);
            const [year, month, day] = parts.length === 3 ? parts : [getSkopjeTime().getFullYear(), ...parts];
            const [h, m] = r.timeSlot.split(':').map(Number);
            return new Date(year, month - 1, day, h, m + 50) > getSkopjeTime();
          }).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-[#3d2f28] mb-3">
                {t.yourNextClass || 'Your Next Class'}
              </h3>
              <div className="space-y-3">
                {reservations.filter(r => {
                  if (r.packageId) return false;
                  if (r.reservationStatus === 'cancelled' || r.reservationStatus === 'no_show' || r.reservationStatus === 'attended') return false;
                  const parts = r.dateKey.split('-').map(Number);
                  const [year, month, day] = parts.length === 3 ? parts : [getSkopjeTime().getFullYear(), ...parts];
                  const [h, m] = r.timeSlot.split(':').map(Number);
                  return new Date(year, month - 1, day, h, m + 50) > getSkopjeTime();
                }).map((res) => (
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {res.isFriendBooking && (
                        <div className="px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 bg-blue-100 text-blue-700">
                          <Users className="w-3.5 h-3.5" />
                          {t.friendInvited || 'Friend Invited'}
                        </div>
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


      {/* Reschedule/Book Modal */}
      {showRescheduleModal && selectedPackage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto pb-safe">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-[#e8e6e3] px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#3d2f28]">
                {modalMode === 'book'
                  ? (t.bookSession || 'Book Session')
                  : (t.rescheduleSession || 'Reschedule Session')}
              </h2>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="text-[#8b7764] hover:text-[#6b5949]"
              >
                ✕
              </button>
            </div>

            {/* Current Session Info - only show for reschedule */}
            {modalMode === 'reschedule' && selectedPackage.firstSession && (
              <div className="px-5 py-4 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6]">
                <p className="text-xs font-semibold text-[#6b5949] mb-2">
                  {t.currentSession || 'Current Session'}
                </p>
                <p className="text-sm text-[#3d2f28]">
                  {selectedPackage.firstSession?.date} at {selectedPackage.firstSession?.time}
                </p>
              </div>
            )}

            {/* Available Slots */}
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-[#6b5949] mb-4">
                {modalMode === 'book'
                  ? (t.selectDateTime || 'Select Date & Time')
                  : (t.selectNewDateTime || 'Select New Date & Time')}
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
                            onClick={() => handleModalSubmit(dateSlot.dateKey, timeSlot.time)}
                            disabled={timeSlot.available <= 0 || isRescheduling}
                            className={`py-3 px-3 rounded-lg text-sm font-medium transition-all ${
                              timeSlot.available > 0 && !isRescheduling
                                ? 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white hover:shadow-lg'
                                : 'bg-[#e8e6e3] text-[#8b7764] cursor-not-allowed'
                            }`}
                          >
                            <span className="font-semibold">{isRescheduling ? '...' : timeSlot.time}</span>
                            <span className={`block text-xs mt-1 ${timeSlot.available > 0 ? 'text-white/80' : 'text-[#8b7764]'}`}>
                              {timeSlot.available <= 0
                                ? (t.full || 'Full')
                                : `${timeSlot.available} ${timeSlot.available === 1
                                    ? (t.spotFree || 'vend i lirë')
                                    : (t.spotsFree || 'vende të lira')}`
                              }
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
