import { useState, useEffect, useRef } from 'react';
import { Calendar, Users, LogOut, Mail, X, CheckCircle, Trash2, Ban, ShieldAlert, Settings, UserPlus, UserMinus, Send, AlertCircle, Loader2, Pencil, Plus } from 'lucide-react';
import { logo } from '../../assets/images';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { DevTools } from './DevTools';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  getCalendarDateRange,
  getCalendarDates,
  getAllCalendarDates,
  formatDateShort,
  formatDateKeyLegacy
} from '../../utils/dateUtils';
// BulkWaitlistUpload removed - dev functionality not for production
// import { BulkWaitlistUpload } from './BulkWaitlistUpload';

export type UserStatus = 'pending' | 'confirmed' | 'cancelled' | 'attended' | 'no_show';

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
  usedSessions?: number; // Sessions used (computed from total - remaining)
  remainingSessions?: number; // Sessions remaining (source of truth)
  sessionsAdjustedAt?: string; // Last manual adjustment timestamp
  packages?: Array<{ // Track all packages purchased
    type: 'package8' | 'package10' | 'package12';
    sessions: number;
    purchasedDate: string;
    activatedDate?: string;
  }>;
  // Note: activation is now admin-triggered, no activation codes needed
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
  sessionToken?: string;
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

