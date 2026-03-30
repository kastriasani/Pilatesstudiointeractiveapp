import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Users, LogOut, Mail, X, CheckCircle, Trash2, Ban, ShieldAlert, Settings, UserMinus, Send, AlertCircle, Loader2, Pencil, Plus, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { logo } from '../../assets/images';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { DevTools } from './DevTools';
import { toast } from 'sonner';
import { useRealtimeAvailability } from '@/hooks/useRealtimeAvailability';
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
  formatDateKeyLegacy,
  getSkopjeTime
} from '../../utils/dateUtils';
export type UserStatus = 'pending' | 'confirmed' | 'cancelled' | 'attended' | 'no_show';

export type User = {
  id: string;
  name: string;
  surname: string;
  mobile: string;
  email: string;
  status: UserStatus;
  packageType?: 'package8' | 'package10' | 'package12' | 'single' | '1class' | '8classes' | '12classes' | 'duo1class' | 'duo8classes' | 'duo12classes';
  totalSessions?: number; // Total sessions purchased across all packages
  usedSessions?: number; // Sessions used (computed from total - remaining)
  remainingSessions?: number; // Sessions remaining (source of truth)
  sessionsAdjustedAt?: string; // Last manual adjustment timestamp
  packages?: Array<{
    id: string;
    type: string;
    status: string;
    paymentStatus: string;
    activationStatus: string;
    totalSessions: number;
    remainingSessions: number;
    baseSessions: number;
    bonusClasses: number;
    createdAt: string;
    purchaseDate?: string;
    activationDate?: string;
    expiryDate?: string;
  }>;
  reservations?: Array<{
    id: string;
    dateKey: string;
    timeSlot: string;
    reservationStatus: string;
    packageId?: string;
  }>;
  blocked?: boolean;
  flag?: string;
  flagMessage?: string;
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
  selectedPackage?: 'package8' | 'package10' | 'package12' | '1class' | '8classes' | '12classes' | 'duo1class' | 'duo8classes' | 'duo12classes';
  payInStudio: boolean;
  language: string;
  status: UserStatus;
  isFriendBooking?: boolean;
  serviceType?: string;
  paymentStatus?: string;
  packageId?: string;
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
  const [activeTab, setActiveTab] = useState<'calendar' | 'users'>('calendar');
  const [userFilter, setUserFilter] = useState<'all' | 'needs_attention' | 'active' | 'inactive'>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
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

  // Delete user dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    user: User | null;
    confirmText: string;
    isDeleting: boolean;
  } | null>(null);

  // Archived users email state
  const [selectedArchivedUsers, setSelectedArchivedUsers] = useState<string[]>([]);
  const [isSendingReengagement, setIsSendingReengagement] = useState(false);
  const [reengagementStatus, setReengagementStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Login requests state
  const [loginRequests, setLoginRequests] = useState<Array<{
    id: string;
    email: string;
    name: string;
    surname: string;
    paymentStatus: string;
    package: any;
    createdAt: string;
  }>>([]);
  const [processingLoginRequest, setProcessingLoginRequest] = useState<string | null>(null);

  // Booking change history state
  type BookingChange = {
    id: string;
    reservationId: string;
    userEmail: string;
    changeType: 'cancelled' | 'rescheduled' | 'class_cancelled' | 'session_correction';
    oldDateKey: string;
    oldTimeSlot: string;
    newDateKey: string | null;
    newTimeSlot: string | null;
    userName: string;
    userSurname: string;
    packageType: string;
    createdAt: string;
  };
  const [bookingChanges, setBookingChanges] = useState<BookingChange[]>([]);
  const [showChanges, setShowChanges] = useState(false);
  const [changesView, setChangesView] = useState<'recent' | 'archive'>('recent');
  const [isArchiving, setIsArchiving] = useState(false);

  // Timeslot management state
  const [customSlots, setCustomSlots] = useState<any[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState<string>('');
  const [editingCapacity, setEditingCapacity] = useState<number>(4);
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotCapacity, setNewSlotCapacity] = useState<number>(4);
  const [newSlotClassType, setNewSlotClassType] = useState<'group' | 'individual' | 'duo'>('group');
  const [editingClassType, setEditingClassType] = useState<'group' | 'individual' | 'duo'>('group');
  const [slotLoading, setSlotLoading] = useState(false);
  const classTypeAbortRef = useRef<Record<string, AbortController>>({});
  const [usesCustomSlots, setUsesCustomSlots] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dayStatus, setDayStatus] = useState<'live' | 'draft'>('draft');
  const [liveDays, setLiveDays] = useState<string[]>([]);

  // Fetch all bookings on component mount
  useEffect(() => {
    fetchBookings();
    fetchBookingChanges(changesView === 'archive');
  }, [activeTab]);

  // Refetch when view toggles
  useEffect(() => {
    fetchBookingChanges(changesView === 'archive');
  }, [changesView]);

  // Realtime: silent refresh when any reservation changes (replaces 30s polling)
  useRealtimeAvailability(useCallback(() => {
    fetchBookings(true);
    fetchBookingChanges(changesView === 'archive');
  }, [changesView]));

  // Scroll to top whenever tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab, userFilter]);

  const fetchBookings = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      
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
          packageType: user.packages?.[0]?.type || 'single',
          totalSessions: user.totalSessions,
          usedSessions: user.usedSessions,
          remainingSessions: user.remainingSessions,
          sessionsAdjustedAt: user.sessionsAdjustedAt,
          packages: user.packages,
          reservations: user.reservations,
          blocked: user.blocked || false,
          flag: user.flag,
          flagMessage: user.flagMessage,
          createdAt: user.createdAt,
        };
      });

      console.log('Formatted users:', formattedUsers);
      console.log('Pending users:', formattedUsers.filter(u => u.status === 'pending'));
      console.log('Confirmed users:', formattedUsers.filter(u => u.status === 'confirmed'));

      setUsers(formattedUsers);

      // Fetch login requests
      try {
        const loginReqResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/login-requests`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        });
        if (loginReqResponse.ok) {
          const loginReqData = await loginReqResponse.json();
          setLoginRequests(loginReqData.requests || []);
        }
      } catch (err) {
        console.error('Error fetching login requests:', err);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleApproveLoginRequest = async (requestId: string) => {
    setProcessingLoginRequest(requestId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/login-requests/${requestId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        }
      );
      if (response.ok) {
        setLoginRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('Login request approved');
      } else {
        const data = await response.json();
        console.error('Failed to approve login request:', data);
        toast.error('Failed to approve login request');
      }
    } catch (error) {
      console.error('Error approving login request:', error);
      toast.error('Network error approving request');
    } finally {
      setProcessingLoginRequest(null);
    }
  };

  const handleDismissLoginRequest = async (requestId: string) => {
    setProcessingLoginRequest(requestId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/login-requests/${requestId}/dismiss`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        }
      );
      if (response.ok) {
        setLoginRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('Login request dismissed');
      } else {
        toast.error('Failed to dismiss login request');
      }
    } catch (error) {
      console.error('Error dismissing login request:', error);
      toast.error('Network error dismissing request');
    } finally {
      setProcessingLoginRequest(null);
    }
  };

  // Auto-archive previous month's changes on first load
  const hasAutoArchived = useRef(false);
  const autoArchivePreviousMonth = async () => {
    if (hasAutoArchived.current) return;
    hasAutoArchived.current = true;
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/booking-changes/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({ before: firstOfMonth }),
      });
    } catch (error) {
      console.error('Auto-archive error:', error);
    }
  };

  const fetchBookingChanges = async (archived = false) => {
    try {
      // Silently archive last month's changes before first fetch
      if (!archived) await autoArchivePreviousMonth();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/booking-changes?limit=200&archived=${archived}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
      });
      if (response.ok) {
        const data = await response.json();
        setBookingChanges(data.changes || []);
      }
    } catch (error) {
      console.error('Error fetching booking changes:', error);
    }
  };

  const handleArchiveChanges = async () => {
    setIsArchiving(true);
    try {
      // Archive everything older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/booking-changes/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({ before: sevenDaysAgo }),
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(`Archived ${result.archivedCount || 0} changes`);
        await fetchBookingChanges(false);
      }
    } catch (error) {
      console.error('Error archiving changes:', error);
      toast.error('Failed to archive changes');
    } finally {
      setIsArchiving(false);
    }
  };

  // Group booking changes by date category
  const groupChangesByDate = (changes: BookingChange[]) => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Skopje' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Europe/Skopje' });
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const groups: { label: string; items: BookingChange[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Last 7 Days', items: [] },
    ];

    for (const change of changes) {
      const changeDate = new Date(change.createdAt).toLocaleDateString('en-CA', { timeZone: 'Europe/Skopje' });
      if (changeDate === todayStr) {
        groups[0].items.push(change);
      } else if (changeDate === yesterdayStr) {
        groups[1].items.push(change);
      } else {
        groups[2].items.push(change);
      }
    }

    return groups.filter(g => g.items.length > 0);
  };

  // Convert "M-D" format to "YYYY-MM-DD" for backend
  const convertToISODate = (dateKey: string): string => {
    const [month, day] = dateKey.split('-').map(Number);
    const year = getSkopjeTime().getFullYear();
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

    // Prevent setting past dates to live
    if (newStatus === 'live') {
      const [m, d] = dateKey.split('-').map(Number);
      const now = getSkopjeTime();
      const dateToCheck = new Date(now.getFullYear(), m - 1, d, 23, 59, 59);
      if (dateToCheck < now) {
        toast.error('Cannot set a past date to live');
        return;
      }
    }

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
    const todayKey = formatDateKeyLegacy(getSkopjeTime());
    if (!selectedDate) {
      setSelectedDate(todayKey);
    }
  }, []);

  // Slot management handlers
  const handleSaveSlot = async (slotId: string) => {
    if (!selectedDate) return;
    const isoDate = convertToISODate(selectedDate);

    // Capture values before resetting state
    const saveTime = editingTime;
    const saveCapacity = editingCapacity;
    const saveClassType = editingClassType;

    // Optimistic: update local state instantly
    const prevSlots = [...customSlots];
    setCustomSlots(prev => prev.map(s =>
      s.id === slotId ? { ...s, start_time: saveTime, max_capacity: saveCapacity, class_type: saveClassType } : s
    ));
    setEditingSlotId(null);
    setEditingTime('');
    setEditingCapacity(4);
    setEditingClassType('group');

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
          body: JSON.stringify({ startTime: saveTime, maxCapacity: saveCapacity, date: isoDate, classType: saveClassType }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to update slot');
        setCustomSlots(prevSlots); // Revert
      }
    } catch (error) {
      console.error('Error saving slot:', error);
      setCustomSlots(prevSlots); // Revert
    }
  };

  const handleDeleteSlot = (slotId: string, slotTime?: string, bookingCount?: number) => {
    if (!selectedDate) return;

    const hasBookings = bookingCount && bookingCount > 0;
    const title = hasBookings ? 'Cancel Class & Remove Slot' : 'Remove Time Slot';
    const message = hasBookings
      ? `This will cancel ${bookingCount} booking(s), restore session credits, notify users by email, and remove the time slot.`
      : 'Are you sure you want to remove this time slot?';

    showConfirm(title, message, async () => {
      const isoDate = convertToISODate(selectedDate);

      // If there are bookings, cancel them first
      if (hasBookings && slotTime) {
        try {
          const cancelResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/cancel-class`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
                'X-Session-Token': getSessionToken(),
              },
              body: JSON.stringify({ date: isoDate, timeSlot: slotTime }),
            }
          );
          if (!cancelResponse.ok) {
            const data = await cancelResponse.json();
            toast.error(data.error || 'Failed to cancel bookings');
            return;
          }
          await fetchBookings();
        } catch (error) {
          console.error('Error cancelling class:', error);
          toast.error('Failed to cancel bookings');
          return;
        }
      }

      // Optimistic: remove from local state instantly
      const prevSlots = [...customSlots];
      setCustomSlots(prev => prev.filter(s => s.id !== slotId));

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
        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || 'Failed to delete slot');
          setCustomSlots(prevSlots); // Revert
        } else {
          toast.success(hasBookings ? 'Class cancelled and slot removed' : 'Slot removed');
        }
      } catch (error) {
        console.error('Error deleting slot:', error);
        setCustomSlots(prevSlots); // Revert
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
          body: JSON.stringify({
            date: isoDate,
            startTime: newSlotTime,
            maxCapacity: newSlotClassType === 'group' ? 4 : 1,
            classType: newSlotClassType,
          }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        // Optimistic: add to local state instantly
        if (data.slot) {
          setCustomSlots(prev => [...prev, data.slot].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
        } else {
          // Fallback: refetch if no slot returned
          await fetchSlotsForDate(selectedDate);
        }
        setIsAddingSlot(false);
        setNewSlotTime('');
        setNewSlotCapacity(4);
        setNewSlotClassType('group');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to add slot');
      }
    } catch (error) {
      console.error('Error adding slot:', error);
    }
    setSlotLoading(false);
  };

  const handleSendReengagement = async (emails: string[]) => {
    try {
      setIsSendingReengagement(true);
      setReengagementStatus(null);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/archived-users/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': getSessionToken(),
        },
        body: JSON.stringify({ emails }),
      });

      const data = await response.json();

      if (!response.ok) {
        setReengagementStatus({ type: 'error', message: data.error || 'Failed to send emails' });
        return;
      }

      const { summary } = data;

      if (summary.failed > 0) {
        setReengagementStatus({
          type: 'error',
          message: `Failed to send ${summary.failed} of ${summary.total} email(s).`
        });
      } else {
        setReengagementStatus({
          type: 'success',
          message: `Sent ${summary.successful} email${summary.successful > 1 ? 's' : ''} successfully!`
        });
      }

      setSelectedArchivedUsers([]);
      setTimeout(() => setReengagementStatus(null), 7000);
    } catch (error) {
      setReengagementStatus({ type: 'error', message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsSendingReengagement(false);
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
    { time: '11:00 - 11:50', maxCapacity: 4 },
    { time: '17:00 - 17:50', maxCapacity: 4 },
    { time: '18:00 - 18:50', maxCapacity: 4 },
    { time: '19:00 - 19:50', maxCapacity: 4 },
    { time: '20:00 - 20:50', maxCapacity: 4 },
  ];

  const maxDailyCapacity = timeSlots.length * 4; // 7 slots × 4 capacity = 28 max bookings per day

  const activeStatuses = ['pending', 'confirmed', 'attended'];

  const getBookingsForDate = (dateKey: string) => {
    // Convert legacy "M-D" format to ISO "YYYY-MM-DD" for comparison
    const isoDateKey = convertToISODate(dateKey);
    return bookings.filter(booking => {
      // Handle both formats: legacy "M-D" and ISO "YYYY-MM-DD"
      return (booking.dateKey === dateKey || booking.dateKey === isoDateKey) &&
        activeStatuses.includes(booking.status);
    });
  };

  const getBookingsForTimeSlot = (dateKey: string, timeSlot: string) => {
    // Extract start time from "09:00 - 10:00" format to match API's "09:00" format
    const startTime = timeSlot.split(' - ')[0];
    // Convert legacy "M-D" format to ISO "YYYY-MM-DD" for comparison
    const isoDateKey = convertToISODate(dateKey);
    return bookings.filter(booking =>
      (booking.dateKey === dateKey || booking.dateKey === isoDateKey) &&
      booking.timeSlot === startTime &&
      activeStatuses.includes(booking.status)
    );
  };

  const getSlotOccupancy = (dateKey: string, timeSlot: string) => {
    const slotBookings = getBookingsForTimeSlot(dateKey, timeSlot);
    const seatsOccupied = slotBookings.reduce((total, booking) => {
      if (booking.serviceType === 'duo') return total + 2;
      if (booking.serviceType === 'individual') return total + 4;
      return total + 1;
    }, 0);
    const hasPrivateSession = slotBookings.some(
      (b) => b.serviceType === 'individual' || b.serviceType === 'duo'
    );
    return { bookingCount: slotBookings.length, seatsOccupied, hasPrivateSession };
  };

  const isUserArchived = (user: User): boolean => {
    const terminalStatuses = ['fully_used', 'expired', 'cancelled'];
    const packages = user.packages || [];
    if (packages.length === 0) {
      // No packages: archive if user was confirmed (completed their service)
      return user.status === 'confirmed';
    }
    // Archived if ALL packages are in a terminal state
    return packages.every(p => terminalStatuses.includes(p.status));
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
        toast.error(data.error || 'Failed to update payment status');
        fetchBookings();
        setPaymentUpdatingEmail(null);
        return;
      }

      // Show toast based on what happened
      if (paymentStatus === 'paid') {
        if (data.emailType === 'password_setup') {
          toast.success('Paid & login email sent!');
        } else if (data.emailType === 'payment_confirmation') {
          toast.success('Paid & confirmation email sent!');
        } else {
          toast.success('Payment status updated to paid');
        }
      }

      // Refresh bookings from backend to get updated state
      await fetchBookings();
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Failed to update payment status');
      fetchBookings();
    } finally {
      setPaymentUpdatingEmail(null);
    }
  };

  const updatePackagePayment = async (packageId: string, paymentStatus: 'paid' | 'unpaid') => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/packages/${packageId}/payment`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-Session-Token': getSessionToken(),
          },
          body: JSON.stringify({ paymentStatus }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      if (paymentStatus === 'paid') {
        if (data.emailType === 'password_setup') {
          toast.success('Paid & login email sent!');
        } else if (data.emailType === 'payment_confirmation') {
          toast.success('Paid & confirmation email sent!');
        } else {
          toast.success('Package marked as paid');
        }
      } else {
        toast.success('Package marked as unpaid');
      }
      await fetchBookings();
    } catch (error: any) {
      console.error('Error updating package payment:', error);
      toast.error(error.message || 'Failed to update payment');
    }
  };

  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);

  const handleRemovePackage = async (packageId: string, userEmail: string) => {
    if (!confirm('Remove this unpaid package? Any linked reservations will also be deleted.')) return;
    setDeletingPackageId(packageId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/packages/${packageId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'X-Session-Token': getSessionToken(),
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      toast.success(`Package removed${data.deletedReservations > 0 ? ` (${data.deletedReservations} reservations deleted)` : ''}`);
      await fetchBookings();
    } catch (error: any) {
      console.error('Error removing package:', error);
      toast.error(error.message || 'Failed to remove package');
    } finally {
      setDeletingPackageId(null);
    }
  };

  const openDeleteDialog = (user: User) => {
    setDeleteDialog({ open: true, user, confirmText: '', isDeleting: false });
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

  // Handle delete user
  const handleDeleteUser = async () => {
    if (!deleteDialog?.user || deleteDialog.confirmText.toLowerCase() !== 'delete') return;

    setDeleteDialog(prev => prev ? { ...prev, isDeleting: true } : null);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/users/${encodeURIComponent(deleteDialog.user.email)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Session-Token': getSessionToken(),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (handleSessionError(data.error)) return;
        toast.error(`Failed to delete user: ${data.error || 'Unknown error'}`);
        return;
      }

      // Remove user from local state
      setUsers(prevUsers => prevUsers.filter(u => u.email !== deleteDialog.user!.email));
      setExpandedUserId(null);
      toast.success(`${deleteDialog.user.name} ${deleteDialog.user.surname} deleted successfully`);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Network error. Please check your connection.');
    } finally {
      setDeleteDialog(null);
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

    // Optimistic update
    const previousBookings = bookings;
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, status: newStatus as UserStatus } : b
    ));

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
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to update booking status:', response.status, errorData);
        toast.error('Failed to update booking status. Please try again.');
        setBookings(previousBookings);
      }
    } catch (error) {
      console.error('❌ Error updating booking status:', error);
      setBookings(previousBookings);
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

        // Optimistic update
        const previousBookings = bookings;
        setBookings(prev => prev.filter(b => b.id !== bookingId));
        toast.success(`${userName} removed from class. Session credit restored.`);

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
          if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Failed to remove from class:', response.status, errorData);
            toast.error('Failed to remove user from class. Please try again.');
            setBookings(previousBookings);
          }
        } catch (error) {
          console.error('❌ Error removing from class:', error);
          toast.error('Network error. Please check your connection.');
          setBookings(previousBookings);
        } finally {
          setProcessingBookingId(null);
        }
      }
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#f5f0ed]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="bg-[#F5F0EE] shadow-sm px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-8 h-8" />
          <div>
            <h1 className="text-base font-semibold text-[#3d2f28]">Admin Panel</h1>
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
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="bg-[#F5F0EE] border-b border-[#e8dfd8] px-4"
      >
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
              activeTab === 'calendar'
                ? 'text-[#6b5949] border-b-2 border-[#6b5949] font-medium'
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
                ? 'text-[#6b5949] border-b-2 border-[#6b5949] font-medium'
                : 'text-[#8b7764] hover:text-[#6b5949]'
            }`}
          >
            <Users className="w-4 h-4" />
            Users
            {loginRequests.length > 0 && (
              <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                {loginRequests.length}
              </span>
            )}
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 bg-stone-50"
      >
        {activeTab === 'calendar' ? (
          <div className="space-y-4">
            {/* Date Selection - Clean Week Strip */}
            <div className="bg-[#F5F0EE] rounded-xl p-3 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
                {dates.map((date) => {
                  const dayBookings = getBookingsForDate(date.dateKey);
                  const daySeatsOccupied = dayBookings.reduce((total, booking) => {
                    if (booking.serviceType === 'duo') return total + 2;
                    if (booking.serviceType === 'individual') return total + 4;
                    return total + 1;
                  }, 0);
                  const isSelected = selectedDate === date.dateKey;
                  const todayKey = formatDateKeyLegacy(getSkopjeTime());
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
                          {daySeatsOccupied}/{maxDailyCapacity}
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
                    const slotBookings = getBookingsForTimeSlot(selectedDate, timeSlotKey);
                    const { bookingCount, seatsOccupied, hasPrivateSession } = getSlotOccupancy(selectedDate, timeSlotKey);
                    const effectiveSeats = hasPrivateSession ? (slot.max_capacity || 4) : seatsOccupied;
                    const isSelected = selectedTimeSlot === timeSlotKey;
                    const hasPaidBooking = slotBookings.some((b: any) => b.paymentStatus === 'paid');
                    const hasUnpaidBooking = slotBookings.some((b: any) => b.paymentStatus !== 'paid');
                    const hasBookings = bookingCount > 0;

                    // Status dot color: green=paid, amber=unpaid, stone=empty
                    let dotColor = 'bg-stone-300'; // empty
                    if (hasPaidBooking) dotColor = 'bg-green-500';
                    else if (hasUnpaidBooking) dotColor = 'bg-amber-500';

                    const isEditingThis = editingSlotId === slot.id;

                    const classTypeColors: Record<string, string> = {
                      group: '#22c55e',
                      individual: '#f97316',
                      duo: '#a855f7',
                    };
                    const classTypeLabels: Record<string, string> = {
                      group: 'Multipack',
                      individual: 'Individual',
                      duo: 'DUO',
                    };
                    const slotClassType = slot.class_type || 'group';
                    const slotBorderColor = classTypeColors[slotClassType] || classTypeColors.group;

                    // Quick class type change — optimistic UI update
                    const handleSetClassType = (newType: string, e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (newType === slotClassType) return;
                      const newCapacity = newType === 'group' ? 4 : 1;
                      const isoDate = convertToISODate(selectedDate!);

                      // Abort any in-flight request for this slot
                      if (classTypeAbortRef.current[slot.id]) {
                        classTypeAbortRef.current[slot.id].abort();
                      }
                      const controller = new AbortController();
                      classTypeAbortRef.current[slot.id] = controller;

                      // Snapshot current state before optimistic update (for revert)
                      const prevClassType = slotClassType;
                      const prevCapacity = slot.max_capacity;

                      // Instant local update
                      setCustomSlots(prev => prev.map(s =>
                        s.id === slot.id ? { ...s, class_type: newType, max_capacity: newCapacity } : s
                      ));

                      // Save in background
                      fetch(
                        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/admin/slots/${slot.id}`,
                        {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${publicAnonKey}`,
                            'X-Session-Token': getSessionToken(),
                          },
                          body: JSON.stringify({ classType: newType, maxCapacity: newCapacity, date: isoDate }),
                          signal: controller.signal,
                        }
                      ).then(async (response) => {
                        if (!response.ok) {
                          const data = await response.json();
                          toast.error(data.error || 'Failed to change class type');
                          // Revert on error
                          setCustomSlots(prev => prev.map(s =>
                            s.id === slot.id ? { ...s, class_type: prevClassType, max_capacity: prevCapacity } : s
                          ));
                        }
                      }).catch((err) => {
                        if (err.name === 'AbortError') return; // Superseded by newer request
                        // Revert on network error
                        setCustomSlots(prev => prev.map(s =>
                          s.id === slot.id ? { ...s, class_type: prevClassType, max_capacity: prevCapacity } : s
                        ));
                      });
                    };

                    return (
                      <div key={slot.id}>
                        <div
                          className={`
                            w-full flex items-center gap-3 px-4 py-3 min-h-[52px]
                            border-l-4 transition-all
                            ${isSelected ? 'bg-stone-50' : 'hover:bg-stone-50'}
                          `}
                          style={{ borderLeftColor: slotBorderColor }}
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
                                onClick={() => { setEditingSlotId(null); setEditingTime(''); setEditingCapacity(4); setEditingClassType('group'); }}
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
                                    setEditingClassType(slot.class_type || 'group');
                                  } else {
                                    // Normal mode: toggle expanded bookings view
                                    setSelectedTimeSlot(isSelected ? null : timeSlotKey);
                                  }
                                }}
                                className="flex items-center gap-3 flex-1"
                              >
                                <span className="text-sm font-medium text-stone-800 w-12">{slotTime}</span>
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: slotBorderColor + '20',
                                    color: slotBorderColor,
                                  }}
                                >
                                  {classTypeLabels[slotClassType] || 'Multipack'}
                                </span>
                                <div className="flex-1 text-left">
                                  <span className="text-sm text-stone-600">
                                    {bookingCount === 0 ? 'Available' : `${bookingCount} booked`}
                                  </span>
                                </div>
                                <span className="text-sm text-stone-400">{effectiveSeats}/{slot.max_capacity || 4}</span>
                              </button>

                              {/* Delete button - always visible in edit mode, cancels bookings first if needed */}
                              {isEditMode && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteSlot(slot.id, slotTime, bookingCount); }}
                                  className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                                  title={hasBookings ? `Cancel ${bookingCount} booking(s) & remove slot` : 'Remove slot'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Class type selector - shown in edit mode */}
                        {isEditMode && !isEditingThis && (
                          <div className="flex items-center gap-1.5 px-4 py-2 bg-stone-50/80 border-t border-stone-100">
                            <span className="text-[10px] text-stone-400 mr-1">Type:</span>
                            {(['group', 'individual', 'duo'] as const).map((type) => {
                              const isActive = slotClassType === type;
                              const color = classTypeColors[type];
                              return (
                                <button
                                  key={type}
                                  onClick={(e) => handleSetClassType(type, e)}
                                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all ${
                                    isActive
                                      ? 'ring-2 ring-offset-1 shadow-sm scale-105'
                                      : 'opacity-40 hover:opacity-70'
                                  }`}
                                  style={{
                                    backgroundColor: color + (isActive ? '25' : '10'),
                                    color: color,
                                    ['--tw-ring-color' as any]: isActive ? color : 'transparent',
                                  }}
                                >
                                  {classTypeLabels[type]}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Expanded bookings */}
                        {isSelected && bookingCount > 0 && (
                          <div className="px-4 pb-3 space-y-2 bg-stone-50">
                            {slotBookings.map((booking) => {
                              const baseCount = booking.selectedPackage === 'package8' || booking.selectedPackage === '8classes' || booking.selectedPackage === 'duo8classes' ? 8
                                : booking.selectedPackage === 'package10' ? 10
                                : booking.selectedPackage === 'package12' || booking.selectedPackage === '12classes' || booking.selectedPackage === 'duo12classes' ? 12
                                : booking.selectedPackage === '1class' || booking.selectedPackage === 'duo1class' ? 1 : 0;
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
                                      {booking.isFriendBooking && (
                                        <span className="ml-1 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">+Friend</span>
                                      )}
                                    </span>
                                    {/* Payment Badge */}
                                    {isPaid ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPaymentUpdatingEmail(booking.email);
                                          (booking.packageId
                                            ? updatePackagePayment(booking.packageId, 'unpaid')
                                            : updatePaymentStatus(booking.email, 'unpaid')
                                          ).finally(() => setPaymentUpdatingEmail(null));
                                        }}
                                        disabled={isUpdatingPayment}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-green-700 bg-green-100 border border-green-300 hover:bg-green-200 transition-colors disabled:opacity-50 cursor-pointer"
                                      >
                                        {isUpdatingPayment ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <CheckCircle className="w-3.5 h-3.5" />
                                        )}
                                        Paid
                                      </button>
                                    ) : (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPaymentUpdatingEmail(booking.email);
                                          (booking.packageId
                                            ? updatePackagePayment(booking.packageId, 'paid')
                                            : updatePaymentStatus(booking.email, 'paid')
                                          ).finally(() => setPaymentUpdatingEmail(null));
                                        }}
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
                      <div className="px-4 py-3 bg-stone-50">
                        {/* Class Type Selector */}
                        <div className="flex gap-2 mb-3">
                          {[
                            { type: 'group' as const, label: 'Multipack', color: '#22c55e' },
                            { type: 'individual' as const, label: 'Individual', color: '#f97316' },
                            { type: 'duo' as const, label: 'DUO', color: '#a855f7' },
                          ].map((ct) => (
                            <button
                              key={ct.type}
                              onClick={() => setNewSlotClassType(ct.type)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                                newSlotClassType === ct.type
                                  ? 'text-white'
                                  : 'opacity-50 hover:opacity-75'
                              }`}
                              style={{
                                borderColor: ct.color,
                                backgroundColor: newSlotClassType === ct.type ? ct.color : 'transparent',
                                color: newSlotClassType === ct.type ? '#fff' : ct.color,
                              }}
                            >
                              {ct.label}
                              <span className="block text-[10px] opacity-75">
                                {ct.type === 'group' ? '4 spots' : '1 spot'}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-stone-300" />
                          <input
                            type="time"
                            value={newSlotTime}
                            onChange={(e) => setNewSlotTime(e.target.value)}
                            className="border border-stone-300 rounded px-2 py-1 w-24 text-sm"
                            autoFocus
                          />
                          <span className="text-xs text-stone-500">
                            {newSlotClassType === 'group' ? 'Cap: 4' : 'Cap: 1'}
                          </span>
                          <button
                            onClick={handleAddSlot}
                            disabled={slotLoading || !newSlotTime}
                            className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            {slotLoading ? 'Adding...' : 'Add'}
                          </button>
                          <button
                            onClick={() => { setIsAddingSlot(false); setNewSlotTime(''); setNewSlotCapacity(4); setNewSlotClassType('group'); }}
                            className="text-sm text-stone-500 hover:text-stone-700"
                          >
                            Cancel
                          </button>
                        </div>
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
          {/* Recent Changes Section */}
          <div className="mt-4">
            <button
              onClick={() => setShowChanges(!showChanges)}
              className="flex items-center gap-2 w-full bg-[#F5F0EE] rounded-lg px-4 py-3 text-sm font-medium text-[#3d2f28] hover:bg-[#ede5df] transition-colors"
            >
              <Clock className="w-4 h-4 text-[#8b7764]" />
              <span>Changes</span>
              {changesView === 'recent' && bookingChanges.length > 0 && (
                <span className="bg-[#c96442] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {bookingChanges.length}
                </span>
              )}
              <span className="ml-auto">
                {showChanges ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {showChanges && (
              <div className="bg-[#F5F0EE] rounded-b-lg border-t border-[#e8dfd8]">
                {/* Tab bar: Recent / Archive */}
                <div className="flex items-center border-b border-[#e8dfd8]">
                  <button
                    onClick={() => setChangesView('recent')}
                    className={`flex-1 text-xs font-medium py-2 text-center transition-colors ${
                      changesView === 'recent'
                        ? 'text-[#3d2f28] border-b-2 border-[#c96442]'
                        : 'text-[#8b7764] hover:text-[#6b5949]'
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    onClick={() => setChangesView('archive')}
                    className={`flex-1 text-xs font-medium py-2 text-center transition-colors ${
                      changesView === 'archive'
                        ? 'text-[#3d2f28] border-b-2 border-[#c96442]'
                        : 'text-[#8b7764] hover:text-[#6b5949]'
                    }`}
                  >
                    Archive
                  </button>
                  {changesView === 'recent' && bookingChanges.length > 0 && (
                    <button
                      onClick={handleArchiveChanges}
                      disabled={isArchiving}
                      className="text-xs font-medium text-[#8b7764] hover:text-[#6b5949] disabled:opacity-50 transition-colors px-3"
                    >
                      {isArchiving ? 'Archiving...' : 'Archive old'}
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                {bookingChanges.length === 0 ? (
                  <p className="text-sm text-stone-500 text-center py-4">
                    {changesView === 'archive' ? 'No archived changes' : 'No recent changes'}
                  </p>
                ) : changesView === 'archive' ? (
                  /* Archive view: flat list */
                  <div className="divide-y divide-[#e8dfd8]">
                    {bookingChanges.map((change) => (
                      <div key={change.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          change.changeType === 'cancelled' || change.changeType === 'class_cancelled'
                            ? 'bg-red-500'
                            : change.changeType === 'session_correction'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#3d2f28]">
                              {change.userName} {change.userSurname}
                            </span>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              change.changeType === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : change.changeType === 'class_cancelled'
                                ? 'bg-red-100 text-red-700'
                                : change.changeType === 'session_correction'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {change.changeType === 'cancelled' ? 'Cancelled'
                                : change.changeType === 'class_cancelled' ? 'Class Cancelled'
                                : change.changeType === 'session_correction' ? 'Session Correction'
                                : 'Rescheduled'}
                            </span>
                          </div>
                          <div className="text-xs text-[#8b7764] mt-1">
                            {change.changeType === 'session_correction' ? (
                              <span>
                                Sessions: <span className="line-through">{change.newDateKey}</span>
                                {' → '}
                                <span className="font-medium text-[#3d2f28]">{change.newTimeSlot}</span>
                                {' '}(corrected for {change.oldDateKey} at {change.oldTimeSlot})
                              </span>
                            ) : change.changeType === 'cancelled' || change.changeType === 'class_cancelled' ? (
                              <span>{change.oldDateKey} at {change.oldTimeSlot}</span>
                            ) : (
                              <span>
                                <span className="line-through">{change.oldDateKey} {change.oldTimeSlot}</span>
                                {' → '}
                                <span className="font-medium text-[#3d2f28]">{change.newDateKey} {change.newTimeSlot}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-[#8b7764] flex-shrink-0 whitespace-nowrap">
                          {new Date(change.createdAt).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            timeZone: 'Europe/Skopje'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Recent view: grouped by Today / Yesterday / Last 7 Days */
                  <div>
                    {groupChangesByDate(bookingChanges).map((group) => (
                      <div key={group.label}>
                        <div className="px-4 py-2 bg-[#ede5df] sticky top-0 z-10">
                          <span className="text-xs font-semibold text-[#6b5949] uppercase tracking-wide">
                            {group.label}
                          </span>
                          <span className="text-xs text-[#8b7764] ml-2">({group.items.length})</span>
                        </div>
                        <div className="divide-y divide-[#e8dfd8]">
                          {group.items.map((change) => (
                            <div key={change.id} className="px-4 py-3 flex items-start gap-3">
                              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                change.changeType === 'cancelled' || change.changeType === 'class_cancelled'
                                  ? 'bg-red-500'
                                  : change.changeType === 'session_correction'
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-[#3d2f28]">
                                    {change.userName} {change.userSurname}
                                  </span>
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    change.changeType === 'cancelled'
                                      ? 'bg-red-100 text-red-700'
                                      : change.changeType === 'class_cancelled'
                                      ? 'bg-red-100 text-red-700'
                                      : change.changeType === 'session_correction'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {change.changeType === 'cancelled' ? 'Cancelled'
                                      : change.changeType === 'class_cancelled' ? 'Class Cancelled'
                                      : change.changeType === 'session_correction' ? 'Session Correction'
                                      : 'Rescheduled'}
                                  </span>
                                  {change.packageType && (
                                    <span className="text-xs text-[#8b7764]">{change.packageType}</span>
                                  )}
                                </div>
                                <div className="text-xs text-[#8b7764] mt-1">
                                  {change.changeType === 'session_correction' ? (
                                    <span>
                                      Sessions: <span className="line-through">{change.newDateKey}</span>
                                      {' → '}
                                      <span className="font-medium text-[#3d2f28]">{change.newTimeSlot}</span>
                                      {' '}(corrected for {change.oldDateKey} at {change.oldTimeSlot})
                                    </span>
                                  ) : change.changeType === 'cancelled' || change.changeType === 'class_cancelled' ? (
                                    <span>{change.oldDateKey} at {change.oldTimeSlot}</span>
                                  ) : (
                                    <span>
                                      <span className="line-through">{change.oldDateKey} {change.oldTimeSlot}</span>
                                      {' → '}
                                      <span className="font-medium text-[#3d2f28]">{change.newDateKey} {change.newTimeSlot}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-[#8b7764] flex-shrink-0 whitespace-nowrap">
                                {new Date(change.createdAt).toLocaleString('en-GB', {
                                  hour: '2-digit', minute: '2-digit',
                                  timeZone: 'Europe/Skopje'
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="bg-[#F5F0EE] rounded-lg shadow-sm">
              {/* User Database Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
                <h2 className="text-base font-medium text-[#3d2f28]">User Database</h2>
                <p className="text-sm text-[#8b7764]">Total users: {users.length}</p>
              </div>

              {/* Login Requests Notification */}
              {loginRequests.length > 0 && (
                <div className="mx-4 mt-3 mb-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">{loginRequests.length}</span>
                    <span className="text-sm font-medium text-amber-800">Login Requests</span>
                  </div>
                  <div className="space-y-2">
                    {loginRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-amber-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#3d2f28] truncate">{req.name} {req.surname}</p>
                          <p className="text-xs text-[#8b7764] truncate">{req.email}</p>
                          <p className="text-xs text-amber-600">
                            {req.package ? `${req.package.package_type} - ${req.paymentStatus}` : 'No package'}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button
                            onClick={() => handleApproveLoginRequest(req.id)}
                            disabled={processingLoginRequest === req.id}
                            className="px-2 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                          >
                            {processingLoginRequest === req.id ? '...' : 'Send Login'}
                          </button>
                          <button
                            onClick={() => handleDismissLoginRequest(req.id)}
                            disabled={processingLoginRequest === req.id}
                            className="px-2 py-1 bg-stone-300 text-stone-700 rounded text-xs font-medium hover:bg-stone-400 disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Filter Bar */}
              <div className="flex gap-1.5 mb-4 bg-stone-100 rounded-lg p-1 overflow-x-auto mx-4">
                {([
                  { key: 'all' as const, label: 'All' },
                  { key: 'needs_attention' as const, label: '\u25CF Needs Attention' },
                  { key: 'active' as const, label: 'Active' },
                  { key: 'inactive' as const, label: 'Inactive' },
                ]).map(tab => {
                  const count = users.filter(u => {
                    if (tab.key === 'all') return true;
                    if (tab.key === 'needs_attention') return u.flag === 'new_user';
                    if (tab.key === 'active') return u.flag === 'active';
                    if (tab.key === 'inactive') return u.flag === 'inactive';
                    return true;
                  }).length;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setUserFilter(tab.key)}
                      className={`flex-1 min-w-fit py-2 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                        userFilter === tab.key
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-500 hover:text-stone-700'
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Archived Users Bulk Email Bar */}
              {userFilter === 'inactive' && (
                <div className="px-4 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-sm text-[#6b5949]">
                      <input
                        type="checkbox"
                        checked={selectedArchivedUsers.length === users.filter(u => isUserArchived(u)).length && users.filter(u => isUserArchived(u)).length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedArchivedUsers(users.filter(u => isUserArchived(u)).map(u => u.email));
                          } else {
                            setSelectedArchivedUsers([]);
                          }
                        }}
                        className="w-4 h-4"
                      />
                      Select all
                    </label>
                    {selectedArchivedUsers.length > 0 && (
                      <button
                        onClick={() => handleSendReengagement(selectedArchivedUsers)}
                        disabled={isSendingReengagement}
                        className="flex items-center gap-2 bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white px-4 py-2 rounded-lg text-sm hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        {isSendingReengagement ? 'Sending...' : `Send ${selectedArchivedUsers.length} Email${selectedArchivedUsers.length > 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                  {reengagementStatus && (
                    <div className={`p-3 rounded-lg mb-2 ${
                      reengagementStatus.type === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      <p className="text-sm">{reengagementStatus.message}</p>
                    </div>
                  )}
                </div>
              )}

              {/* User List */}
              <div className="p-4 space-y-2">
                {(() => {
                  const filtered = users.filter(u => {
                    if (userFilter === 'all') return true;
                    if (userFilter === 'needs_attention') return u.flag === 'new_user';
                    if (userFilter === 'active') return u.flag === 'active';
                    if (userFilter === 'inactive') return u.flag === 'inactive';
                    return true;
                  }).sort((a, b) => {
                    const nameA = `${a.name} ${a.surname}`.toLowerCase();
                    const nameB = `${b.name} ${b.surname}`.toLowerCase();
                    return nameA.localeCompare(nameB);
                  });

                  // Group by first letter (supports Latin + Cyrillic)
                  const grouped: Record<string, User[]> = {};
                  for (const u of filtered) {
                    const letter = (u.name || '?')[0].toUpperCase();
                    if (!grouped[letter]) grouped[letter] = [];
                    grouped[letter].push(u);
                  }
                  const letters = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

                  let globalIndex = 0;
                  return letters.map(letter => (
                    <div key={letter}>
                      <div className="sticky top-0 z-10 bg-[#f0ebe7] px-2 py-1.5 -mx-4 px-4 text-[11px] font-bold text-[#6b5949] uppercase tracking-wider">
                        {letter}
                      </div>
                      {grouped[letter].map((user) => {
                        const userIndex = globalIndex++;
                    const isExpanded = expandedUserId === user.id;
                    const baseSessionCount = user.packageType === 'package8' || user.packageType === '8classes' || user.packageType === 'duo8classes' ? 8
                      : user.packageType === 'package10' ? 10
                      : user.packageType === 'package12' || user.packageType === '12classes' || user.packageType === 'duo12classes' ? 12
                      : 1;
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
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(userIndex * 0.03, 0.3) }}
                        className="border border-[#e8dfd8] rounded-lg overflow-hidden hover:border-[#6b5949] transition-colors"
                      >
                        {/* Compact View (Always Visible) */}
                        <div className="flex items-center">
                          {userFilter === 'inactive' && (
                            <div className="pl-3 flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={selectedArchivedUsers.includes(user.email)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedArchivedUsers([...selectedArchivedUsers, user.email]);
                                  } else {
                                    setSelectedArchivedUsers(selectedArchivedUsers.filter(email => email !== user.email));
                                  }
                                }}
                                className="w-4 h-4"
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSendReengagement([user.email]); }}
                                disabled={isSendingReengagement}
                                className="p-1.5 hover:bg-[#9ca571] hover:text-white rounded transition-colors disabled:opacity-50"
                                title="Send re-engagement email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                          className="w-full px-4 py-3 text-left hover:bg-[#f5f0ed] transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#3d2f28] font-medium flex items-center gap-1.5">
                              {user.flag === 'new_user' && (
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                              )}
                              {user.name} {user.surname}
                            </span>
                            <span className="text-xs text-[#8b7764] text-right">
                              {(() => {
                                const pkgs = user.packages || [];
                                const activeOrPending = pkgs.filter(p => p.status === 'active' || p.status === 'pending');
                                if (pkgs.length === 0) return 'No package';

                                const getPkgLabel = (type: string) =>
                                  type === 'single' ? 'Single'
                                  : type === '1class' || type === 'individual1' ? 'Individual'
                                  : type === 'duo1class' || type === 'duo1' ? 'DUO'
                                  : type === 'package8' || type === '8classes' || type === 'duo8classes' || type === 'individual8' ? '8-pack'
                                  : type === 'package10' ? '10-pack'
                                  : type === 'package12' || type === '12classes' || type === 'duo12classes' ? '12-pack'
                                  : type;

                                // Show active/pending packages, or fall back to most recent terminal package
                                const displayPkgs = activeOrPending.length > 0
                                  ? activeOrPending
                                  : [pkgs[pkgs.length - 1]];
                                const isTerminalOnly = activeOrPending.length === 0;

                                return displayPkgs.map((pkg, i) => {
                                  const label = getPkgLabel(pkg.type);
                                  const total = pkg.totalSessions || 0;
                                  const remaining = pkg.remainingSessions || 0;
                                  const statusLabel = pkg.status === 'fully_used' ? 'Done'
                                    : pkg.status === 'expired' ? 'Exp.'
                                    : pkg.status === 'cancelled' ? 'Canc.' : '';
                                  return (
                                    <span key={pkg.id || i} style={isTerminalOnly ? { opacity: 0.55 } : undefined}>
                                      {i > 0 && <>{' | '}</>}
                                      {label}
                                      {total > 0 && (
                                        <>
                                          {' · '}
                                          <span style={{ color: remaining > 0 ? '#7A8F3A' : '#dc2626' }}>
                                            {remaining}
                                          </span>
                                          /{total}
                                        </>
                                      )}
                                      {isTerminalOnly && statusLabel && (
                                        <span className="ml-1 text-[10px] text-[#8b7764]">({statusLabel})</span>
                                      )}
                                    </span>
                                  );
                                });
                              })()}
                            </span>
                          </div>
                        </button>
                        </div>

                        {/* Expanded View */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-[#e8dfd8] bg-[#f5f0ed] bg-opacity-50">
                            {/* Email & Phone */}
                            <div className="mt-3 mb-3 p-3 bg-[#F5F0EE] rounded-md space-y-2">
                              <div>
                                <p className="text-xs text-[#8b7764] mb-1">Email:</p>
                                <p className="text-sm text-[#3d2f28] break-all">{user.email}</p>
                              </div>
                              {user.mobile && (
                                <div>
                                  <p className="text-xs text-[#8b7764] mb-1">Phone:</p>
                                  <p className="text-sm text-[#3d2f28]">{formatPhone(user.mobile)}</p>
                                </div>
                              )}
                              {user.createdAt && (
                                <div>
                                  <p className="text-xs text-[#8b7764] mb-1">Created:</p>
                                  <p className="text-sm text-[#3d2f28]">{new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                              )}
                            </div>

                            {user.flagMessage && (
                              <p className="text-xs text-stone-500 mt-1 mb-3">
                                {user.flagMessage}
                              </p>
                            )}

                            {/* Delete User Button */}
                            <div className="flex justify-end mb-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(user);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete User
                              </button>
                            </div>

                            {/* All Packages */}
                            {(user.packages && user.packages.length > 0) ? user.packages.map((pkg, pkgIndex) => {
                              const pkgBaseCount = pkg.baseSessions || (
                                pkg.type === 'package8' || pkg.type === '8classes' || pkg.type === 'duo8classes' || pkg.type === 'individual8' ? 8
                                : pkg.type === 'package10' ? 10
                                : pkg.type === 'package12' || pkg.type === '12classes' || pkg.type === 'duo12classes' ? 12
                                : 1
                              );
                              const pkgBonus = pkg.bonusClasses || 0;
                              const pkgTotal = pkg.totalSessions || pkgBaseCount + pkgBonus;
                              const pkgRemaining = pkg.remainingSessions ?? 0;
                              const pkgUsed = pkgTotal - pkgRemaining;
                              const pkgNormalRemaining = Math.max(0, pkgBaseCount - Math.max(0, pkgUsed - pkgBonus));
                              const pkgBonusRemaining = Math.max(0, pkgBonus - Math.min(pkgUsed, pkgBonus));
                              const isPaid = pkg.paymentStatus === 'paid';
                              const isActive = pkg.status === 'active';
                              const isExpired = pkg.status === 'expired';
                              const isCancelled = pkg.status === 'cancelled';
                              const isFullyUsed = pkg.status === 'fully_used';

                              const pkgLabel = pkg.type === 'package8' || pkg.type === 'individual8' ? '8 Sessions'
                                : pkg.type === 'package10' ? '10 Sessions'
                                : pkg.type === 'package12' ? '12 Sessions'
                                : pkg.type === 'single' ? 'Single'
                                : pkg.type === '1class' || pkg.type === 'individual1' ? '1 Individual'
                                : pkg.type === '8classes' ? '8 Individual'
                                : pkg.type === '12classes' ? '12 Individual'
                                : pkg.type === 'duo1class' || pkg.type === 'duo1' ? '1 DUO'
                                : pkg.type === 'duo8classes' ? '8 DUO'
                                : pkg.type === 'duo12classes' ? '12 DUO'
                                : pkg.type;

                              // Compact single-line for terminal packages
                              if (isExpired || isCancelled || isFullyUsed) {
                                const startDate = pkg.purchaseDate ? new Date(pkg.purchaseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Skopje' }) : '';
                                const endDate = pkg.expiryDate ? new Date(pkg.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Skopje' }) : '';
                                return (
                                  <div key={pkg.id || pkgIndex} className="mb-1.5 px-3 py-1.5 rounded border bg-gray-50 border-gray-200 flex items-center justify-between text-xs text-[#8b7764]">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium text-[#3d2f28]">{pkgLabel}{pkgBonus > 0 ? ` +${pkgBonus}` : ''}</span>
                                      <span className="text-gray-300">·</span>
                                      <span>{pkgUsed}/{pkgTotal} used</span>
                                      {startDate && endDate && (
                                        <>
                                          <span className="text-gray-300">·</span>
                                          <span className="truncate">{startDate} – {endDate}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                      isExpired ? 'bg-red-100 text-red-600'
                                      : isCancelled ? 'bg-red-100 text-red-600'
                                      : 'bg-stone-100 text-stone-500'
                                    }`}>
                                      {isExpired ? 'Expired' : isCancelled ? 'Cancelled' : 'Completed'}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={pkg.id || pkgIndex} className={`mb-3 p-3 rounded-md border ${
                                  isPaid ? 'bg-green-50/50 border-green-200'
                                  : 'bg-amber-50/50 border-amber-200'
                                }`}>
                                  {/* Package header */}
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm text-[#3d2f28] font-medium">
                                      {pkgLabel}{pkgBonus > 0 ? ` + ${pkgBonus} Bonus` : ''}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPaymentUpdatingEmail(user.email);
                                        updatePackagePayment(pkg.id, isPaid ? 'unpaid' : 'paid').finally(() => setPaymentUpdatingEmail(null));
                                      }}
                                      disabled={paymentUpdatingEmail === user.email}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isPaid ? 'bg-green-100 text-green-700 hover:bg-amber-100 hover:text-amber-700'
                                        : 'bg-amber-100 text-amber-700 hover:bg-green-100 hover:text-green-700'
                                      }`}
                                      title={isPaid ? 'Click to mark as unpaid' : 'Click to mark as paid & activate'}
                                    >
                                      {paymentUpdatingEmail === user.email ? (
                                        <Loader2 className="w-3 h-3 animate-spin inline" />
                                      ) : (
                                        isPaid ? 'Paid' : 'Unpaid'
                                      )}
                                    </button>
                                      {!isPaid && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemovePackage(pkg.id, user.email);
                                          }}
                                          disabled={deletingPackageId === pkg.id}
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 active:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {deletingPackageId === pkg.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Remove package'}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Sessions bar */}
                                  {pkgBaseCount > 1 && (
                                    <>
                                      <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-[#3d2f28]">
                                          <span className="font-medium" style={{ color: pkgRemaining > 0 ? '#7A8F3A' : '#dc2626' }}>{pkgRemaining}</span> / {pkgTotal} remaining
                                        </span>
                                        <span className="text-[#8b7764]">Used: {pkgUsed}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <div className="flex" style={{ gap: '2px' }}>
                                          {Array.from({ length: pkgBaseCount }).map((_, i) => (
                                            <span
                                              key={`pkg-${pkgIndex}-normal-${i}`}
                                              style={{
                                                width: '14px', height: '10px', borderRadius: '3px', display: 'inline-block',
                                                backgroundColor: i < pkgNormalRemaining ? '#7A8F3A' : 'rgba(122,143,58,0.2)',
                                              }}
                                            />
                                          ))}
                                        </div>
                                        {pkgBonus > 0 && (
                                          <>
                                            <span style={{ display: 'inline-block', width: '6px' }} />
                                            <span style={{
                                              width: '14px', height: '10px', borderRadius: '3px', display: 'inline-block',
                                              backgroundColor: pkgBonusRemaining > 0 ? '#D8A93B' : 'rgba(216,169,59,0.2)',
                                            }} />
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}

                                  {/* Dates row */}
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[#8b7764]">
                                    {pkg.purchaseDate && (
                                      <span>Purchased: {new Date(pkg.purchaseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Skopje' })}</span>
                                    )}
                                    {pkg.activationDate && (
                                      <span>Activated: {new Date(pkg.activationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Skopje' })}</span>
                                    )}
                                    {pkg.expiryDate && (() => {
                                      const pkgDaysLeft = Math.ceil((new Date(pkg.expiryDate).getTime() - getSkopjeTime().getTime()) / (24 * 60 * 60 * 1000));
                                      return (
                                        <span>
                                          Expires: {new Date(pkg.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Skopje' })}
                                          {' '}
                                          <span style={{ color: pkgDaysLeft <= 0 ? '#dc2626' : pkgDaysLeft <= 5 ? '#dc2626' : pkgDaysLeft <= 10 ? '#e97a1f' : '#8b7764', fontWeight: 600 }}>
                                            ({pkgDaysLeft <= 0 ? 'expired' : `${pkgDaysLeft}d left`})
                                          </span>
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  {/* Upcoming reserved classes for this package */}
                                  {(() => {
                                    const now = getSkopjeTime();
                                    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    const upcoming = (user.reservations || [])
                                      .filter(r => r.packageId === pkg.id && r.reservationStatus === 'confirmed' && r.dateKey >= todayKey)
                                      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.timeSlot.localeCompare(b.timeSlot));
                                    if (upcoming.length === 0) return null;
                                    return (
                                      <div className="mt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b7764] mb-1">Upcoming classes</p>
                                        <div className="flex items-center gap-1.5">
                                        {upcoming.map(r => {
                                          const d = new Date(r.dateKey + 'T00:00:00');
                                          const day = d.getDate();
                                          const mon = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/Skopje' });
                                          return (
                                            <div key={r.id} className="flex flex-col items-center justify-center w-9 h-9 rounded-md bg-[#9ca571] text-white" title={`${r.dateKey} ${r.timeSlot}`}>
                                              <span className="text-[11px] font-bold leading-none">{day}</span>
                                              <span className="text-[7px] uppercase leading-none mt-0.5">{mon}</span>
                                            </div>
                                          );
                                        })}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Adjust sessions - only for active packages */}
                                  {isActive && pkgBaseCount > 1 && (
                                    <div className="mt-2 flex gap-3">
                                      <button
                                        onClick={() => handleAdjustSessions(user, -1)}
                                        disabled={remainingSessions <= 0 || adjustingSessionsEmail === user.email}
                                        className={`w-8 h-8 rounded text-sm font-bold flex items-center justify-center transition-colors ${
                                          remainingSessions <= 0 || adjustingSessionsEmail === user.email
                                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            : 'bg-white border border-[#6b5949] text-[#6b5949] hover:bg-[#6b5949] hover:text-white'
                                        }`}
                                      >
                                        {adjustingSessionsEmail === user.email ? <Loader2 className="w-3 h-3 animate-spin" /> : '−'}
                                      </button>
                                      <button
                                        onClick={() => handleAdjustSessions(user, 1)}
                                        disabled={remainingSessions >= totalSessions || adjustingSessionsEmail === user.email}
                                        className={`w-8 h-8 rounded text-sm font-bold flex items-center justify-center transition-colors ${
                                          remainingSessions >= totalSessions || adjustingSessionsEmail === user.email
                                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            : 'bg-white border border-[#6b5949] text-[#6b5949] hover:bg-[#6b5949] hover:text-white'
                                        }`}
                                      >
                                        {adjustingSessionsEmail === user.email ? <Loader2 className="w-3 h-3 animate-spin" /> : '+'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            }) : (
                              <div className="mt-3 mb-3 p-3 bg-[#F5F0EE] rounded-md">
                                <p className="text-xs text-[#8b7764]">No packages</p>
                              </div>
                            )}

                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                    </div>
                  ));
                })()}

                {/* Empty State */}
                {users.filter(u => {
                  if (userFilter === 'all') return true;
                  if (userFilter === 'needs_attention') return u.flag === 'new_user';
                  if (userFilter === 'active') return u.flag === 'active';
                  if (userFilter === 'inactive') return u.flag === 'inactive';
                  return true;
                }).length === 0 && (
                  <div className="text-center py-12 text-[#8b7764]">
                    <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      No {userFilter === 'all' ? '' : userFilter.replace('_', ' ')} users yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </motion.div>

      {/* Confirmation actions now use styled AlertDialog */}

      {/* Dev Tools Modal - only in development */}
      {import.meta.env.DEV && showDevTools && (
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

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialog?.open} onOpenChange={(open) => !open && !deleteDialog?.isDeleting && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete <strong className="text-[#3d2f28]">{deleteDialog?.user?.name} {deleteDialog?.user?.surname}</strong> ({deleteDialog?.user?.email}) and all their data including packages, reservations, and sessions.
              </span>
              <span className="block font-semibold text-red-600">This action cannot be undone.</span>
              <span className="block text-sm">
                Type <strong>delete</strong> to confirm:
              </span>
              <input
                type="text"
                value={deleteDialog?.confirmText || ''}
                onChange={(e) => setDeleteDialog(prev => prev ? { ...prev, confirmText: e.target.value } : null)}
                placeholder="delete"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
                disabled={deleteDialog?.isDeleting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteDialog?.confirmText.toLowerCase() === 'delete') {
                    handleDeleteUser();
                  }
                }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog?.isDeleting}>Cancel</AlertDialogCancel>
            <button
              onClick={handleDeleteUser}
              disabled={deleteDialog?.confirmText.toLowerCase() !== 'delete' || deleteDialog?.isDeleting}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                deleteDialog?.confirmText.toLowerCase() === 'delete' && !deleteDialog?.isDeleting
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {deleteDialog?.isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete User'
              )}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
