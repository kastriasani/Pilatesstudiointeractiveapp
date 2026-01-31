import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, User, ArrowLeft, Loader } from 'lucide-react';
import { Language, translations } from '../translations';
import { logo } from '../../assets/images';

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
  isPastOrTooSoon?: boolean;
};

// Helper function to get current date/time in Skopje timezone
const getSkopjeTime = (): Date => {
  const now = new Date();
  // Convert to Skopje timezone (Europe/Skopje)
  const skopjeTimeString = now.toLocaleString('en-US', { 
    timeZone: 'Europe/Skopje',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return new Date(skopjeTimeString);
};

// Helper function to get day name based on day of week
const getDayName = (dayOfWeek: number, language: Language): string => {
  const t = translations[language];
  const days = [t.monday, t.tuesday, t.wednesday, t.thursday, t.friday];
  return days[dayOfWeek]; // 0 = Monday, 1 = Tuesday, etc.
};

// Helper function to generate the next 2 weekdays starting from today
const generateWeekdayDates = (language: Language) => {
  const t = translations[language];
  const dates = [];

  // Start from today (using Skopje timezone)
  let currentDate = getSkopjeTime();
  currentDate.setHours(0, 0, 0, 0);

  let weekdaysFound = 0;
  const maxDaysToCheck = 14; // Check up to 14 days ahead to find 2 weekdays
  let daysChecked = 0;

  // Month names array for dynamic lookup
  const monthNames = [
    t.january, t.february, t.march, t.april, t.may, t.june,
    t.july, t.august, t.september, t.october, t.november, t.december
  ];

  while (weekdaysFound < 2 && daysChecked < maxDaysToCheck) {
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Only include weekdays (Monday to Friday)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const day = currentDate.getDate();
      const month = currentDate.getMonth();
      const monthName = monthNames[month] || t.january; // Fallback to January

      dates.push({
        day: getDayName(dayOfWeek - 1, language),
        date: `${day} ${monthName}`,
        key: `${month + 1}-${day}`,
        fullDate: new Date(currentDate),
      });

      weekdaysFound++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
    daysChecked++;
  }

  return dates;
};

export function BookingScreen({ trainingType, onBack, onSubmit, onInstructorClick, language }: BookingScreenProps) {
  const t = translations[language];
  const [currentTime, setCurrentTime] = useState<Date>(getSkopjeTime());
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  
  // Fetch all bookings on mount and refresh every 30 seconds
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/bookings`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setAllBookings(data.bookings || []);
        }
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setIsLoadingBookings(false);
      }
    };
    
    // Initial fetch
    fetchBookings();
    
    // Refresh every 30 seconds to show real-time availability
    const interval = setInterval(fetchBookings, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Update current time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getSkopjeTime());
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  const allTabs = generateWeekdayDates(language);
  
  // Filter out past days (only show current day and future days)
  const tabs = allTabs.filter(tab => {
    const tabDate = tab.fullDate;
    const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
    return tabDate >= today;
  });
  
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
  
  // Standard time slots for all days (matching admin panel)
  const standardTimeSlots = ['09:00', '10:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
  
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
    const selectedDateKey = tabs[dayIndex].key;
    const selectedDate = tabs[dayIndex].fullDate;
    const dayBookings = mockBookings[selectedDateKey] || {};
    
    // Filter out 09:00 time slot for January 29th
    const timeSlotsForThisDay = standardTimeSlots.filter(time => {
      if (selectedDateKey === '1-29' && time === '09:00') {
        return false; // Remove 09:00 on January 29th
      }
      return true;
    });
    
    return timeSlotsForThisDay.map(time => {
      const bookedCount = dayBookings[time] || 0;
      const availableSpots = 4 - bookedCount;
      
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

      {/* Navigation Tabs - 2 Large Date Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setSelectedTab(index)}
            className={`px-4 py-5 rounded-xl text-center transition-all border-2 ${
              selectedTab === index
                ? 'bg-gradient-to-br from-[#9ca571] to-[#8a9463] text-white border-[#9ca571] shadow-lg'
                : 'bg-white text-[#3d2f28] border-[#e8e6e3] hover:border-[#9ca571] hover:shadow-md'
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-1">
              {tab.day}
            </div>
            <div className="text-base font-bold">
              {tab.date}
            </div>
          </button>
        ))}
      </div>

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
      {!isLoadingBookings && <div className="space-y-3 mb-8">
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
                      dateKey: tabs[selectedTab].key,
                      instructor: 'Rina Krasniqi'
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
                  : t.bookNow}
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