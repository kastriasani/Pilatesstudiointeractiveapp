import { useState, useEffect, useRef } from 'react';
import { Calendar, Users, LogOut, Mail, X, CheckCircle, Trash2, Ban, Gift, ShieldAlert, Settings, UserPlus, Send } from 'lucide-react';
import { logo } from '../../assets/images';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { DevTools } from './DevTools';
// BulkWaitlistUpload removed - dev functionality not for production
// import { BulkWaitlistUpload } from './BulkWaitlistUpload';

export type UserStatus = 'pending' | 'confirmed' | 'cancelled';

export type User = {
  id: string;
  name: string;
  surname: string;
  mobile: string;
  email: string;
  status: UserStatus;
  packageType?: 'package8' | 'package10' | 'package12' | 'single';
  bookingDate?: string;
  bookingTime?: string;
  totalSessions?: number; // Total sessions purchased across all packages
  usedSessions?: number; // Sessions used
  remainingSessions?: number; // Sessions remaining
  packages?: Array<{ // Track all packages purchased
    type: 'package8' | 'package10' | 'package12';
    sessions: number;
    purchasedDate: string;
    activatedDate?: string;
  }>;
  codeSentAt?: string; // When the activation code was sent
  activationCode?: string; // The unique activation code (e.g., "WN-XXXX-XXXX")
};

export type Booking = {
  id: string;
  name: string;
  surname: string;
  mobile: string;
  email: string;
  date: string;
  dateKey: string;
  timeSlot: string;
  instructor: string;
  selectedPackage?: 'package8' | 'package10' | 'package12';
  payInStudio: boolean;
  language: string;
  status: UserStatus;
  createdAt: string;
};

type TimeSlot = {
  time: string;
  maxCapacity: number;
};

type AdminPanelProps = {
  onLogout: () => void;
};

// Mock data for demonstration
const mockUsers: User[] = [];

const mockBookings: Booking[] = [];

type WaitlistUser = {
  id: string;
  name: string;
  surname: string;
  mobile: string;
  email: string;
  redemptionCode: string;
  status: 'pending' | 'invited' | 'redeemed';
  addedAt: string;
  invitedAt?: string;
  redeemedAt?: string;
  inviteEmailSent: boolean;
};

