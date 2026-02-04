import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, User, ArrowLeft, Loader } from 'lucide-react';
import { Language, translations } from '../translations';
import { logo } from '../../assets/images';
import {
  getSkopjeTime
} from '../../utils/dateUtils';

const rinaPhoto = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=600&fit=crop';

type BookingScreenProps = {
  trainingType?: 'single' | 'package' | 'individual';
  onBack: () => void;
  onSubmit: (bookingData: any) => void;
  onInstructorClick: (instructorName: string) => void;
  language: Language;
};

type TimeSlot = {
  time: string;
  status: 'available' | 'full';
  availableSpots?: number;
  maxCapacity?: number;
  isPastOrTooSoon?: boolean;
};

// Convert ISO date strings (YYYY-MM-DD) to localized tab format
const convertLiveDaysToTabs = (liveDays: string[], language: Language) => {
  const t = translations[language];
  const dayNames = [t.sunday || 'Sun', t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday || 'Sat'];
  const monthNames = [
    t.january, t.february, t.march, t.april, t.may, t.june,
    t.july, t.august, t.september, t.october, t.november, t.december
  ];

  return liveDays
    .map(isoDate => {
      const [year, month, day] = isoDate.split('-').map(Number);
      const fullDate = new Date(year, month - 1, day);
      const dayOfWeek = fullDate.getDay(); // 0=Sunday, 1=Monday, etc.

      return {
        day: dayNames[dayOfWeek] || '',
        date: `${fullDate.getDate()} ${monthNames[fullDate.getMonth()] || ''}`,
        key: `${month}-${day}`, // Legacy format for booking
        isoKey: isoDate, // ISO format for API
        fullDate,
      };
    })
    .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime()); // Sort by date
};