export function AdminPanel({ onLogout, sessionToken: propSessionToken }: AdminPanelProps) {
  // Get session token from props or localStorage
  const getSessionToken = () => propSessionToken || localStorage.getItem('adminSessionToken') || '';

  // Handle session expired errors - auto-logout admin
  const handleSessionError = (error: string) => {
    if (error === 'Session expired' || error === 'Invalid session') {
      toast.error('Your session has expired. Please log in again.');
      onLogout();
      return true;
    }
    return false;
  };

  // Format phone number as +389 XX XXX XXX
  const formatPhone = (phone: string): string => {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('389')) {
      digits = digits.slice(3);
    }
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    if (digits.length >= 8) {
      return `+389 ${digits.slice(0,2)} ${digits.slice(2,5)} ${digits.slice(5,8)}`;
    }
    return `+389 ${digits}`;
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'users' | 'waitlist'>('calendar');
  const [userSubTab, setUserSubTab] = useState<'confirmed' | 'pending'>('confirmed');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [paymentUpdatingEmail, setPaymentUpdatingEmail] = useState<string | null>(null);
  const [adjustingSessionsEmail, setAdjustingSessionsEmail] = useState<string | null>(null);
  const [sendingLoginEmailTo, setSendingLoginEmailTo] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = (title: string, description: string, onConfirm: () => void) => {
    setConfirmDialog({ open: true, title, description, onConfirm });
  };

  // Waitlist state
  const [waitlistUsers, setWaitlistUsers] = useState<WaitlistUser[]>([]);
  const [selectedWaitlistUsers, setSelectedWaitlistUsers] = useState<string[]>([]);
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Timeslot management state
  const [customSlots, setCustomSlots] = useState<any[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState<string>('');
  const [editingCapacity, setEditingCapacity] = useState<number>(4);
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotCapacity, setNewSlotCapacity] = useState<number>(4);
  const [slotLoading, setSlotLoading] = useState(false);
  const [usesCustomSlots, setUsesCustomSlots] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dayStatus, setDayStatus] = useState<'live' | 'draft'>('draft');
  const [liveDays, setLiveDays] = useState<string[]>([]);

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
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
      });

      const bookingsData = await bookingsResponse.json();

      if (!bookingsResponse.ok) {
        console.error('Failed to fetch bookings:', bookingsData);
        if (handleSessionError(bookingsData.error)) return;
      } else {
        console.log('Fetched bookings:', bookingsData.bookings);
        setBookings(bookingsData.bookings || []);
      }

      // Fetch users with aggregated data for Users tab
      const usersResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
      });

      const usersData = await usersResponse.json();

      if (!usersResponse.ok) {
        console.error('Failed to fetch users:', usersData);
        if (handleSessionError(usersData.error)) return;
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
          sessionsAdjustedAt: user.sessionsAdjustedAt,
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
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
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

  // Convert "M-D" format to "YYYY-MM-DD" for backend
  const convertToISODate = (dateKey: string): string => {
    const [month, day] = dateKey.split('-').map(Number);
    const year = new Date().getFullYear();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Fetch custom time slots for a date
  const fetchSlotsForDate = async (date: string) => {
    const isoDate = convertToISODate(date);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/slots?date=${isoDate}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        setCustomSlots(data.slots);
        setUsesCustomSlots(!data.isDefault);
        setDayStatus(data.dayStatus || 'draft');
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
    }
  };

  // Fetch all live days for indicators
  const fetchLiveDays = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/slots/live-days`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        setLiveDays(data.dates || []);
      }
    } catch (error) {
      console.error('Error fetching live days:', error);
    }
  };

  // Toggle day live/draft status for any day
  const toggleDayStatusFor = async (dateKey: string, isCurrentlyLive: boolean) => {
    const isoDate = convertToISODate(dateKey);
    const newStatus = isCurrentlyLive ? 'draft' : 'live';

    console.log(`Toggling day ${isoDate} from ${isCurrentlyLive ? 'live' : 'draft'} to ${newStatus}`);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/days/${isoDate}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        console.log(`✅ Day ${isoDate} set to ${newStatus}`);
        // Update local state if this is the selected date
        if (dateKey === selectedDate) {
          setDayStatus(newStatus);
        }
        fetchLiveDays(); // Refresh live days list
      } else {
        const data = await response.json();
        console.error('Failed to update day status:', data);
        toast.error(data.error || 'Failed to update day status');
      }
    } catch (error) {
      console.error('Error toggling day status:', error);
    }
  };

  // Fetch slots when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchSlotsForDate(selectedDate);
    } else {
      setCustomSlots([]);
      setUsesCustomSlots(false);
      setDayStatus('draft');
    }
  }, [selectedDate]);

  // Fetch live days on mount
  useEffect(() => {
    fetchLiveDays();
  }, []);

  // Auto-select today's date on mount so calendar opens with today's time slots visible
  useEffect(() => {
    const todayKey = formatDateKeyLegacy(new Date());
    if (!selectedDate) {
      setSelectedDate(todayKey);
    }
  }, []);

  // Slot management handlers
  const handleSaveSlot = async (slotId: string) => {
    if (!selectedDate) return;
    setSlotLoading(true);
    const isoDate = convertToISODate(selectedDate);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/slots/${slotId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ startTime: editingTime, maxCapacity: editingCapacity, date: isoDate }),
        }
      );
      if (response.ok) {
        await fetchSlotsForDate(selectedDate);
        setEditingSlotId(null);
        setEditingTime('');
        setEditingCapacity(4);
      } else {
        const data = await response.json();
        toast.error(data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to update slot');
      }
    } catch (error) {
      console.error('Error saving slot:', error);
    }
    setSlotLoading(false);
  };

  const handleDeleteSlot = (slotId: string, slotTime?: string) => {
    if (!selectedDate) return;

    showConfirm('Remove Time Slot', 'Are you sure you want to remove this time slot?', async () => {
      const isoDate = convertToISODate(selectedDate);

      // For default slots, include date and startTime as query params
      let url = `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/slots/${slotId}`;
      if (slotId.startsWith('default-') && slotTime) {
        url += `?date=${isoDate}&startTime=${slotTime}`;
      }

      try {
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        });
        if (response.ok) {
          await fetchSlotsForDate(selectedDate);
        } else {
          const data = await response.json();
          toast.error(data.error || 'Failed to delete slot');
        }
      } catch (error) {
        console.error('Error deleting slot:', error);
      }
    });
  };

  const handleAddSlot = async () => {
    if (!newSlotTime || !selectedDate) return;

    const isoDate = convertToISODate(selectedDate);
    setSlotLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/slots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ date: isoDate, startTime: newSlotTime, maxCapacity: newSlotCapacity }),
        }
      );
      if (response.ok) {
        await fetchSlotsForDate(selectedDate);
        setIsAddingSlot(false);
        setNewSlotTime('');
        setNewSlotCapacity(4);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to add slot');
      }
    } catch (error) {
      console.error('Error adding slot:', error);
    }
    setSlotLoading(false);
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
          'X-Session-Token': getSessionToken(),
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

  const handleDeleteWaitlistUser = (email: string) => {
    showConfirm('Remove from Waitlist', `Remove ${email} from the waitlist?`, async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/waitlist/${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        });

        const data = await response.json();
        if (response.ok) {
          fetchWaitlistUsers();
        } else {
          console.error('Delete waitlist error:', data);
          toast.error(data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to delete user');
        }
      } catch (error) {
        console.error('Error deleting waitlist user:', error);
        toast.error('Network error: ' + (error as Error).message);
      }
    });
  };

  const handleAddBesaToWaitlist = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
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
        toast.success(`Successfully added Besa Ibrahimi! Redemption Code: ${data.waitlistUser.redemptionCode}`);
        fetchWaitlistUsers();
      } else {
        toast.error(data.error || 'Failed to add user to waitlist');
      }
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      toast.error('An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate dynamic dates using centralized utility (5 weeks from today)
  // Using getAllCalendarDates to include weekends for admin view
  const generateAdminDates = () => {
    const { start, end } = getCalendarDateRange(5);
    const calendarDates = getAllCalendarDates(start, end);
    const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    return calendarDates.map(date => ({
      displayDate: `${date.getDate()}. ${formatDateShort(date).split(' ')[1]}`,
      dateKey: formatDateKeyLegacy(date),
      dayOfWeek: dayAbbr[date.getDay()],
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    }));
  };

  const dates = generateAdminDates();

  const timeSlots: TimeSlot[] = [
    { time: '09:00 - 09:50', maxCapacity: 4 },
    { time: '10:00 - 10:50', maxCapacity: 4 },
    { time: '16:00 - 16:50', maxCapacity: 4 },
    { time: '17:00 - 17:50', maxCapacity: 4 },
    { time: '18:00 - 18:50', maxCapacity: 4 },
    { time: '19:00 - 19:50', maxCapacity: 4 },
    { time: '20:00 - 20:50', maxCapacity: 4 },
  ];

  const maxDailyCapacity = timeSlots.length * 4; // 7 slots × 4 capacity = 28 max bookings per day

  const getBookingsForDate = (dateKey: string) => {
    // Convert legacy "M-D" format to ISO "YYYY-MM-DD" for comparison
    const isoDateKey = convertToISODate(dateKey);
    return bookings.filter(booking => {
      // Handle both formats: legacy "M-D" and ISO "YYYY-MM-DD"
      return booking.dateKey === dateKey || booking.dateKey === isoDateKey;
    });
  };

  const getBookingsForTimeSlot = (dateKey: string, timeSlot: string) => {
    // Extract start time from "09:00 - 10:00" format to match API's "09:00" format
    const startTime = timeSlot.split(' - ')[0];
    // Convert legacy "M-D" format to ISO "YYYY-MM-DD" for comparison
    const isoDateKey = convertToISODate(dateKey);
    return bookings.filter(booking =>
      (booking.dateKey === dateKey || booking.dateKey === isoDateKey) &&
      booking.timeSlot === startTime
    );
  };

  const getTimeSlotCapacity = (dateKey: string, timeSlot: string) => {
    const bookings = getBookingsForTimeSlot(dateKey, timeSlot);
    return bookings.length;
  };

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';  // Paid
      case 'pending':
        return 'bg-amber-100 text-amber-700';  // Not Paid
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: UserStatus) => {
    switch (status) {
      case 'confirmed':
        return 'Paid';
      case 'pending':
        return 'Not Paid';
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
            'X-Session-Token': getSessionToken(),
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

  // Activate user (admin action after cash payment in studio)
  const handleActivateUser = (user: User) => {
    showConfirm(
      'Activate User',
      `Activate ${user.name} ${user.surname}?\n\nThis will:\n• Set status to Activated\n• Set payment to Paid\n• Send login email with password setup link`,
      async () => {
        setIsSendingEmail(true);

        try {
          const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/activate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
              'X-Session-Token': getSessionToken(),
            },
            body: JSON.stringify({
              email: user.email,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to activate user:', errorText);

            try {
              const errorData = JSON.parse(errorText);
              toast.error(errorData.error || 'Failed to activate user. Please try again.');
            } catch {
              toast.error('Failed to activate user. Please try again.');
            }

            setIsSendingEmail(false);
            return;
          }

          const data = await response.json();
          console.log('User activated successfully:', data);

          toast.success(`${user.name} ${user.surname} activated successfully! Login email sent to ${user.email}`);
          setIsSendingEmail(false);

          // Refresh user list to show updated status
          fetchBookings(); // fetchBookings() fetches both bookings AND users
        } catch (error) {
          console.error('Error activating user:', error);
          toast.error('Network error. Please check your connection.');
          setIsSendingEmail(false);
        }
      }
    );
  };

  const handleDeleteUser = (user: User) => {
    showConfirm(
      'Delete User',
      `Are you sure you want to delete ${user.name} ${user.surname}? This will delete all their bookings and cannot be undone.`,
      async () => {
        try {
          const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/users/${encodeURIComponent(user.email)}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
              'X-Session-Token': getSessionToken(),
            },
          });

          if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
              const data = await response.json();
              errorMessage = data.error || data.message || errorMessage;
            } catch {
              // Response might not be JSON
            }
            console.error('Failed to delete user:', response.status, errorMessage);
            toast.error(`Failed to delete user: ${errorMessage}`);
            return;
          }

          // Success - response might be empty or JSON
          let data;
          try {
            data = await response.json();
          } catch {
            data = { success: true };
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
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to delete user: ${message}`);
        }
      }
    );
  };

  // Handle session adjustment (+1 or -1)
  const handleAdjustSessions = async (user: User, adjustment: 1 | -1) => {
    // Save previous values for rollback
    const previousRemaining = user.remainingSessions;

    // Optimistic update
    const newRemaining = (previousRemaining ?? 0) + adjustment;
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.email === user.email
          ? { ...u, remainingSessions: newRemaining }
          : u
      )
    );

    setAdjustingSessionsEmail(user.email);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/users/${encodeURIComponent(user.email)}/adjust-sessions`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ adjustment }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to adjust sessions:', data);
        // Revert to previous value on error
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.email === user.email
              ? { ...u, remainingSessions: previousRemaining }
              : u
          )
        );
        toast.error(`Failed to adjust sessions: ${data.error || 'Unknown error'}`);
        return;
      }

      console.log('Sessions adjusted:', data);

      // Update with server response (authoritative)
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.email === user.email
            ? {
                ...u,
                remainingSessions: data.remainingSessions,
                sessionsAdjustedAt: data.sessionsAdjustedAt,
              }
            : u
        )
      );
    } catch (error) {
      console.error('Error adjusting sessions:', error);
      // Revert to previous value on network error
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.email === user.email
            ? { ...u, remainingSessions: previousRemaining }
            : u
        )
      );
      toast.error('Network error. Please check your connection.');
    } finally {
      setAdjustingSessionsEmail(null);
    }
  };

  // Handle resend login email
  const handleResendLoginEmail = (user: User) => {
    showConfirm(
      'Send Login Email',
      `Send login email to ${user.name} ${user.surname} (${user.email})?`,
      async () => {
        setSendingLoginEmailTo(user.email);
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/users/${encodeURIComponent(user.email)}/resend-login-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
                'X-Session-Token': getSessionToken(),
              },
            }
          );

          const data = await response.json();

          if (!response.ok) {
            console.error('Failed to send login email:', data);
            if (handleSessionError(data.error)) return;
            toast.error(`Failed to send email: ${data.error || 'Unknown error'}`);
            return;
          }

          console.log('Login email sent:', data);
          toast.success(`Login email sent to ${user.email}!`);
        } catch (error) {
          console.error('Error sending login email:', error);
          toast.error('Network error. Please check your connection.');
        } finally {
          setSendingLoginEmailTo(null);
        }
      }
    );
  };

  // Handle booking status change (Attended, No Show, Cancel)
  const handleBookingStatusChange = async (bookingId: string, newStatus: string) => {
    console.log('📝 Updating booking status:', bookingId, newStatus);
    setProcessingBookingId(bookingId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/reservations/${bookingId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ reservationStatus: newStatus }),
        }
      );
      if (response.ok) {
        console.log('✅ Booking status updated successfully');
        await fetchBookings();
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to update booking status:', response.status, errorData);
      }
    } catch (error) {
      console.error('❌ Error updating booking status:', error);
    } finally {
      setProcessingBookingId(null);
    }
  };

  // Handle removing user from class (admin action - refunds session)
  const handleRemoveFromClass = async (bookingId: string, userName: string) => {
    showConfirm(
      'Remove from Class',
      `Are you sure you want to remove ${userName} from this class? Their session credit will be restored.`,
      async () => {
        console.log('🗑️ Removing user from class:', bookingId);
        setProcessingBookingId(bookingId);
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/reservations/${bookingId}`,
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
                'X-Session-Token': getSessionToken(),
              },
            }
          );
          if (response.ok) {
            console.log('✅ User removed from class, session restored');
            toast.success(`${userName} removed from class. Session credit restored.`);
            await fetchBookings();
          } else {
            const errorData = await response.text();
            console.error('❌ Failed to remove from class:', response.status, errorData);
            toast.error('Failed to remove user from class. Check console for details.');
          }
        } catch (error) {
          console.error('❌ Error removing from class:', error);
          toast.error('Network error. Please check your connection.');
        } finally {
          setProcessingBookingId(null);
        }
      }
    );
  };

  // Handle activation from calendar booking card (reuses same API as Users tab)
  const handleActivateFromCalendar = async (email: string, name: string) => {
    console.log('💰 Activating user from calendar:', email);
    setPaymentUpdatingEmail(email);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/activate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ email }),
        }
      );
      if (response.ok) {
        console.log('✅ User activated successfully');
        await fetchBookings();
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to activate user:', response.status, errorData);
        toast.error(`Failed to activate ${name}. Check console for details.`);
      }
    } catch (error) {
      console.error('❌ Error activating user:', error);
      toast.error('Network error. Please check your connection.');
    } finally {
      setPaymentUpdatingEmail(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#f5f0ed]">
      {/* Header */}
      <div className="bg-[#F5F0EE] shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-8 h-8" />
          <div>
            <h1 className="text-base text-[#3d2f28]">Admin Panel</h1>
            <p className="text-xs text-[#8b7764]">Wellnest Pilates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* DevTools button hidden in production - only visible in development */}
          {import.meta.env.DEV && (
            <button
              onClick={() => setShowDevTools(true)}
              className="p-2 hover:bg-[#f5f0ed] rounded-lg transition-colors"
              title="Developer Tools"
            >
              <Settings className="w-5 h-5 text-[#6b5949]" />
            </button>
          )}
          <button
            onClick={onLogout}
            className="p-2 hover:bg-[#f5f0ed] rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 text-[#6b5949]" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#F5F0EE] border-b border-[#e8dfd8] px-4">
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 bg-stone-50">
        {activeTab === 'calendar' ? (
          <div className="space-y-4">
            {/* Date Selection - Clean Week Strip */}
            <div className="bg-[#F5F0EE] rounded-xl p-3 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
                {dates.map((date) => {
                  const dayBookings = getBookingsForDate(date.dateKey);
                  const bookingsCount = dayBookings.length;
                  const isSelected = selectedDate === date.dateKey;
                  const todayKey = formatDateKeyLegacy(new Date());
                  const isToday = date.dateKey === todayKey;
                  const isWeekend = date.isWeekend;

                  // Check if this date is live
                  const isoDateKey = convertToISODate(date.dateKey);
                  const isLive = liveDays.includes(isoDateKey);

                  return (
                    <div key={date.dateKey} className="flex flex-col items-center snap-center">
                      <button
                        onClick={() => setSelectedDate(date.dateKey)}
                        className={`
                          flex-shrink-0 min-w-[52px] h-[72px] rounded-xl flex flex-col items-center justify-center
                          transition-all
                          ${isSelected
                            ? 'bg-stone-600 text-white'
                            : isWeekend
                              ? 'bg-stone-200 hover:bg-stone-300'
                              : 'bg-[#F5F0EE] hover:bg-stone-100'
                          }
                          ${isToday && !isSelected ? 'ring-1 ring-stone-400' : ''}
                        `}
                      >
                        <span className={`text-[9px] font-medium ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                          {date.dayOfWeek}
                        </span>
                        <span className={`text-lg font-semibold ${isSelected ? '' : 'text-stone-800'}`}>
                          {date.displayDate.split('.')[0]}
                        </span>
                        <span className={`text-[9px] ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                          {bookingsCount}/{maxDailyCapacity}
                        </span>
                      </button>

                      {/* Status indicator/toggle under each day */}
                      {isEditMode ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDayStatusFor(date.dateKey, isLive);
                          }}
                          className={`mt-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
                            isLive
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                          }`}
                        >
                          {isLive ? 'Live' : 'Draft'}
                        </button>
                      ) : (
                        isLive && <div className="mt-1 w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Date - Timeline View */}
            {selectedDate && (
              <div className="bg-[#F5F0EE] rounded-xl shadow-sm overflow-hidden">
                {/* Header with Edit Mode Toggle */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100">
                  <span className="text-sm font-medium text-stone-600">Time Slots</span>
                  {/* Edit/Done button */}
                  <button
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isEditMode
                        ? 'bg-stone-200 text-stone-700 font-medium'
                        : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {isEditMode ? 'Done' : <Pencil className="w-4 h-4" />}
                  </button>
                </div>
                {/* Timeline List */}
                <div className="divide-y divide-stone-100">
                  {(customSlots.length > 0 ? customSlots : timeSlots.map((ts, i) => ({
                    id: `default-${i}`,
                    start_time: ts.time.split(' - ')[0],
                    max_capacity: ts.maxCapacity,
                    isDefault: true
                  }))).map((slot: any) => {
                    const slotTime = slot.start_time?.substring(0, 5) || slot.start_time;
                    const timeSlotKey = `${slotTime} - ${slotTime}`;
                    const bookingsCount = getBookingsForTimeSlot(selectedDate, timeSlotKey).length;
                    const isSelected = selectedTimeSlot === timeSlotKey;
                    const slotBookings = getBookingsForTimeSlot(selectedDate, timeSlotKey);
                    const hasPaidBooking = slotBookings.some((b: any) => b.paymentStatus === 'paid');
                    const hasUnpaidBooking = slotBookings.some((b: any) => b.paymentStatus !== 'paid');
                    const hasBookings = bookingsCount > 0;

                    // Status dot color: green=paid, amber=unpaid, stone=empty
                    let dotColor = 'bg-stone-300'; // empty
                    if (hasPaidBooking) dotColor = 'bg-green-500';
                    else if (hasUnpaidBooking) dotColor = 'bg-amber-500';

                    const isEditingThis = editingSlotId === slot.id;

                    return (
                      <div key={slot.id}>
                        <div
                          className={`
                            w-full flex items-center gap-3 px-4 py-3 min-h-[52px]
                            border-l-2 transition-all
                            ${isSelected ? 'border-l-stone-600 bg-stone-50' : 'border-l-transparent hover:bg-stone-50'}
                          `}
                        >
                          {/* Status Dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />

                          {/* Time - Editable or Static */}
                          {isEditingThis ? (
                            <>
                              <input
                                type="time"
                                value={editingTime}
                                onChange={(e) => setEditingTime(e.target.value)}
                                className="border border-stone-300 rounded px-2 py-1 w-24 text-sm"
                                autoFocus
                              />
                              <select
                                value={editingCapacity}
                                onChange={(e) => setEditingCapacity(Number(e.target.value))}
                                className="border border-stone-300 rounded px-2 py-1 text-sm w-16"
                                title="Max capacity"
                              >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                              </select>
                              <button
                                onClick={() => handleSaveSlot(slot.id)}
                                disabled={slotLoading}
                                className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                              >
                                {slotLoading ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingSlotId(null); setEditingTime(''); setEditingCapacity(4); }}
                                className="text-sm text-stone-500 hover:text-stone-700"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  if (isEditMode) {
                                    // In edit mode, clicking slot opens editing directly
                                    setEditingSlotId(slot.id);
                                    setEditingTime(slotTime);
                                    setEditingCapacity(slot.max_capacity || 4);
                                  } else {
                                    // Normal mode: toggle expanded bookings view
                                    setSelectedTimeSlot(isSelected ? null : timeSlotKey);
                                  }
                                }}
                                className="flex items-center gap-3 flex-1"
                              >
                                <span className="text-sm font-medium text-stone-800 w-12">{slotTime}</span>
                                <div className="flex-1 text-left">
                                  <span className="text-sm text-stone-600">
                                    {bookingsCount === 0 ? 'Available' : `${bookingsCount} booked`}
                                  </span>
                                </div>
                                <span className="text-sm text-stone-400">{bookingsCount}/{slot.max_capacity || 4}</span>
                              </button>

                              {/* Delete button - only in edit mode and if no bookings */}
                              {isEditMode && !hasBookings && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteSlot(slot.id, slotTime); }}
                                  className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                                  title="Remove slot"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Expanded bookings */}
                        {isSelected && bookingsCount > 0 && (
                          <div className="px-4 pb-3 space-y-2 bg-stone-50">
                            {slotBookings.map((booking) => {
                              const baseCount = booking.selectedPackage === 'package8' ? 8
                                : booking.selectedPackage === 'package10' ? 10
                                : booking.selectedPackage === 'package12' ? 12 : 0;
                              const isProcessing = processingBookingId === booking.id;
                              const isUpdatingPayment = paymentUpdatingEmail === booking.email;
                              const isPaid = booking.paymentStatus === 'paid';

                              // Booking status dot: green=paid, amber=unpaid
                              const bookingDotColor = isPaid ? 'bg-green-500' : 'bg-amber-500';

                              return (
                                <div
                                  key={booking.id}
                                  className="p-3 bg-[#F5F0EE] border border-stone-200 rounded-lg"
                                >
                                  {/* Top row: Status dot + Name + Payment Badge */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${bookingDotColor}`} />
                                    <span className="text-sm font-medium text-stone-800 truncate flex-1">
                                      {booking.name} {booking.surname}
                                    </span>
                                    {/* Payment Badge */}
                                    {isPaid ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-green-700 bg-green-100">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Paid
                                      </span>
                                    ) : (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleActivateFromCalendar(booking.email, booking.name); }}
                                        disabled={isUpdatingPayment}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 hover:bg-amber-200 transition-colors disabled:opacity-50 cursor-pointer"
                                      >
                                        {isUpdatingPayment ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <AlertCircle className="w-3.5 h-3.5" />
                                        )}
                                        Not Paid
                                      </button>
                                    )}
                                  </div>

                                  {/* Sessions info */}
                                  <p className="text-xs text-stone-500 ml-4 mb-2">
                                    Sessions: {baseCount > 0 ? baseCount : 'Single'}
                                  </p>

                                  {/* Quick Actions - 44px touch targets with status highlighting */}
                                  <div className="flex items-center gap-1 ml-4">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleBookingStatusChange(booking.id, 'attended'); }}
                                      disabled={isProcessing}
                                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50
                                        ${booking.status === 'attended'
                                          ? 'bg-green-100 text-green-700'
                                          : 'hover:bg-green-50 text-green-600'}`}
                                      title="Attended"
                                    >
                                      <CheckCircle className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleBookingStatusChange(booking.id, 'no_show'); }}
                                      disabled={isProcessing}
                                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50
                                        ${booking.status === 'no_show'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'hover:bg-amber-50 text-amber-600'}`}
                                      title="No Show"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleBookingStatusChange(booking.id, 'cancelled'); }}
                                      disabled={isProcessing}
                                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50
                                        ${booking.status === 'cancelled'
                                          ? 'bg-stone-200 text-stone-700'
                                          : 'hover:bg-stone-100 text-stone-500'}`}
                                      title="Cancel"
                                    >
                                      <Ban className="w-5 h-5" />
                                    </button>
                                    {/* Remove from class button - deletes booking and refunds session */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRemoveFromClass(booking.id, `${booking.name} ${booking.surname}`); }}
                                      disabled={isProcessing}
                                      className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 hover:bg-red-50 text-red-500"
                                      title="Remove from class (refund session)"
                                    >
                                      <UserMinus className="w-5 h-5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Slot Section - only in edit mode */}
                  {isEditMode && (
                    isAddingSlot ? (
                      <div className="flex items-center gap-3 px-4 py-3 bg-stone-50">
                        <div className="w-2 h-2 rounded-full bg-stone-300" />
                        <input
                          type="time"
                          value={newSlotTime}
                          onChange={(e) => setNewSlotTime(e.target.value)}
                          className="border border-stone-300 rounded px-2 py-1 w-24 text-sm"
                          autoFocus
                        />
                        <select
                          value={newSlotCapacity}
                          onChange={(e) => setNewSlotCapacity(Number(e.target.value))}
                          className="border border-stone-300 rounded px-2 py-1 text-sm w-16"
                          title="Max capacity"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                        <button
                          onClick={handleAddSlot}
                          disabled={slotLoading || !newSlotTime}
                          className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                        >
                          {slotLoading ? 'Adding...' : 'Add'}
                        </button>
                        <button
                          onClick={() => { setIsAddingSlot(false); setNewSlotTime(''); setNewSlotCapacity(4); }}
                          className="text-sm text-stone-500 hover:text-stone-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsAddingSlot(true)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-50 w-full transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Time Slot
                      </button>
                    )
                  )}
                </div>

                {getBookingsForDate(selectedDate).length === 0 && !isAddingSlot && (
                  <p className="text-sm text-stone-500 text-center py-4">
                    No bookings for this date
                  </p>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'users' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="bg-[#F5F0EE] rounded-lg shadow-sm">
              {/* User Database Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
                <h2 className="text-base font-medium text-[#3d2f28]\">User Database</h2>
                <p className="text-sm text-[#8b7764]">Total users: {users.length}</p>
              </div>

              {/* Paid / Pending Tabs */}
              <div className="flex border-b border-[#e8dfd8] px-4">
                <button
                  onClick={() => setUserSubTab('confirmed')}
                  className={`px-4 py-3 text-sm transition-colors relative ${
                    userSubTab === 'confirmed'
                      ? 'text-green-700 font-medium'
                      : 'text-[#8b7764] hover:text-[#6b5949]'
                  }`}
                >
                  Paid ({users.filter(u => u.status === 'confirmed').length})
                  {userSubTab === 'confirmed' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-700" />
                  )}
                </button>
                <button
                  onClick={() => setUserSubTab('pending')}
                  className={`px-4 py-3 text-sm transition-colors relative ${
                    userSubTab === 'pending'
                      ? 'text-amber-700 font-medium'
                      : 'text-[#8b7764] hover:text-[#6b5949]'
                  }`}
                >
                  Not Paid ({users.filter(u => u.status === 'pending').length})
                  {userSubTab === 'pending' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-700" />
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
                    const baseSessionCount = user.packageType === 'package8' ? 8 : user.packageType === 'package10' ? 10 : user.packageType === 'package12' ? 12 : 1;
                    const totalSessions = user.totalSessions || baseSessionCount;
                    const bonusSessions = totalSessions > baseSessionCount ? totalSessions - baseSessionCount : 0;
                    // remaining is source of truth, used is computed
                    const remainingSessions = user.remainingSessions ?? 0;
                    const usedSessions = totalSessions - remainingSessions;

                    // Mini-bar visual: bonus consumed first
                    const normalTotal = baseSessionCount;
                    const bonusTotal = bonusSessions; // 0 or 1
                    const bonusUsed = Math.min(usedSessions, bonusTotal);
                    const bonusRemaining = bonusTotal - bonusUsed;
                    const normalUsed = usedSessions - bonusUsed;
                    const normalRemaining = normalTotal - normalUsed;

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
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#3d2f28] font-medium">
                              {user.name} {user.surname}
                            </span>
                            <span className="text-sm text-[#6b5949]">
                              {formatPhone(user.mobile)}
                            </span>
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
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {user.status === 'confirmed' ? (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Paid
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-4 h-4" />
                                    Not Paid
                                  </>
                                )}
                              </div>

                              <div className="text-sm text-[#3d2f28] font-medium">
                                {user.packageType === 'package8' && (
                                  bonusSessions > 0 ? `8 + ${bonusSessions} Bonus Sessions` : '8 Sessions (3500 DEN)'
                                )}
                                {user.packageType === 'package10' && (
                                  bonusSessions > 0 ? `10 + ${bonusSessions} Bonus Sessions` : '10 Sessions (4200 DEN)'
                                )}
                                {user.packageType === 'package12' && (
                                  bonusSessions > 0 ? `12 + ${bonusSessions} Bonus Sessions` : '12 Sessions (4800 DEN)'
                                )}
                                {user.packageType === 'single' && 'Single (600 DEN)'}
                              </div>
                            </div>

                            {/* Booking Details */}
                            {user.bookingDate && user.bookingTime && (
                              <div className="mb-3 p-3 bg-[#F5F0EE] rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Booking Details:</p>
                                <p className="text-sm text-[#3d2f28]">
                                  {user.bookingDate} at {user.bookingTime}
                                </p>
                              </div>
                            )}

                            {/* Code Sent Time */}
                            {user.codeSentAt && (
                              <div className="mb-3 p-3 bg-[#F5F0EE] rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Code Sent:</p>
                                <p className="text-sm text-[#3d2f28]">
                                  {new Date(user.codeSentAt).toLocaleString()}
                                </p>
                              </div>
                            )}

                            {/* Sessions Remaining (for confirmed users with packages) */}
                            {user.status === 'confirmed' && user.packageType !== 'single' && (
                              <div className="mb-3 p-3 bg-[#F5F0EE] rounded-md">
                                <p className="text-xs text-[#8b7764] mb-1">Package Usage:</p>
                                <div className="flex items-center justify-between">
                                  <p className="text-sm text-[#3d2f28]">
                                    <span className="font-medium" style={{ color: '#7A8F3A' }}>{remainingSessions}</span> / {totalSessions} sessions remaining
                                  </p>
                                  <div className="text-xs text-[#8b7764]">
                                    Used: {usedSessions}
                                  </div>
                                </div>
                                {/* Mini-bar Visual */}
                                <div className="mt-2 flex items-center">
                                  {/* Normal package bars */}
                                  <div className="flex" style={{ gap: '2px' }}>
                                    {Array.from({ length: normalTotal }).map((_, i) => (
                                      <span
                                        key={`normal-${i}`}
                                        style={{
                                          width: '14px',
                                          height: '10px',
                                          borderRadius: '3px',
                                          display: 'inline-block',
                                          backgroundColor: i < normalRemaining ? '#7A8F3A' : 'rgba(122,143,58,0.2)',
                                        }}
                                      />
                                    ))}
                                  </div>
                                  {/* Bonus bar (if applicable) */}
                                  {bonusTotal > 0 && (
                                    <>
                                      <span style={{ display: 'inline-block', width: '6px' }} />
                                      <span
                                        style={{
                                          width: '14px',
                                          height: '10px',
                                          borderRadius: '3px',
                                          display: 'inline-block',
                                          backgroundColor: bonusRemaining > 0 ? '#D8A93B' : 'rgba(216,169,59,0.2)',
                                        }}
                                      />
                                    </>
                                  )}
                                </div>
                                {/* Adjust Sessions Buttons */}
                                <div className="mt-3 flex gap-3">
                                  <button
                                    onClick={() => handleAdjustSessions(user, -1)}
                                    disabled={remainingSessions <= 0 || adjustingSessionsEmail === user.email}
                                    className={`w-10 h-10 rounded-md text-lg font-bold flex items-center justify-center transition-colors ${
                                      remainingSessions <= 0 || adjustingSessionsEmail === user.email
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-white border border-[#6b5949] text-[#6b5949] hover:bg-[#6b5949] hover:text-white'
                                    }`}
                                  >
                                    {adjustingSessionsEmail === user.email ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      '−'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleAdjustSessions(user, 1)}
                                    disabled={remainingSessions >= totalSessions || adjustingSessionsEmail === user.email}
                                    className={`w-10 h-10 rounded-md text-lg font-bold flex items-center justify-center transition-colors ${
                                      remainingSessions >= totalSessions || adjustingSessionsEmail === user.email
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-white border border-[#6b5949] text-[#6b5949] hover:bg-[#6b5949] hover:text-white'
                                    }`}
                                  >
                                    {adjustingSessionsEmail === user.email ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      '+'
                                    )}
                                  </button>
                                </div>
                                {/* Last adjusted timestamp */}
                                {user.sessionsAdjustedAt && (
                                  <p className="mt-2 text-xs text-[#8b7764]">
                                    Last adjusted: {new Date(user.sessionsAdjustedAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Code + Action */}
                            <div className="flex flex-wrap items-center gap-2">
                              {user.status === 'pending' ? (
                                <button
                                  onClick={() => handleActivateUser(user)}
                                  className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1.5"
                                  disabled={isSendingEmail}
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Activate User
                                </button>
                              ) : user.status === 'confirmed' ? (
                                <>
                                  <div className="px-3 py-1.5 bg-green-100 text-green-700 rounded-md text-xs font-medium flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3" />
                                    Activated
                                  </div>
                                  <button
                                    onClick={() => handleResendLoginEmail(user)}
                                    disabled={sendingLoginEmailTo === user.email}
                                    className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {sendingLoginEmailTo === user.email ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Mail className="w-3 h-3" />
                                    )}
                                    Send Login Email
                                  </button>
                                </>
                              ) : null}

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
            <div className="bg-[#F5F0EE] rounded-xl p-4 shadow-sm">
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

      {/* Confirmation actions now use styled AlertDialog */}

      {/* Dev Tools Modal */}
      {showDevTools && (
        <DevTools onClose={() => setShowDevTools(false)} />
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {confirmDialog?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const callback = confirmDialog?.onConfirm;
              setConfirmDialog(null);
              if (callback) callback();
            }}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}