export function AdminPanel({ onLogout }: AdminPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'users' | 'waitlist'>('calendar');
  const [userSubTab, setUserSubTab] = useState<'confirmed' | 'pending'>('confirmed');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedActivationCode, setSelectedActivationCode] = useState<'PILATES8' | 'PILATES12' | 'WELLNEST2025'>('WELLNEST2025');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftSessions, setGiftSessions] = useState(1);
  const [giftNote, setGiftNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  
  // Waitlist state
  const [waitlistUsers, setWaitlistUsers] = useState<WaitlistUser[]>([]);
  const [selectedWaitlistUsers, setSelectedWaitlistUsers] = useState<string[]>([]);
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Fetch all bookings on component mount
  useEffect(() => {
    fetchBookings();
    if (activeTab === 'waitlist') {
      fetchWaitlistUsers();
    }
  }, [activeTab]);

  // Scroll to top whenever tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab, userSubTab]);

  const fetchBookings = async () => {
    try {
      setIsLoading(true);
      
      // Fetch bookings for calendar view
      const bookingsResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/bookings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      const bookingsData = await bookingsResponse.json();

      if (!bookingsResponse.ok) {
        console.error('Failed to fetch bookings:', bookingsData);
      } else {
        console.log('Fetched bookings:', bookingsData.bookings);
        setBookings(bookingsData.bookings || []);
      }

      // Fetch users with aggregated data for Users tab
      const usersResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      const usersData = await usersResponse.json();

      if (!usersResponse.ok) {
        console.error('Failed to fetch users:', usersData);
        return;
      }

      console.log('Fetched users:', usersData);

      // Convert to AdminPanel User format
      const formattedUsers: User[] = usersData.users.map((user: any) => {
        const status = user.paymentStatus === 'paid' ? 'confirmed' : 'pending';
        console.log(`User ${user.email}: paymentStatus=${user.paymentStatus}, mapped status=${status}`);
        return {
          id: user.id,
          name: user.name,
          surname: user.surname,
          mobile: user.mobile,
          email: user.email,
          status, // Map payment status to display status
          packageType: user.packages[0]?.type || 'single',
          totalSessions: user.totalSessions,
          usedSessions: user.usedSessions,
          remainingSessions: user.remainingSessions,
          packages: user.packages,
        };
      });

      console.log('Formatted users:', formattedUsers);
      console.log('Pending users:', formattedUsers.filter(u => u.status === 'pending'));
      console.log('Confirmed users:', formattedUsers.filter(u => u.status === 'confirmed'));

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWaitlistUsers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/waitlist`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to fetch waitlist:', data);
        return;
      }

      console.log('Fetched waitlist users:', data.users);
      setWaitlistUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching waitlist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvites = async (emails: string[], bulk = false) => {
    try {
      setIsSendingInvites(true);
      setInviteStatus(null);

      console.log('📧 Attempting to send invites to:', emails);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/waitlist/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ emails, bulk }),
      });

      const data = await response.json();
      console.log('📧 Email sending response:', data);

      if (!response.ok) {
        console.error('❌ Failed to send invites:', data);
        setInviteStatus({ type: 'error', message: data.error || 'Failed to send invites' });
        return;
      }

      const { summary, results } = data;
      
      // Log individual results
      results.forEach((result: any) => {
        if (result.success) {
          console.log(`✅ Email sent successfully to ${result.email}`);
        } else {
          console.error(`❌ Failed to send email to ${result.email}:`, result.error);
        }
      });

      if (summary.failed > 0) {
        const failedEmails = results.filter((r: any) => !r.success).map((r: any) => r.email).join(', ');
        setInviteStatus({ 
          type: 'error', 
          message: `Failed to send ${summary.failed} invite(s) to: ${failedEmails}. Check console for details.` 
        });
      } else {
        setInviteStatus({ 
          type: 'success', 
          message: `✅ Sent ${summary.successful} invite${summary.successful > 1 ? 's' : ''} successfully!` 
        });
      }

      // Refresh waitlist
      fetchWaitlistUsers();
      
      // Clear selection
      setSelectedWaitlistUsers([]);

      // Auto-dismiss after 7 seconds
      setTimeout(() => setInviteStatus(null), 7000);
    } catch (error) {
      console.error('❌ Error sending invites:', error);
      setInviteStatus({ type: 'error', message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsSendingInvites(false);
    }
  };

  const handleDeleteWaitlistUser = async (email: string) => {
    if (!confirm(`Remove ${email} from waitlist?`)) return;

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/waitlist/${email}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      if (response.ok) {
        fetchWaitlistUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting waitlist user:', error);
      alert('An error occurred');
    }
  };

  const handleAddBesaToWaitlist = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/waitlist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Besa',
          surname: 'Ibrahimi',
          mobile: '70810726',
          email: 'asani.kastri@gmail.com'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`✅ Successfully added Besa Ibrahimi!\nRedemption Code: ${data.waitlistUser.redemptionCode}`);
        fetchWaitlistUsers();
      } else {
        alert(data.error || 'Failed to add user to waitlist');
      }
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      alert('An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate dynamic dates (January 23 - February 28, 2026, weekdays only)
  const generateAdminDates = () => {
    const dates = [];
    const startDate = new Date(2026, 0, 23); // January 23, 2026
    const endDate = new Date(2026, 1, 28); // February 28, 2026
    
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Only include weekdays (Monday to Friday)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const day = currentDate.getDate();
        const month = currentDate.getMonth(); // 0 = January, 1 = February
        const monthName = month === 0 ? 'Jan' : 'Feb';
        
        dates.push({
          displayDate: `${day}. ${monthName}`,
          dateKey: `${month + 1}-${day}`, // Format: "1-23", "2-3", etc.
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  const dates = generateAdminDates();

  const timeSlots: TimeSlot[] = [
    { time: '09:00 - 10:00', maxCapacity: 4 },
    { time: '10:00 - 11:00', maxCapacity: 4 },
    { time: '16:00 - 17:00', maxCapacity: 4 },
    { time: '17:00 - 18:00', maxCapacity: 4 },
    { time: '18:00 - 19:00', maxCapacity: 4 },
    { time: '19:00 - 20:00', maxCapacity: 4 },
    { time: '20:00 - 21:00', maxCapacity: 4 },
  ];

  const maxDailyCapacity = timeSlots.length * 4; // 7 slots × 4 capacity = 28 max bookings per day

  const getBookingsForDate = (dateKey: string) => {
    return bookings.filter(booking => booking.dateKey === dateKey);
  };

  const getBookingsForTimeSlot = (dateKey: string, timeSlot: string) => {
    return bookings.filter(booking => booking.dateKey === dateKey && booking.timeSlot === timeSlot);
  };

  const getTimeSlotCapacity = (dateKey: string, timeSlot: string) => {
    const bookings = getBookingsForTimeSlot(dateKey, timeSlot);
    return bookings.length;
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: UserStatus) => {
    switch (status) {
      case 'confirmed':
        return 'Payed';
      case 'pending':
        return 'Pending';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const handleStatusChange = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // Toggle between 'pending' (unpaid) and 'confirmed' (paid)
    const newStatus: UserStatus = user.status === 'pending' ? 'confirmed' : 'pending';
    const paymentStatus = newStatus === 'confirmed' ? 'paid' : 'unpaid';

    // Optimistic UI update
    setUsers(prevUsers =>
      prevUsers.map(u => u.id === userId ? { ...u, status: newStatus } : u)
    );

    // Update payment status in backend
    updatePaymentStatus(user.email, paymentStatus);
  };

  const updatePaymentStatus = async (email: string, paymentStatus: 'paid' | 'unpaid') => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/users/${encodeURIComponent(email)}/payment`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ paymentStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to update payment status:', data);
        // Revert the change if backend update fails
        fetchBookings();
        return;
      }

      console.log('Payment status updated successfully:', data);
      
      // Also update in bookings array
      setBookings(prevBookings =>
        prevBookings.map(booking =>
          booking.id === bookingId ? { ...booking, status: newStatus } : booking
        )
      );
    } catch (error) {
      console.error('Error updating booking status:', error);
      // Revert the change if network error
      fetchBookings();
    }
  };

  const handleSendCode = async (user: User) => {
    // Resend activation code to user
    setIsSendingEmail(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/resend-activation-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          email: user.email,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to resend activation code:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          alert(errorData.error || 'Failed to resend activation code. Please try again.');
        } catch {
          alert('Failed to resend activation code. The user may not have any active codes.');
        }
        
        setIsSendingEmail(false);
        return;
      }

      const data = await response.json();
      console.log('Activation code resent successfully:', data);

      alert(`Activation code resent to ${user.email}`);
      setIsSendingEmail(false);
    } catch (error) {
      console.error('Error resending activation code:', error);
      alert('Network error. Please check your connection.');
      setIsSendingEmail(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete user ${user.name} ${user.surname}? This will delete all their bookings and cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/users/${encodeURIComponent(user.email)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to delete user:', data);
        alert(`Failed to delete user: ${data.error || 'Unknown error'}`);
        return;
      }

      console.log('User deleted successfully:', data);
      
      // Refresh the bookings list to reflect the deletion
      await fetchBookings();
      
      // Close the expanded view if this was the expanded user
      if (expandedUserId === user.id) {
        setExpandedUserId(null);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Network error. Please check your connection.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#f5f0ed]">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-8 h-8" />
          <div>
            <h1 className="text-base text-[#3d2f28]">Admin Panel</h1>
            <p className="text-xs text-[#8b7764]">Wellnest Pilates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDevTools(true)}
            className="p-2 hover:bg-[#f5f0ed] rounded-lg transition-colors"
            title="Developer Tools"
          >
            <Settings className="w-5 h-5 text-[#6b5949]" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-[#f5f0ed] rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 text-[#6b5949]" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[#e8dfd8] px-4">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
              activeTab === 'calendar'
                ? 'text-[#6b5949] border-b-2 border-[#6b5949]'
                : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
              activeTab === 'users'
                ? 'text-[#6b5949] border-b-2 border-[#6b5949]'
                : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab('waitlist')}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
              activeTab === 'waitlist'
                ? 'text-[#6b5949] border-b-2 border-[#6b5949]'
                : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Waitlist
            {waitlistUsers.filter(u => u.status === 'pending').length > 0 && (
              <span className="bg-[#9ca571] text-white text-xs px-2 py-0.5 rounded-full">
                {waitlistUsers.filter(u => u.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        {activeTab === 'calendar' ? (
          <div className="space-y-4">
            {/* Date Selection */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h2 className="text-sm text-[#3d2f28] mb-3">Select Date</h2>
              <div className="grid grid-cols-7 gap-2">
                {dates.map((date) => {
                  const bookingsCount = getBookingsForDate(date.dateKey).length;
                  const percentage = Math.round((bookingsCount / maxDailyCapacity) * 100);
                  
                  // Determine water color based on percentage (GREEN = full/good, RED = empty/bad)
                  let waterColor = '#ef4444'; // red for empty
                  let borderColor = '#dc2626';
                  let textColorClass = 'text-[#dc2626]';
                  
                  if (percentage === 100) {
                    waterColor = '#10b981'; // green for full
                    borderColor = '#059669';
                    textColorClass = 'text-[#059669]';
                  } else if (percentage >= 75) {
                    waterColor = '#84cc16'; // lime for 75%+
                    borderColor = '#65a30d';
                    textColorClass = 'text-[#65a30d]';
                  } else if (percentage >= 50) {
                    waterColor = '#fbbf24'; // yellow for 50%+
                    borderColor = '#ca8a04';
                    textColorClass = 'text-[#ca8a04]';
                  } else if (percentage >= 25) {
                    waterColor = '#f59e0b'; // orange for 25%+
                    borderColor = '#d97706';
                    textColorClass = 'text-[#d97706]';
                  } else if (percentage > 0) {
                    waterColor = '#ef4444'; // red for less than 25%
                    borderColor = '#dc2626';
                    textColorClass = 'text-[#dc2626]';
                  } else {
                    waterColor = '#e5e7eb'; // gray for 0%
                    borderColor = '#e8dfd8';
                    textColorClass = 'text-[#8b7764]';
                  }
                  
                  const isSelected = selectedDate === date.dateKey;
                  
                  return (
                    <button
                      key={date.dateKey}
                      onClick={() => setSelectedDate(date.dateKey)}
                      className="relative overflow-hidden rounded-lg h-14 transition-all hover:shadow-md"
                      style={{
                        border: `2px solid ${isSelected ? '#6b5949' : borderColor}`,
                        backgroundColor: isSelected ? '#6b5949' : 'white'
                      }}
                    >
                      {/* Water fill effect */}
                      {!isSelected && (
                        <div
                          className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out"
                          style={{
                            height: `${percentage}%`,
                            backgroundColor: waterColor,
                            opacity: 0.3,
                          }}
                        />
                      )}
                      
                      {/* Wave effect */}
                      {!isSelected && percentage > 0 && percentage < 100 && (
                        <div
                          className="absolute left-0 right-0 transition-all duration-500 ease-out"
                          style={{
                            bottom: `${percentage}%`,
                            height: '2px',
                            backgroundColor: waterColor,
                            opacity: 0.5,
                          }}
                        />
                      )}
                      
                      {/* Content */}
                      <div className={`relative z-10 flex flex-col items-center justify-center h-full ${isSelected ? 'text-white' : ''}`}>
                        <div className={`text-xs ${isSelected ? '' : 'text-[#3d2f28]'}`}>{date.displayDate}</div>
                        <div className={`text-[10px] mt-1 font-bold ${isSelected ? '' : textColorClass}`}>
                          {percentage}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Date Time Slots */}
            {selectedDate && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm text-[#3d2f28] mb-3">
                  Time Slots for {dates.find(date => date.dateKey === selectedDate)?.displayDate}
                </h2>
                <div className="space-y-2">
                  {timeSlots.map((timeSlot) => {
                    const bookingsCount = getTimeSlotCapacity(selectedDate, timeSlot.time);
                    const isSelected = selectedTimeSlot === timeSlot.time;
                    const fillPercentage = (bookingsCount / timeSlot.maxCapacity) * 100;
                    
                    // Determine water color based on exact bookings count
                    let waterColor = '#8b0000'; // dark red for 0/4
                    let textColor = '#8b0000';
                    
                    if (bookingsCount === 4) {
                      waterColor = '#10b981'; // green for 4/4
                      textColor = '#059669';
                    } else if (bookingsCount === 3) {
                      waterColor = '#fbbf24'; // yellow for 3/4
                      textColor = '#ca8a04';
                    } else if (bookingsCount === 2) {
                      waterColor = '#f59e0b'; // orange for 2/4
                      textColor = '#d97706';
                    } else if (bookingsCount === 1) {
                      waterColor = '#ef4444'; // red for 1/4
                      textColor = '#dc2626';
                    }
                    
                    return (
                      <div key={timeSlot.time}>
                        <button
                          onClick={() => setSelectedTimeSlot(isSelected ? null : timeSlot.time)}
                          className="w-full relative overflow-hidden rounded-xl border-2 transition-all hover:shadow-md"
                          style={{ 
                            height: '80px',
                            borderColor: fillPercentage > 0 ? waterColor : '#e8dfd8'
                          }}
                        >
                          {/* Water fill effect */}
                          <div
                            className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
                            style={{
                              height: `${fillPercentage}%`,
                              backgroundColor: waterColor,
                              opacity: 0.25,
                            }}
                          />
                          
                          {/* Wave effect at the top of water */}
                          {fillPercentage > 0 && fillPercentage < 100 && (
                            <div
                              className="absolute left-0 right-0 transition-all duration-700 ease-out"
                              style={{
                                bottom: `${fillPercentage}%`,
                                height: '4px',
                                backgroundColor: waterColor,
                                opacity: 0.4,
                                boxShadow: `0 -2px 4px ${waterColor}40`,
                              }}
                            />
                          )}
                          
                          {/* Content */}
                          <div className="relative z-10 h-full flex items-center justify-between px-4">
                            <div className="text-left">
                              <p className="text-base font-medium" style={{ color: textColor }}>
                                {timeSlot.time}
                              </p>
                              <p className="text-xs text-[#8b7764] mt-1">
                                {bookingsCount === 0 
                                  ? 'Available' 
                                  : bookingsCount === timeSlot.maxCapacity
                                  ? 'Fully Booked'
                                  : `${bookingsCount} booked`}
                              </p>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-3xl font-bold" style={{ color: textColor }}>
                                {bookingsCount}
                              </span>
                              <span className="text-sm text-[#8b7764]">/ {timeSlot.maxCapacity}</span>
                            </div>
                          </div>
                        </button>

                        {/* Show bookings when slot is selected */}
                        {isSelected && bookingsCount > 0 && (
                          <div className="mt-2 ml-4 space-y-2">
                            {getBookingsForTimeSlot(selectedDate, timeSlot.time).map((booking) => (
                              <div
                                key={booking.id}
                                className="flex items-center justify-between p-3 bg-white border-2 border-[#e8dfd8] rounded-xl shadow-sm"
                              >
                                <div>
                                  <p className="text-sm text-[#3d2f28] font-medium">{booking.name} {booking.surname}</p>
                                  <p className="text-xs text-[#8b7764] mt-0.5">
                                    {booking.selectedPackage === 'package8'
                                      ? '8 Sessions Package'
                                      : booking.selectedPackage === 'package10'
                                      ? '10 Sessions Package'
                                      : booking.selectedPackage === 'package12'
                                      ? '12 Sessions Package'
                                      : 'Single Session'}
                                  </p>
                                </div>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs ${getStatusColor(
                                    booking.status
                                  )}`}
                                >
                                  {getStatusText(booking.status)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {getBookingsForDate(selectedDate).length === 0 && (
                    <p className="text-sm text-[#8b7764] text-center py-4">
                      No bookings for this date
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'users' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-sm">
              {/* User Database Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
                <h2 className="text-base font-medium text-[#3d2f28]\">User Database</h2>
                <p className="text-sm text-[#8b7764]">Total users: {users.length}</p>
              </div>

              {/* Payed / Pending Tabs */}
              <div className="flex border-b border-[#e8dfd8] px-4">
                <button
                  onClick={() => setUserSubTab('confirmed')}
                  className={`px-4 py-3 text-sm transition-colors relative ${
                    userSubTab === 'confirmed'
                      ? 'text-green-700 font-medium'
                      : 'text-[#8b7764] hover:text-[#6b5949]'
                  }`}
                >
                  Payed
                  {userSubTab === 'confirmed' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-700" />
                  )}
                </button>
                <button
                  onClick={() => setUserSubTab('pending')}
                  className={`px-4 py-3 text-sm transition-colors relative ${
                    userSubTab === 'pending'
                      ? 'text-yellow-700 font-medium'
                      : 'text-[#8b7764] hover:text-[#6b5949]'
                  }`}
                >
                  Pending
                  {userSubTab === 'pending' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-700" />
                  )}
                </button>
              </div>

              {/* User List */}
              <div className="p-4 space-y-2">
                {(() => {
                  const filtered = users.filter(user => user.status === userSubTab);
                  console.log(`Rendering ${userSubTab} tab. Total users: ${users.length}, Filtered: ${filtered.length}`);
                  return filtered;
                })()
                  .map((user) => {
                    const isExpanded = expandedUserId === user.id;
                    const sessionCount = user.packageType === 'package8' ? 8 : user.packageType === 'package10' ? 10 : user.packageType === 'package12' ? 12 : 1;
                    const usedSessions = user.usedSessions || 0;
                    const remainingSessions = sessionCount - usedSessions;

                    return (
                      <div
                        key={user.id}
                        className="border border-[#e8dfd8] rounded-lg overflow-hidden hover:border-[#6b5949] transition-colors"
                      >
                        {/* Compact View (Always Visible) */}
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                          className="w-full px-4 py-3 text-left hover:bg-[#f5f0ed] transition-colors"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-xs text-[#8b7764] block">Name:</span>
                              <span className="text-sm text-[#3d2f28] font-medium block">
                                {user.name} {user.surname}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs text-[#8b7764] block">Phone:</span>
                              <span className="text-sm text-[#3d2f28] font-medium block">{user.mobile}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-xs text-[#8b7764] block">Email:</span>
                              <span className="text-sm text-[#3d2f28] font-medium block break-all">
                                {user.email}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Expanded View */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-[#e8dfd8] bg-[#f5f0ed] bg-opacity-50">
                            {/* Status + Package */}
                            <div className="flex items-center gap-3 mt-3 mb-3">
                              <div
                                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
                                  user.status === 'confirmed'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {user.status === 'confirmed' ? (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Confirmed
                                  </>
                                ) : (
                                  <>⏳ Pending</>
                                )}
                              </div>

                              <div className="text-sm text-[#3d2f28] font-medium">
                                {user.packageType === 'package8' && '8 Sessions (3500 DEN)'}
                                {user.packageType === 'package10' && '10 Sessions (4200 DEN)'}
                                {user.packageType === 'package12' && '12 Sessions (4800 DEN)'}
                                {user.packageType === 'single' && 'Single (500 DEN)'}
                              </div>
                            </div>

                            {/* Booking Details */}
                            {user.bookingDate && user.bookingTime && (
                              <div className="mb-3 p-3 bg-white rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Booking Details:</p>
                                <p className="text-sm text-[#3d2f28]">
                                  {user.bookingDate} at {user.bookingTime}
                                </p>
                              </div>
                            )}

                            {/* Code Sent Time */}
                            {user.codeSentAt && (
                              <div className="mb-3 p-3 bg-white rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Code Sent:</p>
                                <p className="text-sm text-[#3d2f28]">
                                  {new Date(user.codeSentAt).toLocaleString()}
                                </p>
                              </div>
                            )}

                            {/* Sessions Remaining (for confirmed users with packages) */}
                            {user.status === 'confirmed' && user.packageType !== 'single' && (
                              <div className="mb-3 p-3 bg-white rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Package Usage:</p>
                                <div className="flex items-center justify-between">
                                  <p className="text-sm text-[#3d2f28]">
                                    <span className="font-medium text-green-700">{remainingSessions}</span> / {sessionCount} sessions remaining
                                  </p>
                                  <div className="text-xs text-[#8b7764]">
                                    Used: {usedSessions}
                                  </div>
                                </div>
                                {/* Progress Bar */}
                                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${((sessionCount - remainingSessions) / sessionCount) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Code + Action */}
                            <div className="flex flex-wrap items-center gap-2">
                              {user.packageType !== 'single' && user.activationCode && (
                                <div className="px-3 py-1.5 bg-white rounded-md text-sm text-[#6b5949]">
                                  <span className="text-[#8b7764]">Code: </span>
                                  <span className="font-mono font-medium text-[#3d2f28]">
                                    {user.activationCode}
                                  </span>
                                </div>
                              )}

                              {user.status === 'pending' && user.packageType !== 'single' ? (
                                <button
                                  onClick={() => handleSendCode(user)}
                                  className="px-3 py-1.5 bg-[#6b5949] text-white rounded-md text-xs font-medium hover:bg-[#5a4838] transition-colors flex items-center gap-1.5"
                                >
                                  <Mail className="w-3 h-3" />
                                  Send Code
                                </button>
                              ) : user.status === 'confirmed' ? (
                                <div className="px-3 py-1.5 bg-green-100 text-green-700 rounded-md text-xs font-medium flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3" />
                                  Activated
                                </div>
                              ) : null}
                              
                              {/* Gift Sessions Button (only for confirmed users) */}
                              {user.status === 'confirmed' && (
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowGiftModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-purple-500 text-white rounded-md text-xs font-medium hover:bg-purple-600 transition-colors flex items-center gap-1.5"
                                >
                                  <Gift className="w-3 h-3" />
                                  Gift
                                </button>
                              )}
                              
                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteUser(user)}
                                className="px-3 py-1.5 bg-red-500 text-white rounded-md text-xs font-medium hover:bg-red-600 transition-colors flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* Empty State */}
                {users.filter(user => user.status === userSubTab).length === 0 && (
                  <div className="text-center py-12 text-[#8b7764]">
                    <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      No {userSubTab} users yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'waitlist' ? (
          <div className="space-y-4">
            {/* Waitlist Header */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#3d2f28]">Waitlist Management</h2>
                  <p className="text-xs text-[#8b7764] mt-1">
                    {waitlistUsers.length} total &bull; {waitlistUsers.filter(u => u.status === 'pending').length} pending &bull; {waitlistUsers.filter(u => u.status === 'invited').length} invited &bull; {waitlistUsers.filter(u => u.status === 'redeemed').length} redeemed
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fetchWaitlistUsers}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-[#6b5949] px-3 py-2 rounded-lg text-sm transition-all"
                    title="Refresh waitlist"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                  {waitlistUsers.length === 0 && (
                    <button
                      onClick={handleAddBesaToWaitlist}
                      disabled={isProcessing}
                      className="flex items-center gap-2 bg-gradient-to-r from-[#6b5949] to-[#8b7764] text-white px-4 py-2 rounded-lg text-sm hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      <UserPlus className="w-4 h-4" />
                      {isProcessing ? 'Adding...' : 'Add Besa Ibrahimi'}
                    </button>
                  )}
                  {selectedWaitlistUsers.length > 0 && (
                    <button
                      onClick={() => handleSendInvites(selectedWaitlistUsers, true)}
                      disabled={isSendingInvites}
                      className="flex items-center gap-2 bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white px-4 py-2 rounded-lg text-sm hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {isSendingInvites ? 'Sending...' : `Send ${selectedWaitlistUsers.length} Invite${selectedWaitlistUsers.length > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>

              {/* Status Message */}
              {inviteStatus && (
                <div className={`p-3 rounded-lg mb-4 ${
                  inviteStatus.type === 'success' 
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <p className="text-sm">{inviteStatus.message}</p>
                </div>
              )}

              {/* Waitlist Table */}
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-4 border-[#9ca571] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm text-[#8b7764] mt-3">Loading waitlist...</p>
                </div>
              ) : waitlistUsers.length === 0 ? (
                <div className="text-center py-12 text-[#8b7764]">
                  <UserPlus className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No users in waitlist</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f5f0ed] text-[#6b5949] text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 w-10">
                          <input
                            type="checkbox"
                            checked={selectedWaitlistUsers.length === waitlistUsers.filter(u => u.status === 'pending').length && waitlistUsers.filter(u => u.status === 'pending').length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWaitlistUsers(waitlistUsers.filter(u => u.status === 'pending').map(u => u.email));
                              } else {
                                setSelectedWaitlistUsers([]);
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Phone</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8dfd8]">
                      {waitlistUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-[#faf9f7] transition-colors">
                          <td className="px-3 py-2.5">
                            {user.status === 'pending' && (
                              <input
                                type="checkbox"
                                checked={selectedWaitlistUsers.includes(user.email)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedWaitlistUsers([...selectedWaitlistUsers, user.email]);
                                  } else {
                                    setSelectedWaitlistUsers(selectedWaitlistUsers.filter(email => email !== user.email));
                                  }
                                }}
                                className="w-4 h-4"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-[#3d2f28]">{user.name} {user.surname}</div>
                          </td>
                          <td className="px-3 py-2.5 text-[#6b5949]">{user.email}</td>
                          <td className="px-3 py-2.5 text-[#6b5949]">{user.mobile}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              user.status === 'invited' ? 'bg-blue-100 text-blue-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              {user.status === 'pending' && (
                                <button
                                  onClick={() => handleSendInvites([user.email], false)}
                                  disabled={isSendingInvites}
                                  className="p-1.5 hover:bg-[#9ca571] hover:text-white rounded transition-colors disabled:opacity-50"
                                  title="Send invite"
                                >
                                  <Mail className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteWaitlistUser(user.email)}
                                className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
                                title="Remove from waitlist"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bulk Waitlist Upload - removed for production */}

            {/* Instructions */}
            <div className="bg-gradient-to-br from-[#f8f9f4] to-[#f5f0ed] rounded-xl p-4 border border-[#e8e6e3]">
              <h3 className="text-sm font-semibold text-[#3d2f28] mb-2">How It Works</h3>
              <ul className="space-y-2 text-xs text-[#6b5949]">
                <li className="flex items-start gap-2">
                  <span className="text-[#9ca571] font-bold">1.</span>
                  <span>Select users and click "Send Invites" or use individual send buttons</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#9ca571] font-bold">2.</span>
                  <span>Each user receives an email with a unique redemption code</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#9ca571] font-bold">3.</span>
                  <span>The email includes a link to book their first FREE session with an 8-class package purchase</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#9ca571] font-bold">4.</span>
                  <span>Users can present their redemption code at the studio for verification</span>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* Email Confirmation Modal */}
      {showEmailModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
              <h3 className="text-base text-[#3d2f28]">Send Activation Code</h3>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailStatus(null);
                }}
                className="p-1 hover:bg-[#f5f0ed] rounded-lg transition-colors"
                disabled={isSendingEmail}
              >
                <X className="w-5 h-5 text-[#6b5949]" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-[#6b5949] mb-3">
                Send activation code to:
              </p>
              <div className="bg-[#f5f0ed] rounded-lg p-3 mb-4">
                <p className="text-sm text-[#3d2f28]">
                  {selectedUser.name} {selectedUser.surname}
                </p>
                <p className="text-xs text-[#8b7764] mt-1">{selectedUser.email}</p>
              </div>

              {/* Package Selection */}
              <div className="mb-4">
                <label className="block text-sm text-[#6b5949] mb-2">
                  {selectedUser.packageType === 'single' ? 'Send Activation Code For:' : 'Booked Package:'}
                </label>
                
                {/* Show only the booked package */}
                {selectedUser.packageType === 'package8' && (
                  <div className="w-full p-3 rounded-lg border-2 border-[#9ca571] bg-[#f8f9f0] text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-[#3d2f28] font-medium">8 Sessions</p>
                        <p className="text-xs text-[#8b7764]">Code: PILATES8</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#3d2f28]">3500 DEN</p>
                        <p className="text-xs text-[#9ca571] font-medium">Recommended</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedUser.packageType === 'package8' && (
                  <div className="w-full p-3 rounded-lg border-2 border-[#9ca571] bg-[#f8f9f0] text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-[#3d2f28] font-medium">8 Sessions</p>
                        <p className="text-xs text-[#8b7764]">Code: WELLNEST8</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#3d2f28]">3500 DEN</p>
                        <p className="text-xs text-[#9ca571] font-medium">Basic</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedUser.packageType === 'package10' && (
                  <div className="w-full p-3 rounded-lg border-2 border-[#9ca571] bg-[#f8f9f0] text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-[#3d2f28] font-medium">10 Sessions</p>
                        <p className="text-xs text-[#8b7764]">Code: WELLNEST10</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#3d2f28]">4200 DEN</p>
                        <p className="text-xs text-[#9ca571] font-medium">Recommended</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedUser.packageType === 'package12' && (
                  <div className="w-full p-3 rounded-lg border-2 border-[#6b5949] bg-[#f5f0ed] text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-[#3d2f28] font-medium">12 Sessions</p>
                        <p className="text-xs text-[#8b7764]">Code: PILATES12</p>
                      </div>
                      <p className="text-sm text-[#3d2f28]">4800 DEN</p>
                    </div>
                  </div>
                )}

                {selectedUser.packageType === 'single' && (
                  <div className="w-full p-3 rounded-lg border-2 border-[#e8dfd8] bg-[#f5f0ed] text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-[#3d2f28] font-medium">Single Session</p>
                        <p className="text-xs text-[#8b7764]">One-time booking - No package selected</p>
                      </div>
                      <p className="text-sm text-[#3d2f28]">600 DEN</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Message */}
              {emailStatus && (
                <div
                  className={`mb-4 px-4 py-3 rounded-lg text-sm ${
                    emailStatus.type === 'success' 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}
                >
                  {emailStatus.message}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setEmailStatus(null);
                  }}
                  className="flex-1 px-4 py-2 bg-[#f5f0ed] text-[#6b5949] rounded-lg text-sm hover:bg-[#e8dfd8] transition-colors disabled:opacity-50"
                  disabled={isSendingEmail}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSendCode}
                  className="flex-1 px-4 py-2 bg-[#6b5949] text-white rounded-lg text-sm hover:bg-[#5a4838] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dev Tools Modal */}
      {showDevTools && (
        <DevTools onClose={() => setShowDevTools(false)} />
      )}
    </div>
  );
}