export function BookingScreen({ trainingType, onBack, onSubmit, onInstructorClick, language }: BookingScreenProps) {
  const t = translations[language];
  const [currentTime, setCurrentTime] = useState<Date>(getSkopjeTime());
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [liveDays, setLiveDays] = useState<string[]>([]);
  const [slotsPerDate, setSlotsPerDate] = useState<Record<string, { start_time: string; max_capacity: number }[]>>({});

  // Fetch all bookings, live days, and slots for each live day
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');

        // Fetch bookings and live days in parallel
        const [bookingsResponse, liveDaysResponse] = await Promise.all([
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/bookings`,
            { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
          ),
          fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/live-days`,
            { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
          )
        ]);

        if (bookingsResponse.ok) {
          const data = await bookingsResponse.json();
          setAllBookings(data.bookings || []);
        }

        if (liveDaysResponse.ok) {
          const data = await liveDaysResponse.json();
          const dates = data.dates || [];
          setLiveDays(dates);

          // Fetch slots for each live day
          const slotsPromises = dates.map((date: string) =>
            fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots?date=${date}`,
              { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
            ).then(res => res.json())
          );

          const slotsResults = await Promise.all(slotsPromises);
          const newSlotsPerDate: Record<string, any[]> = {};
          dates.forEach((date: string, index: number) => {
            newSlotsPerDate[date] = slotsResults[index]?.slots || [];
          });
          setSlotsPerDate(newSlotsPerDate);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoadingBookings(false);
      }
    };

    // Initial fetch
    fetchData();

    // Refresh every 30 seconds to show real-time availability
    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, []);
  
  // Update current time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getSkopjeTime());
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Convert live days from API directly to tabs (shows ALL live days, not just 2)
  const tabs = convertLiveDaysToTabs(liveDays, language);
  
  const [selectedTab, setSelectedTab] = useState(0);

  // Calculate bookings count per date and time slot from real data
  const calculateBookingsPerSlot = (): Record<string, Record<string, number>> => {
    const bookingsMap: Record<string, Record<string, number>> = {};
    
    allBookings.forEach(booking => {
      if (booking.status === 'confirmed' || booking.status === 'pending') {
        const dateKey = booking.dateKey;
        const timeSlot = booking.timeSlot;
        
        if (!bookingsMap[dateKey]) {
          bookingsMap[dateKey] = {};
        }
        
        if (!bookingsMap[dateKey][timeSlot]) {
          bookingsMap[dateKey][timeSlot] = 0;
        }
        
        bookingsMap[dateKey][timeSlot]++;
      }
    });
    
    return bookingsMap;
  };
  
  const mockBookings = calculateBookingsPerSlot();

  // Function to calculate end time (50 minutes later)
  const getEndTime = (startTime: string): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + 50;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  const getTimeSlotsForDay = (dayIndex: number): TimeSlot[] => {
    if (!tabs[dayIndex]) return [];

    const tab = tabs[dayIndex];
    const selectedDateKey = tab.key; // Legacy format for bookings lookup
    const isoDateKey = tab.isoKey; // ISO format for slots lookup
    const selectedDate = tab.fullDate;
    const dayBookings = mockBookings[selectedDateKey] || {};

    // Get slots for this date from API (fetched dynamically)
    const dateSlots = slotsPerDate[isoDateKey] || [];

    // If no slots configured for this date, return empty
    if (dateSlots.length === 0) {
      return [];
    }

    return dateSlots.map(slot => {
      const time = slot.start_time;
      const maxCapacity = slot.max_capacity || 4;
      const bookedCount = dayBookings[time] || 0;
      const availableSpots = maxCapacity - bookedCount;

      // Check if this time slot is in the past or within 5 minutes
      const [hours, minutes] = time.split(':').map(Number);
      const slotDateTime = new Date(selectedDate);
      slotDateTime.setHours(hours, minutes, 0, 0);

      // Calculate time difference in minutes
      const timeDiffMinutes = (slotDateTime.getTime() - currentTime.getTime()) / (1000 * 60);
      const isPastOrTooSoon = timeDiffMinutes < 5;
      
      return {
        time,
        status: availableSpots === 0 || isPastOrTooSoon ? 'full' : 'available',
        availableSpots: availableSpots > 0 && !isPastOrTooSoon ? availableSpots : undefined,
        maxCapacity,
        isPastOrTooSoon, // Flag to distinguish between fully booked and time-blocked
      };
    });
  };

  const timeSlotsPerDay: Record<number, TimeSlot[]> = {};
  tabs.forEach((_, index) => {
    timeSlotsPerDay[index] = getTimeSlotsForDay(index);
  });

  const currentTimeSlots = timeSlotsPerDay[selectedTab] || [];

  const getSlotButtonStyle = (status: string) => {
    if (status === 'full') {
      return 'bg-[#d4c4ba] text-white';
    }
    if (status === 'limited') {
      return 'bg-[#a89677] text-white hover:bg-[#978662]';
    }
    return 'bg-[#b5a582] text-white hover:bg-[#a39470]';
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 pt-12">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="hover:bg-[#f5f0ed] rounded-lg p-1 transition-colors mr-2"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
        <h1 className="text-base text-[#3d2f28]">{t.singleSessionBooking}</h1>
      </div>

      {/* Instructor Card - Hidden for now, keeping for later */}
      {/* <div className="bg-white rounded-xl p-3.5 mb-4 shadow-sm">
        <div className="flex items-start gap-3">
          <img
            src={rinaPhoto}
            alt="Rina"
            className="w-20 h-20 rounded-xl object-cover"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-base text-[#3d2f28] mb-0.5">Rina</h2>
                <p className="text-[11px] text-[#6b5949]">{t.instructorTitle}</p>
              </div>
              <button 
                onClick={() => onInstructorClick('Rina Krasniqi')}
                className="hover:bg-[#f5f0ed] rounded-lg p-1 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-[#6b5949]" />
              </button>
            </div>
            <p className="text-[10px] text-[#8b7764] leading-snug italic">{t.instructorWelcome}</p>
          </div>
        </div>
      </div> */}

      {/* Navigation Tabs - Horizontal scrollable date list */}
      {!isLoadingBookings && tabs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl mb-6">
          <div className="text-sm text-[#8b7764] mb-2">
            {t.noAvailableDates || 'No available dates at the moment'}
          </div>
          <div className="text-xs text-[#a89677]">
            {t.checkBackLater || 'Please check back later'}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 snap-x snap-mandatory scrollbar-hide">
          {tabs.map((tab, index) => (
            <button
              key={tab.isoKey}
              onClick={() => setSelectedTab(index)}
              className={`flex-shrink-0 min-w-[80px] px-4 py-4 rounded-xl text-center transition-all border-2 snap-center ${
                selectedTab === index
                  ? 'bg-gradient-to-br from-[#9ca571] to-[#8a9463] text-white border-[#9ca571] shadow-lg'
                  : 'bg-white text-[#3d2f28] border-[#e8e6e3] hover:border-[#9ca571] hover:shadow-md'
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80 mb-1">
                {tab.day}
              </div>
              <div className="text-sm font-bold">
                {tab.date}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoadingBookings && (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 text-[#9ca571] animate-spin mx-auto mb-3" />
          <div className="text-sm text-[#8b7764]">
            {t.loadingAvailability}
          </div>
        </div>
      )}

      {/* Time Slots */}
      {!isLoadingBookings && tabs.length > 0 && <div className="space-y-3 mb-8">
        {currentTimeSlots.map((slot) => {
          const isDisabled = slot.status === 'full' || slot.isPastOrTooSoon;
          const isPastTime = slot.isPastOrTooSoon && (slot.availableSpots === undefined || slot.availableSpots > 0);
          
          return (
            <div
              key={slot.time}
              className={`rounded-lg px-5 py-4 flex items-center justify-between shadow-sm transition-all ${
                isPastTime ? 'bg-gray-200 opacity-60' : 'bg-white'
              }`}
            >
              <span className={`text-base font-medium ${
                isPastTime ? 'text-gray-500' : 'text-[#3d2f28]'
              }`}>
                {slot.time} - {getEndTime(slot.time)}
              </span>
              <button
                onClick={() => {
                  if (!isDisabled) {
                    onSubmit({
                      timeSlot: slot.time,
                      date: tabs[selectedTab].date,
                      dateKey: tabs[selectedTab].key
                    });
                  }
                }}
                disabled={isDisabled}
                className={`px-5 py-2.5 rounded-md text-xs transition-colors ${
                  isPastTime
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : slot.status === 'full'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#9ca571] text-white hover:bg-[#8a9463]'
                }`}
              >
                {isPastTime
                  ? t.timePassed || 'Kaluar'
                  : slot.status === 'full'
                  ? t.noSpots
                  : (
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-sm font-semibold">{slot.availableSpots} / 4</span>
                      <span className="text-[10px]">{t.bookYourClass || 'Book'}</span>
                    </div>
                  )}
              </button>
            </div>
          );
        })}
      </div>}

      {/* Logo */}
      <div className="text-center mt-8 pb-6">
        <img src={logo} alt="Logo" className="w-14 h-14 mx-auto mb-3" />
        <p className="text-xs text-[#8b7764]">{t.location}</p>
        <p className="text-xs text-[#8b7764] mt-1">{t.copyright}</p>
      </div>
    </div>
  );
}