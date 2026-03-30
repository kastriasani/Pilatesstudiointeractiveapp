import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// Supabase client for direct table queries
const getSupabase = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { getSkopjeTime, getSkopjeToday, parseDateKey, isValidBookingDate, isTimeSlotPast, formatDateKey } from "./dateUtils.ts";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "https://app.wellnestpilates.com",
allowHeaders: ["Content-Type", "Authorization", "X-Session-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ============ CONSTANTS ============

const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
  sq: ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
       'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'],
  mk: ['јануари', 'февруари', 'март', 'април', 'мај', 'јуни',
       'јули', 'август', 'септември', 'октомври', 'ноември', 'декември']
};

// Single source of truth for default time slots
const DEFAULT_TIME_SLOTS = ['09:00', '10:00', '11:00', '17:00', '18:00', '19:00', '20:00'];
const DEFAULT_MAX_CAPACITY = 4;

// Date-aware defaults from 2026-04-05 onward:
//   Weekdays (Mon-Fri): 17:00, 18:00, 19:00, 20:00
//   Weekends (Sat-Sun): 09:00, 10:00, 11:00
const SLOT_CUTOFF_DATE = '2026-04-05';
const WEEKDAY_SLOTS = ['17:00', '18:00', '19:00', '20:00'];
const WEEKEND_SLOTS = ['09:00', '10:00', '11:00'];
function getDefaultSlotsForDate(date: string): string[] {
  if (date < SLOT_CUTOFF_DATE) return DEFAULT_TIME_SLOTS;
  const day = new Date(date + 'T00:00:00').getDay(); // 0=Sun, 6=Sat
  return (day === 0 || day === 6) ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

const VALID_PACKAGE_TYPES = [
  'single', 'package8', 'package10', 'package12',
  'individual1', 'individual8', 'individual12',
  'duo1', 'duo8', 'duo12'
];

const PACKAGE_PRICING = {
  single: { price: 600, label: 'Single Session', description: '600 DEN per session' },
  package8: { price: 3500, label: '8 Classes Package', description: '8 group classes' },
  package10: { price: 4200, label: '10 Classes Package', description: '10 group classes' },
  package12: { price: 4800, label: '12 Classes Package', description: '12 group classes' },
  individual1: { price: 1200, label: '1-on-1 Single Session', description: 'Private training' },
  individual8: { price: 7000, label: '1-on-1 8 Sessions', description: '8 private sessions' },
  individual12: { price: 9500, label: '1-on-1 12 Sessions', description: '12 private sessions' },
  duo1: { price: 2100, label: 'DUO Single Session', description: 'For 2 people' },
  duo8: { price: 13400, label: 'DUO 8 Sessions', description: '8 duo sessions' },
  duo12: { price: 18400, label: 'DUO 12 Sessions', description: '12 duo sessions' },
};

const STUDIO_INFO = {
  name: 'Wellnest Pilates',
  address: 'Gjuro Gjakovikj 59, Kumanovo 1300',
  email: 'info@wellnestpilates.com',
};

// ============ TYPES ============

type PackageType = 
  | 'single'
  | 'package8' | 'package10' | 'package12'
  | 'individual1' | 'individual8' | 'individual12'
  | 'duo1' | 'duo8' | 'duo12';

type ServiceType = 'single' | 'package' | 'individual' | 'duo';

type ReservationStatus = 'pending' | 'confirmed' | 'attended' | 'cancelled' | 'no_show' | 'expired';
type PaymentStatus = 'unpaid' | 'paid' | 'partially_paid' | 'refunded';
type PackageStatus = 'pending' | 'active' | 'fully_used' | 'expired' | 'cancelled';
type ActivationStatus = 'pending' | 'activated' | 'expired';

// ============ UTILITY FUNCTIONS ============

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// --- Email validation: whitelist domains + valid TLD fallback ---
const WHITELISTED_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'proton.me', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'gmx.com', 'gmx.net',
  'yahoo.co.uk', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'yahoo.es',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es',
  'outlook.de', 'outlook.fr', 'outlook.it',
  'live.co.uk', 'live.de', 'live.fr', 'live.nl',
  't-online.de', 'web.de', 'freenet.de', 'arcor.de',
  'yahoo.mk', 'hotmail.mk', 'outlook.mk',
  'yahoo.al', 'hotmail.al', 'yahoo.rs', 'hotmail.rs',
  'yahoo.bg', 'hotmail.bg', 'yahoo.hr', 'hotmail.hr',
  'yahoo.gr', 'hotmail.gr',
]);
const VALID_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'io', 'co', 'me', 'info', 'biz', 'name', 'pro', 'mobi', 'tel',
  'app', 'dev', 'tech', 'online', 'site', 'store', 'shop', 'cloud',
  'uk', 'de', 'fr', 'it', 'es', 'nl', 'be', 'at', 'ch', 'se', 'no',
  'dk', 'fi', 'pt', 'ie', 'pl', 'cz', 'sk', 'hu', 'ro', 'bg',
  'hr', 'si', 'ba', 'rs', 'me', 'mk', 'al', 'gr', 'tr', 'cy',
  'lt', 'lv', 'ee', 'ua', 'ru', 'by', 'eu',
  'us', 'ca', 'mx', 'br', 'ar', 'cl',
  'au', 'nz', 'jp', 'kr', 'cn', 'in', 'sg', 'hk', 'tw',
  'za', 'ng', 'ke', 'eg', 'il', 'ae', 'sa',
]);
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.vom': 'gmail.com', 'gmail.cmo': 'gmail.com', 'gmail.ocm': 'gmail.com',
  'gmal.com': 'gmail.com', 'gmil.com': 'gmail.com', 'gimail.com': 'gmail.com',
  'yahoo.vom': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.cmo': 'yahoo.com',
  'yahoo.ocm': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com', 'uahoo.com': 'yahoo.com', 'tahoo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotamil.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmail.vom': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com', 'hotmale.com': 'hotmail.com',
  'outloo.com': 'outlook.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'outlook.vom': 'outlook.com', 'outloock.com': 'outlook.com',
  'live.con': 'live.com', 'live.vom': 'live.com',
  'icloud.con': 'icloud.com', 'icloud.vom': 'icloud.com', 'iclould.com': 'icloud.com',
  'protonmail.con': 'protonmail.com', 'protonmail.vom': 'protonmail.com',
};
const TLD_TYPOS: Record<string, string> = {
  'vom': 'com', 'con': 'com', 'cmo': 'com', 'ocm': 'com', 'coom': 'com',
  'comm': 'com', 'xom': 'com', 'dom': 'com',
  'nett': 'net', 'ner': 'net', 'orgg': 'org', 'rog': 'org', 'ogr': 'org',
};

function validateEmail(email: string): { valid: boolean; reason?: string; suggestion?: string } {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, reason: 'invalid_format' };
  }
  const domain = trimmed.split('@')[1];
  if (!domain) return { valid: false, reason: 'invalid_format' };
  if (WHITELISTED_DOMAINS.has(domain)) return { valid: true };
  if (DOMAIN_TYPOS[domain]) {
    const corrected = trimmed.replace(`@${domain}`, `@${DOMAIN_TYPOS[domain]}`);
    return { valid: false, reason: 'typo', suggestion: corrected };
  }
  const tld = domain.split('.').pop();
  if (!tld) return { valid: false, reason: 'invalid_format' };
  if (TLD_TYPOS[tld]) {
    const correctedDomain = domain.replace(new RegExp(`\\.${tld}$`), `.${TLD_TYPOS[tld]}`);
    return { valid: false, reason: 'typo', suggestion: trimmed.replace(`@${domain}`, `@${correctedDomain}`) };
  }
  if (VALID_TLDS.has(tld)) return { valid: true };
  const parts = domain.split('.');
  if (parts.length >= 3 && VALID_TLDS.has(parts[parts.length - 1])) return { valid: true };
  return { valid: false, reason: 'invalid_domain' };
}

function generateSecureToken(prefix: string): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function generateActivationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let code = 'WN-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomBytes[i] % chars.length);
    if (i === 3) code += '-';
  }
  return code;
}

function extractServiceType(packageType: PackageType): ServiceType {
  if (packageType === 'single') return 'single';
  if (packageType.startsWith('individual')) return 'individual';
  if (packageType.startsWith('duo')) return 'duo';
  if (packageType.startsWith('package')) return 'package';
  return 'single';
}

function extractSessionCount(packageType: PackageType): number {
  if (packageType === 'single') return 1;
  const match = packageType.match(/(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

function calculateEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + 50;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

function constructFullDate(dateKey: string, timeSlot: string): string {
  const parts = dateKey.split('-').map(Number);
  let year: number, month: number, day: number;
  if (parts.length === 3) {
    [year, month, day] = parts;
  } else {
    [month, day] = parts;
    year = getSkopjeTime().getFullYear();
  }
  const [hours, minutes] = timeSlot.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

function calculateExpiry(activationDate: string): string {
  const date = new Date(activationDate);
  date.setMonth(date.getMonth() + 6);
  return date.toISOString();
}

function getPackagePriceInfo(packageType: PackageType) {
  return PACKAGE_PRICING[packageType] || PACKAGE_PRICING.single;
}

function formatDateString(dateKey: string, language: string = 'en'): string {
  const parts = dateKey.split('-').map(Number);
  let month: number, day: number;
  if (parts.length === 3) {
    [, month, day] = parts;  // ISO: "2026-02-05"
  } else {
    [month, day] = parts;    // Legacy: "2-5"
  }
  const lang = (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en';
  const months = MONTH_NAMES[lang] || MONTH_NAMES.en;
  return `${day} ${months[month - 1]}`;
}

async function hashPassword(password: string): Promise<string> {
  // Salted SHA-256: generates random salt and stores as "s256:salt:hash"
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(saltHex + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `s256:${saltHex}:${hashHex}`;
}

function isDevEndpointsEnabled(): boolean {
  return Deno.env.get("ENABLE_DEV_ENDPOINTS") === "true";
}

// Admin credentials (from env or defaults for development)
const ADMIN_USERNAME = Deno.env.get("ADMIN_USERNAME") || "admin";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin";

// Helper to verify admin session from request
async function verifyAdminSession(c: any): Promise<{ valid: boolean; error?: string }> {
  const sessionToken = c.req.header('X-Session-Token') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionToken) {
    return { valid: false, error: 'No session token provided' };
  }

  const sessionKey = `session:${sessionToken}`;
  const session = await kv.get(sessionKey);

  if (!session) {
    return { valid: false, error: 'Invalid session' };
  }

  if (new Date(session.expiresAt) < new Date()) {
    return { valid: false, error: 'Session expired' };
  }

  if (!session.isAdmin) {
    return { valid: false, error: 'Admin access required' };
  }

  // Extend session expiry on each successful request (sliding expiration)
  // Fire-and-forget: don't block the response on the KV write
  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  kv.set(sessionKey, { ...session, expiresAt: newExpiry }).catch(console.error);

  return { valid: true };
}

// Helper to verify user session from request (with sliding expiration)
async function verifyUserSession(c: any): Promise<{ valid: boolean; error?: string; session?: any }> {
  const sessionToken = c.req.header('X-Session-Token');

  if (!sessionToken) {
    return { valid: false, error: 'No session token provided' };
  }

  const sessionKey = `session:${sessionToken}`;
  const session = await kv.get(sessionKey);

  if (!session) {
    return { valid: false, error: 'Invalid session' };
  }

  if (new Date(session.expiresAt) < new Date()) {
    return { valid: false, error: 'Session expired' };
  }

  // Verify user still exists in database (handles deleted accounts)
  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', session.email)
    .maybeSingle();

  if (userError || !user) {
    // User was deleted — clean up the orphaned session
    await kv.del(sessionKey);
    return { valid: false, error: 'Session expired' };
  }

  // Extend session expiry on each successful request (sliding expiration)
  // Fire-and-forget: don't block the response on the KV write
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  kv.set(sessionKey, { ...session, expiresAt: newExpiry }).catch(console.error);

  return { valid: true, session };
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();

  if (storedHash.startsWith('s256:')) {
    // New salted format: "s256:salt:hash"
    const parts = storedHash.split(':');
    const salt = parts[1];
    const expectedHash = parts[2];
    const data = encoder.encode(salt + password);
    const computed = await crypto.subtle.digest('SHA-256', data);
    const computedHex = Array.from(new Uint8Array(computed))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return computedHex === expectedHash;
  }

  // Legacy unsalted SHA-256 (backwards compatibility for existing users)
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === storedHash;
}

// Returns both ISO and legacy date key variants for a given dateKey
// e.g. "2026-02-05" → ["2026-02-05", "2-5"], "2-5" → ["2-5", "2026-02-05"]
function getDateKeyVariants(dateKey: string): string[] {
  let altDateKey = dateKey;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [, m, d] = dateKey.split('-');
    altDateKey = `${parseInt(m)}-${parseInt(d)}`;
  } else if (/^\d{1,2}-\d{1,2}$/.test(dateKey)) {
    const [m, d] = dateKey.split('-');
    const year = new Date().getFullYear();
    altDateKey = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return [dateKey, altDateKey];
}

async function calculateSlotCapacity(dateKey: string, timeSlot: string): Promise<{available: number, isBlocked: boolean, classType: string, maxCapacity: number}> {
  const supabase = getSupabase();
  const dateKeyVariants = getDateKeyVariants(dateKey);

  const { data: slotConfig } = await supabase
    .from('time_slots')
    .select('class_type, max_capacity')
    .eq('date', dateKey)
    .eq('start_time', timeSlot)
    .single();

  const classType = slotConfig?.class_type || 'group';
  const maxCapacity = slotConfig?.max_capacity || 4;

  const { data: slotReservations, error } = await supabase
    .from('reservations')
    .select('id')
    .in('date_key', dateKeyVariants)
    .eq('time_slot', timeSlot)
    .in('reservation_status', ['pending', 'confirmed', 'attended']);

  if (error) {
    return { available: 0, isBlocked: true, classType, maxCapacity };
  }

  const booked = (slotReservations || []).length;

  return {
    available: Math.max(0, maxCapacity - booked),
    isBlocked: booked >= maxCapacity,
    classType,
    maxCapacity
  };
}

// ============ PACKAGE FULLY-USED CHECK ============

// Mark a package as fully_used only when all sessions are truly consumed:
// remaining_sessions = 0 AND no future pending/confirmed reservations remain.
async function maybeMarkPackageFullyUsed(supabase: ReturnType<typeof getSupabase>, packageId: string): Promise<void> {
  const { data: pkg } = await supabase
    .from('user_packages')
    .select('remaining_sessions, package_status')
    .eq('id', packageId)
    .single();

  if (!pkg || pkg.remaining_sessions > 0 || pkg.package_status === 'fully_used') return;

  // Only count future (today or later) pending/confirmed reservations
  const today = formatDateKey(getSkopjeTime());
  const { count } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)
    .in('reservation_status', ['pending', 'confirmed'])
    .gte('date_key', today);

  if (count === 0) {
    await supabase
      .from('user_packages')
      .update({ package_status: 'fully_used', updated_at: new Date().toISOString() })
      .eq('id', packageId);
    console.log(`✅ Package ${packageId} marked as fully_used (all sessions consumed)`);
  }
}

// ============ DEFENSIVE: VERIFY CANCEL CLEANUP ============

// Safety net: after cancel_reservation RPC, verify sessions_booked was actually cleaned.
// If not (e.g. transient infra issue during deploy), fix it here.
async function verifySessionsBookedCleanup(supabase: ReturnType<typeof getSupabase>, packageId: string, reservationId: string, userEmail: string) {
  const { data: pkg } = await supabase
    .from('user_packages')
    .select('sessions_booked, total_sessions, sessions_attended')
    .eq('id', packageId)
    .single();
  if (pkg?.sessions_booked?.includes(reservationId)) {
    console.warn(`⚠️ cancel RPC did not remove ${reservationId} from sessions_booked — fixing`);
    const cleaned = pkg.sessions_booked.filter((id: string) => id !== reservationId);
    const remaining = Math.max(0, (pkg.total_sessions || 0) - cleaned.length - (pkg.sessions_attended?.length || 0));
    const used = (pkg.total_sessions || 0) - remaining;
    await supabase.from('user_packages')
      .update({ sessions_booked: cleaned, remaining_sessions: remaining, updated_at: new Date().toISOString() })
      .eq('id', packageId);
    await supabase.from('users')
      .update({ remaining_sessions: remaining, used_sessions: used, updated_at: new Date().toISOString() })
      .eq('email', userEmail);
  }
}

// ============ AUTO-DEDUCT MISSED SESSIONS ============

// Check for past confirmed reservations that were never attended and mark as no_show
async function autoDeductMissedSessions(userEmail: string): Promise<{ deducted: number }> {
  const supabase = getSupabase();
  const today = formatDateKey(getSkopjeTime());
  const now = new Date().toISOString();

  // Find past confirmed reservations (date < today) that should be marked as no_show
  const { data: missedReservations, error } = await supabase
    .from('reservations')
    .select('id, package_id, date_key, time_slot')
    .eq('user_email', userEmail)
    .eq('reservation_status', 'confirmed')
    .lt('date_key', today);

  if (error || !missedReservations || missedReservations.length === 0) {
    return { deducted: 0 };
  }

  let deducted = 0;

  for (const reservation of missedReservations) {
    // Mark reservation as no_show
    await supabase
      .from('reservations')
      .update({ reservation_status: 'no_show', updated_at: now })
      .eq('id', reservation.id);

    // Add to package sessions_attended (penalty - session consumed) and remove from sessions_booked
    if (reservation.package_id) {
      const { data: pkg } = await supabase
        .from('user_packages')
        .select('sessions_attended, sessions_booked')
        .eq('id', reservation.package_id)
        .single();

      if (pkg && !pkg.sessions_attended?.includes(reservation.id)) {
        const updatedBooked = (pkg.sessions_booked || []).filter((id: string) => id !== reservation.id);
        await supabase
          .from('user_packages')
          .update({
            sessions_attended: [...(pkg.sessions_attended || []), reservation.id],
            sessions_booked: updatedBooked,
            updated_at: now
          })
          .eq('id', reservation.package_id);
      }

      // Check if all sessions are now consumed → mark fully_used
      await maybeMarkPackageFullyUsed(supabase, reservation.package_id);
    }

    deducted++;
    console.log(`⚠️ Auto-deducted missed session: ${reservation.date_key} ${reservation.time_slot} for ${userEmail}`);
  }

  return { deducted };
}

// ============ EMAIL FUNCTIONS ============

// Helper: Capitalize name properly (e.g., "kaci" -> "Kaci", "JOHN" -> "John")
function capitalizeName(name: string): string {
  if (!name) return '';
  return name.split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============ UNIFIED EMAIL TEMPLATE ============

type EmailContent = {
  greeting: string;
  message: string;
  details?: Array<{label: string; value: string}>;
  highlight?: {title: string; lines: string[]};
  code?: {label: string; value: string; note?: string};
  button?: {text: string; url: string; hideUrl?: boolean};
  note?: string;
  instructions?: {title: string; steps: string[]};
  closing?: string;
};

function generateEmailTemplate(content: EmailContent, language: 'sq' | 'mk' | 'en' = 'en'): string {
  // Build details section
  const detailsHtml = content.details && content.details.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; margin: 24px 0;">
      <tr>
        <td style="padding: 24px;">
          ${content.details.map(d => `
            <p style="margin: 0 0 12px 0;">
              <span style="color: #888888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 4px;">${escapeHtml(d.label)}</span>
              <span style="color: #333333; font-size: 16px; font-weight: 600;">${escapeHtml(d.value)}</span>
            </p>
          `).join('')}
        </td>
      </tr>
    </table>
  ` : '';

  // Build highlight section (e.g., first class info)
  const highlightHtml = content.highlight ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; margin: 24px 0;">
      <tr>
        <td style="padding: 24px;">
          <p style="margin: 0 0 12px 0; color: #888888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">${escapeHtml(content.highlight.title)}</p>
          ${content.highlight.lines.map(line => `<p style="margin: 0 0 8px 0; color: #333333; font-size: 15px;">${escapeHtml(line)}</p>`).join('')}
        </td>
      </tr>
    </table>
  ` : '';

  // Build code section (redemption code, etc.) - styled for easy copying
  const codeHtml = content.code ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f0eb; border: 2px dashed #c4b5a4; border-radius: 12px; margin: 24px 0;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="font-size: 12px; color: #6b5949; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(content.code.label)}</p>
          <p style="font-size: 28px; font-weight: bold; font-family: monospace; color: #3d2f28; margin: 0; letter-spacing: 3px; -webkit-user-select: all; -moz-user-select: all; -ms-user-select: all; user-select: all;">${escapeHtml(content.code.value)}</p>
          ${content.code.note ? `<p style="font-size: 11px; color: #9a8575; margin: 8px 0 0 0;">${escapeHtml(content.code.note)}</p>` : ''}
        </td>
      </tr>
    </table>
  ` : '';

  // Build button section (optionally hide URL below button)
  const buttonHtml = content.button ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <a href="${content.button.url}" style="display: inline-block; background-color: #452F21; color: #ffffff; padding: 14px 32px; border-radius: 4px; text-decoration: none; font-family: Georgia, serif; font-size: 14px;">${content.button.text}</a>
        </td>
      </tr>
    </table>
    ${content.button.hideUrl ? '' : `<p style="margin: 0; text-align: center; color: #888888; font-size: 12px;">${content.button.url}</p>`}
  ` : '';

  // Build note section
  const noteHtml = content.note ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border-left: 3px solid #452F21; margin: 24px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0; color: #333333; font-size: 14px; line-height: 1.6;">${escapeHtml(content.note)}</p>
        </td>
      </tr>
    </table>
  ` : '';

  // Build instructions section (plain text for single step, numbered for multiple)
  const instructionsHtml = content.instructions ? `
    ${content.instructions.title ? `<p style="margin: 24px 0 12px 0; color: #888888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">${escapeHtml(content.instructions.title)}</p>` : ''}
    ${content.instructions.steps.length === 1
      ? `<p style="margin: 12px 0 0 0; color: #666666; font-size: 13px; font-style: italic;">${escapeHtml(content.instructions.steps[0])}</p>`
      : `<ol style="margin: 0; padding-left: 20px; color: #333333; font-size: 14px; line-height: 1.8;">
          ${content.instructions.steps.map(step => `<li style="margin-bottom: 8px;">${escapeHtml(step)}</li>`).join('')}
        </ol>`
    }
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Georgia, serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px;">
                <!-- Header -->
                <tr>
                  <td style="background-color: #452F21; padding: 20px; text-align: center;">
                    <img src="https://app.wellnestpilates.com/wellnest-logo.png" alt="Wellnest Pilates" width="600" style="display: block; margin: 0 auto; width: 100%; max-width: 100%; height: auto;" />
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 20px 0; color: #452F21; font-size: 18px; font-weight: 600;">${escapeHtml(content.greeting)}</p>
                    <p style="margin: 0 0 24px 0; color: #333333; font-size: 15px; line-height: 1.6;">${escapeHtml(content.message)}</p>
                    ${detailsHtml}
                    ${highlightHtml}
                    ${codeHtml}
                    ${buttonHtml}
                    ${noteHtml}
                    ${instructionsHtml}
                    ${content.closing ? `<p style="margin: 24px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">${escapeHtml(content.closing)}</p>` : ''}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f5f5f5; padding: 24px; text-align: center; border-top: 1px solid #e0e0e0;">
                    <p style="margin: 0 0 8px 0; color: #888888; font-size: 13px;">${language === 'mk' ? 'Ѓуро Ѓаковиќ 59, Куманово 1300' : 'Gjuro Gjakovikj 59, Kumanovo 1300'}</p>
                    <p style="margin: 0; color: #888888; font-size: 12px;">${language === 'mk' ? '© 2025 Велнест Пилатес' : '© 2025 Wellnest Pilates'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured - email not sent');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${STUDIO_INFO.name} <${STUDIO_INFO.email}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email sending failed:', errorText);
      return { success: false, error: `Failed to send email: ${errorText}` };
    }

    const result = await emailResponse.json();
    console.log('Email sent successfully to:', to);
    return { success: true, result };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

// Helper: Get translations for emails
function getEmailTranslations(language: string) {
  const lang = (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en';
  const translations = {
    sq: {
      greeting: 'Përshëndetje',
      bookingConfirmed: 'Rezervimi juaj është konfirmuar.',
      package: 'PAKETA',
      price: 'ÇMIMI',
      singleSession: 'KLASË E VETME',
      firstClass: 'Klasë e parë',
      date: 'Data',
      time: 'Ora',
      important: 'E rëndësishme: Llogaria juaj do të aktivizohet pas përfundimit të pagesës në studio.',
      lookForward: 'Me padurim presim t\'ju shohim! 😊',
      accountReady: 'Llogaria juaj është gati!',
      setPassword: 'Vendos Fjalëkalimin',
      linkExpires: 'Ky link skadon pas 24 orëve.',
      bookNow: 'Rezervo tani',
      classes: 'Klasë',
      bonus: 'BONUS',
      freeClasses: 'Klasë Falas',
      reengageSubject: 'Ofertë speciale nga Wellnest Pilates!',
      reengageMessage: 'Na keni munguar! Rezervoni një paketë multi-klasë brenda 48 orëve dhe merrni një klasë FALAS.',
      reengageOfferLabel: 'OFERTË SPECIALE',
      reengageOffer: 'Rezervoni paketë 8, 10 ose 12 klasë brenda 48 orëve dhe merrni +1 klasë falas!',
      reengageExpiry: 'Oferta skadon pas 48 orëve.',
      classCancelledSubject: 'Klasa e anuluar - Wellnest Pilates',
      classCancelled: 'Klasa juaj e rezervuar është anuluar.',
      classCancelledApology: 'Na vjen keq për bezrahatinë. Ju lutem rezervoni një klasë tjetër.',
      packagePaidSubject: 'Paketa u pagua - Wellnest Pilates',
      packagePaidMessage: 'Pagesa juaj u konfirmua me sukses! Paketa juaj tani është aktive.',
      packagePaidDetails: 'Mund të kyçeni dhe të rezervoni klasët tuaja.',
      resetPasswordSubject: 'Ndryshoni Fjalëkalimin - Wellnest Pilates',
      resetPasswordMessage: 'Keni kërkuar ndryshimin e fjalëkalimit.',
      resetPasswordButton: 'Ndrysho Fjalëkalimin',
      resetLinkExpires: 'Ky link skadon pas 24 orëve.',
      resetIgnore: 'Nëse nuk e keni kërkuar këtë, injoroni këtë email.',
    },
    mk: {
      greeting: 'Здраво',
      bookingConfirmed: 'Вашата резервација е потврдена.',
      package: 'ПАКЕТ',
      price: 'ЦЕНА',
      singleSession: 'ЕДНА КЛАСА',
      firstClass: 'Прва класа',
      date: 'Датум',
      time: 'Време',
      important: 'Важно: Вашата сметка ќе биде активирана по завршувањето на уплатата во студиото.',
      lookForward: 'Со нетрпение ве очекуваме! 😊',
      accountReady: 'Вашата сметка е готова!',
      setPassword: 'Постави Лозинка',
      linkExpires: 'Овој линк истекува за 24 часа.',
      bookNow: 'Резервирај сега',
      classes: 'Класи',
      bonus: 'БОНУС',
      freeClasses: 'Бесплатни Класи',
      reengageSubject: 'Специјална понуда од Wellnest Pilates!',
      reengageMessage: 'Ни недостигавте! Резервирајте мулти-пакет во рок од 48 часа и добијте една класа БЕСПЛАТНО.',
      reengageOfferLabel: 'СПЕЦИЈАЛНА ПОНУДА',
      reengageOffer: 'Резервирајте пакет од 8, 10 или 12 класи во рок од 48 часа и добивате +1 класа бесплатно!',
      reengageExpiry: 'Понудата истекува за 48 часа.',
      classCancelledSubject: 'Откажана класа - Велнест Пилатес',
      classCancelled: 'Вашата резервирана класа е откажана.',
      classCancelledApology: 'Се извинуваме за непријатноста. Ве молиме резервирајте друга класа.',
      packagePaidSubject: 'Пакетот е платен - Велнест Пилатес',
      packagePaidMessage: 'Вашата уплата е успешно потврдена! Вашиот пакет сега е активен.',
      packagePaidDetails: 'Можете да се најавите и да ги резервирате вашите часови.',
      resetPasswordSubject: 'Промена на Лозинка - Велнест Пилатес',
      resetPasswordMessage: 'Побаравте промена на вашата лозинка.',
      resetPasswordButton: 'Промени Лозинка',
      resetLinkExpires: 'Овој линк истекува за 24 часа.',
      resetIgnore: 'Доколку не го побаравте ова, игнорирајте го овој емаил.',
    },
    en: {
      greeting: 'Hello',
      bookingConfirmed: 'Your booking has been confirmed.',
      package: 'PACKAGE',
      price: 'PRICE',
      singleSession: 'SINGLE CLASS',
      firstClass: 'FIRST CLASS',
      date: 'Date',
      time: 'Time',
      important: 'Important: Your account will be activated after payment is completed at the studio.',
      lookForward: 'We look forward to seeing you! 😊',
      accountReady: 'Your account is ready!',
      setPassword: 'Set Password',
      linkExpires: 'This link expires in 24 hours.',
      bookNow: 'Book Now',
      classes: 'Classes',
      bonus: 'BONUS',
      freeClasses: 'Free Classes',
      reengageSubject: 'Special offer from Wellnest Pilates!',
      reengageMessage: 'We miss you! Book a multi-class package within 48 hours and get one class FREE.',
      reengageOfferLabel: 'SPECIAL OFFER',
      reengageOffer: 'Book an 8, 10, or 12 class package within 48 hours and get +1 class FREE!',
      reengageExpiry: 'Offer expires in 48 hours.',
      classCancelledSubject: 'Class Cancelled - Wellnest Pilates',
      classCancelled: 'Your booked class has been cancelled.',
      classCancelledApology: 'We apologize for the inconvenience. Please book another class.',
      packagePaidSubject: 'Package Paid - Wellnest Pilates',
      packagePaidMessage: 'Your payment has been confirmed! Your package is now active.',
      packagePaidDetails: 'You can log in and book your classes.',
      resetPasswordSubject: 'Reset Password - Wellnest Pilates',
      resetPasswordMessage: 'You requested a password reset.',
      resetPasswordButton: 'Reset Password',
      resetLinkExpires: 'This link expires in 24 hours.',
      resetIgnore: 'If you did not request this, please ignore this email.',
    }
  };
  return translations[lang] || translations.en;
}

// Send booking confirmation email (packages and single sessions)
async function sendBookingEmail(
  email: string,
  name: string,
  packageType: PackageType,
  sessionDate: string,
  sessionTime: string,
  sessionEndTime: string,
  language: string = 'en',
  bonusClasses: number = 0
) {
  const t = getEmailTranslations(language);
  const { price } = getPackagePriceInfo(packageType);
  const sessionCount = extractSessionCount(packageType);
  const isSingle = packageType === 'single';

  const details: Array<{label: string; value: string}> = isSingle
    ? [{ label: t.singleSession, value: `${t.price}: ${price} DEN` }]
    : [
        { label: t.package, value: `${sessionCount} ${t.classes}` },
        { label: t.price, value: `${price} DEN` }
      ];

  if (bonusClasses > 0) {
    details.push({ label: t.bonus, value: `+${bonusClasses} ${t.freeClasses}` });
  }

  const content: EmailContent = {
    greeting: `${t.greeting}, ${name}`,
    message: t.bookingConfirmed,
    details,
    highlight: {
      title: isSingle ? t.singleSession : t.firstClass,
      lines: [
        `${t.date}: ${sessionDate}`,
        `${t.time}: ${sessionTime} - ${sessionEndTime}`
      ]
    },
    note: t.important,
    closing: t.lookForward
  };

  const html = generateEmailTemplate(content, (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en');
  const subject = language?.toLowerCase() === 'sq' ? 'Konfirmim Rezervimi - Wellnest Pilates'
    : language?.toLowerCase() === 'mk' ? 'Потврда за резервација - Велнест Пилатес'
    : 'Booking Confirmation - Wellnest Pilates';

  return sendEmail(email, subject, html);
}

// Send class cancellation email (when admin cancels an entire class)
async function sendClassCancelledEmail(
  email: string,
  name: string,
  sessionDate: string,
  sessionTime: string,
  language: string = 'en'
) {
  const t = getEmailTranslations(language);
  const lang = (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en';

  const content: EmailContent = {
    greeting: `${t.greeting}, ${name}`,
    message: t.classCancelled,
    highlight: {
      title: lang === 'sq' ? 'KLASA E ANULUAR' : lang === 'mk' ? 'ОТКАЖАНА КЛАСА' : 'CANCELLED CLASS',
      lines: [
        `${t.date}: ${sessionDate}`,
        `${t.time}: ${sessionTime}`
      ]
    },
    note: t.classCancelledApology,
    closing: t.lookForward
  };

  const html = generateEmailTemplate(content, lang);
  return sendEmail(email, t.classCancelledSubject, html);
}

// Send account activation email (after admin approves payment)
async function sendActivationEmail(
  email: string,
  name: string,
  verificationToken: string,
  appUrl: string,
  language: string = 'en'
) {
  const t = getEmailTranslations(language);
  const loginUrl = `${appUrl}/setup-password?token=${verificationToken}`;
  const capitalizedName = capitalizeName(name);

  const content: EmailContent = {
    greeting: `${t.greeting}, ${capitalizedName}`,
    message: t.accountReady,
    button: {
      text: t.setPassword,
      url: loginUrl,
      hideUrl: true
    },
    instructions: {
      title: '',
      steps: [
        t.linkExpires
      ]
    }
  };

  const html = generateEmailTemplate(content, (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en');
  const subject = language?.toLowerCase() === 'sq' ? 'Llogaria Juaj - Wellnest Pilates'
    : language?.toLowerCase() === 'mk' ? 'Вашата сметка - Велнест Пилатес'
    : 'Your Account - Wellnest Pilates';

  return sendEmail(email, subject, html);
}

// Send payment confirmation email (for returning users who already have a password)
async function sendPaymentConfirmationEmail(
  email: string,
  name: string,
  language: string = 'en'
) {
  const t = getEmailTranslations(language);
  const capitalizedName = capitalizeName(name);
  const appUrl = 'https://app.wellnestpilates.com';

  const content: EmailContent = {
    greeting: `${t.greeting}, ${capitalizedName}`,
    message: t.packagePaidMessage,
    button: {
      text: t.bookNow,
      url: `${appUrl}/login`,
      hideUrl: true
    },
    instructions: {
      title: '',
      steps: [
        t.packagePaidDetails
      ]
    }
  };

  const html = generateEmailTemplate(content, (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en');
  return sendEmail(email, t.packagePaidSubject, html);
}

// Send re-engagement email to archived users
async function sendReengagementEmail(
  email: string,
  name: string,
  language: string = 'en'
) {
  const t = getEmailTranslations(language);
  const capitalizedName = capitalizeName(name);

  const content: EmailContent = {
    greeting: `${t.greeting}, ${capitalizedName}`,
    message: t.reengageMessage,
    details: [
      { label: t.reengageOfferLabel, value: t.reengageOffer }
    ],
    button: {
      text: t.bookNow,
      url: 'https://app.wellnestpilates.com',
      hideUrl: true
    },
    note: t.reengageExpiry,
    closing: t.lookForward
  };

  const html = generateEmailTemplate(content, (language?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en');
  return sendEmail(email, t.reengageSubject, html);
}

// ============ HEALTH CHECK ============

app.get("/make-server-b87b0c07/health", (c) => {
  return c.json({ status: "ok", model: "unified_package_reservation" });
});

// ============ COUPON VALIDATION ENDPOINT ============

app.post("/make-server-b87b0c07/validate-coupon", async (c) => {
  try {
    const body = await c.req.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      console.log('❌ Coupon validation failed: Invalid format');
      return c.json({ valid: false, error: "Invalid coupon code format" });
    }

    const normalizedCode = code.trim().toUpperCase();
    console.log(`🔍 Looking for coupon code in redemption_codes table: ${normalizedCode}`);
    
    // Query the redemption_codes table directly
    const supabase = getSupabase();
    const { data: coupon, error } = await supabase
      .from('redemption_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (error) {
      console.error('❌ Database error:', error);
      return c.json({ valid: false, error: "Database error" }, 500);
    }

    if (!coupon) {
      console.log(`❌ Coupon not found: ${normalizedCode}`);
      return c.json({ valid: false, error: "Coupon not found" });
    }

    console.log(`📋 Coupon found:`, JSON.stringify(coupon, null, 2));

    // Check if coupon is already used
    if (coupon.used === true || coupon.status === 'used' || coupon.status === 'redeemed') {
      console.log(`❌ Coupon already used: ${normalizedCode}`);
      return c.json({ valid: false, error: "Coupon already redeemed" });
    }

    // Check if coupon is expired (check multiple possible column names)
    const expiresAt = coupon.expires_at || coupon.expiresAt;
    if (expiresAt && new Date(expiresAt) < getSkopjeTime()) {
      console.log(`❌ Coupon expired: ${normalizedCode}, expiresAt: ${expiresAt}`);
      return c.json({ valid: false, error: "Coupon expired" });
    }

    // Check if coupon is active (if status column exists)
    if (coupon.status && coupon.status !== 'active') {
      console.log(`❌ Coupon not active: ${normalizedCode}, status: ${coupon.status}`);
      return c.json({ valid: false, error: "Coupon not active" });
    }

    console.log(`✅ Coupon valid: ${normalizedCode}`);

    // Determine bonus based on offer_type
    let bonusClasses = 1;
    let message = "Valid coupon! You'll receive +1 free class";
    
    if (coupon.offer_type === 'first_class_free_with_8pack') {
      bonusClasses = 1;
      message = "Valid coupon! You'll receive +1 free class with your 8-pack";
    }

    return c.json({ 
      valid: true, 
      message,
      bonusClasses,
      couponId: coupon.id,
      offerType: coupon.offer_type
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    return c.json({ valid: false, error: 'Server error validating coupon' }, 500);
  }
});

// ============ PACKAGE ENDPOINTS ============

app.post("/make-server-b87b0c07/packages", async (c) => {
  try {
    const body = await c.req.json();
    const { userId, packageType, name, surname, mobile, email, language, paymentToken, couponCode } = body;

    if (!userId || !packageType || !name || !surname || !mobile || !email) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      return c.json({ error: emailCheck.reason === 'typo' ? `Invalid email domain. Did you mean ${emailCheck.suggestion}?` : 'Invalid email address', suggestion: emailCheck.suggestion }, 400);
    }

    if (!VALID_PACKAGE_TYPES.includes(packageType)) {
      return c.json({ error: "Invalid package type" }, 400);
    }

    if (packageType === 'single') {
      return c.json({ error: "Use /reservations endpoint for single sessions" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Prevent duplicate packages: check if user already has a pending package of the same type
    // Single-session packages (individual1, duo1) are exempt — users can buy as many as they want
    const isSingleSession = packageType === 'individual1' || packageType === 'duo1';
    if (!isSingleSession) {
      const { data: existingPkg } = await supabase
        .from('user_packages')
        .select('id, created_at')
        .eq('user_email', normalizedEmail)
        .eq('package_type', packageType)
        .eq('package_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPkg) {
        // Return the existing package instead of creating a duplicate
        console.log(`⚠️ Duplicate package prevented for ${normalizedEmail} (type: ${packageType}). Returning existing: ${existingPkg.id}`);
        return c.json({
          success: true,
          package: { id: existingPkg.id },
          packageId: existingPkg.id,
          requiresFirstSessionBooking: true,
          bonusClasses: 0,
          redeemedCoupon: null,
          message: "Package already exists. Please select date and time for your first session."
        });
      }
    }

    // Upsert user in Supabase users table
    const { data: existingUser, error: userCheckError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userCheckError) {
      console.error('Error checking user:', userCheckError);
      return c.json({ error: 'Failed to check user', details: userCheckError.message }, 500);
    }

    if (existingUser && existingUser.password_hash) {
      // Block fully registered users (with password) from using the public booking flow
      console.log(`⚠️ Blocked duplicate registration for ${normalizedEmail} via /packages`);
      return c.json({
        error: 'This email is already registered. Please log in to your account to purchase a new package.',
        errorType: 'EMAIL_ALREADY_REGISTERED'
      }, 400);
    }

    if (existingUser) {
      // User exists but hasn't completed registration (no password) — allow creating another package
      // Update their info in case it changed
      await supabase
        .from('users')
        .update({ name, surname, mobile, language: language?.toLowerCase() || 'sq', updated_at: now })
        .eq('email', normalizedEmail);
    } else {
      // Create new user
      const { error: userCreateError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          name,
          surname,
          mobile,
          language: language?.toLowerCase() || 'sq',
          created_at: now,
          updated_at: now,
          blocked: false
        });

      if (userCreateError) {
        console.error('Error creating user:', userCreateError);
        return c.json({ error: 'Failed to create user', details: userCreateError.message }, 500);
      }
      console.log(`User created in Supabase: ${normalizedEmail}`);
    }

    let totalSessions = extractSessionCount(packageType);
    let bonusClasses = 0;
    let redeemedCouponCode = null;

    // Handle coupon redemption - Query redemption_codes table directly
    if (couponCode) {
      const normalizedCoupon = couponCode.trim().toUpperCase();
      console.log(`🔍 Checking coupon for redemption: ${normalizedCoupon}`);

      const { data: coupon, error: couponError } = await supabase
        .from('redemption_codes')
        .select('*')
        .eq('code', normalizedCoupon)
        .maybeSingle();

      if (coupon && !couponError) {
        const isUsed = coupon.used === true || coupon.status === 'used' || coupon.status === 'redeemed';
        const expiresAt = coupon.expires_at || coupon.expiresAt;
        const isExpired = expiresAt && new Date(expiresAt) < getSkopjeTime();
        const isActive = !coupon.status || coupon.status === 'active';

        if (!isUsed && !isExpired && isActive) {
          bonusClasses = 1;
          totalSessions += bonusClasses;
          redeemedCouponCode = normalizedCoupon;

          // Note: package_id will be updated after package is created
          const { error: updateError } = await supabase
            .from('redemption_codes')
            .update({
              used: true,
              status: 'redeemed',
              used_at: now,
              used_by_email: normalizedEmail
            })
            .eq('id', coupon.id);

          if (updateError) {
            console.error('Failed to mark coupon as used:', updateError);
          } else {
            console.log(`✅ Coupon ${normalizedCoupon} redeemed by ${normalizedEmail}. +${bonusClasses} bonus class(es)`);
          }
        } else {
          console.log(`⚠️ Coupon ${normalizedCoupon} not valid: used=${isUsed}, expired=${isExpired}, active=${isActive}`);
        }
      } else {
        console.log(`⚠️ Coupon ${normalizedCoupon} not found`);
      }
    }

    let paymentStatus: PaymentStatus = 'unpaid';
    let paymentId: string | null = null;

    // Payment token validation (still uses KV for now)
    if (paymentToken) {
      const payment = await kv.get(`payment:token:${paymentToken}`);
      if (payment && !payment.tokenUsed && payment.userId === normalizedEmail) {
        paymentStatus = 'paid';
        paymentId = payment.id;
        payment.tokenUsed = true;
        payment.linkedAt = now;
        await kv.set(payment.id, payment);
      }
    }

    // Insert package into user_packages table
    const { data: insertedPackage, error: packageError } = await supabase
      .from('user_packages')
      .insert({
        user_email: normalizedEmail,
        package_type: packageType,
        total_sessions: totalSessions,
        base_sessions: extractSessionCount(packageType),
        bonus_classes: bonusClasses,
        remaining_sessions: totalSessions,
        sessions_booked: [],
        sessions_attended: [],
        redeemed_coupon_code: redeemedCouponCode,
        package_status: 'pending',
        activation_status: 'pending',
        payment_status: paymentStatus,
        purchase_date: now,
        activation_date: null,
        expiry_date: null,
        first_reservation_id: null,
        payment_id: paymentId,
        name,
        surname,
        mobile,
        email: normalizedEmail,
        language: language || 'en',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (packageError) {
      console.error('Error creating package:', packageError);
      return c.json({ error: 'Failed to create package', details: packageError.message }, 500);
    }

    const packageId = insertedPackage.id;

    // Update redemption_codes with package_id if coupon was used
    if (redeemedCouponCode) {
      await supabase
        .from('redemption_codes')
        .update({ package_id: packageId })
        .eq('code', redeemedCouponCode);
    }

    // Sync to users table for backwards compatibility with GET /admin/users
    await supabase
      .from('users')
      .update({
        package_type: packageType,
        total_sessions: totalSessions,
        remaining_sessions: totalSessions,
        used_sessions: 0,
        payment_status: paymentStatus,
        activation_status: 'pending',
        updated_at: now
      })
      .eq('email', normalizedEmail);

    // Build response package object (camelCase for frontend compatibility)
    const pkg = {
      id: packageId,
      userId: normalizedEmail,
      packageType,
      totalSessions,
      remainingSessions: totalSessions,
      baseSessions: extractSessionCount(packageType),
      bonusClasses,
      redeemedCouponCode,
      sessionsBooked: [],
      sessionsAttended: [],
      purchaseDate: now,
      activationDate: null,
      expiryDate: null,
      packageStatus: 'pending' as PackageStatus,
      activationStatus: 'pending' as ActivationStatus,
      paymentStatus,
      firstReservationId: null,
      paymentId,
      name,
      surname,
      mobile,
      email: normalizedEmail,
      language: language || 'en',
      createdAt: now,
      updatedAt: now
    };

    console.log(`📦 Package created in Supabase: ${packageId}`);

    return c.json({
      success: true,
      package: pkg,
      packageId,
      requiresFirstSessionBooking: true,
      bonusClasses,
      redeemedCoupon: redeemedCouponCode,
      message: bonusClasses > 0
        ? `Package created with +${bonusClasses} bonus class! Please select date and time for your first session.`
        : "Package created. Please select date and time for your first session."
    });

  } catch (error) {
    console.error('Error creating package:', error);
    return c.json({ error: 'Failed to create package', details: error.message }, 500);
  }
});

// POST /packages/:id/first-session - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/packages/:id/first-session", async (c) => {
  try {
    const packageId = c.req.param('id');
    const body = await c.req.json();
    const { dateKey, timeSlot, instructor, partnerName, partnerSurname, appUrl } = body;

    if (!dateKey || !timeSlot) {
      return c.json({ error: "Missing required fields: dateKey, timeSlot" }, 400);
    }

    const bookingDate = parseDateKey(dateKey);
    if (!bookingDate || !isValidBookingDate(bookingDate)) {
      return c.json({ error: "Invalid booking date - must be a future weekday" }, 400);
    }
    if (isTimeSlotPast(bookingDate, timeSlot)) {
      return c.json({ error: "This time slot has already passed" }, 400);
    }

    if (!appUrl) {
      return c.json({ error: "Missing app URL for email link" }, 400);
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Read package from Supabase (not KV)
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    const serviceType = extractServiceType(pkg.package_type);

    const dateString = formatDateString(dateKey, pkg.language || 'en');
    const endTime = calculateEndTime(timeSlot);

    // Atomic RPC: locks slot rows, checks capacity, validates package, creates reservation
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation', {
      p_user_email: pkg.user_email,
      p_package_id: packageId,
      p_service_type: serviceType,
      p_date_key: dateKey,
      p_time_slot: timeSlot,
      p_instructor: instructor || '',
      p_name: pkg.name,
      p_surname: pkg.surname,
      p_mobile: pkg.mobile,
      p_package_type: pkg.package_type,
      p_partner_name: partnerName || null,
      p_partner_surname: partnerSurname || null,
      p_is_first_session: true,
      p_slot_index: 0
    });

    if (rpcError) {
      console.error('RPC error booking first session:', rpcError);
      return c.json({ error: 'Failed to book first session', details: rpcError.message }, 500);
    }

    if (rpcResult?.error) {
      const errorMap: Record<string, string> = {
        'Slot blocked by private session': 'Slot not available for booking',
        'Insufficient capacity': 'Slot is full',
        'Package not found': 'Package not found',
        'No remaining sessions': 'No remaining sessions in package',
        'Package is not in pending state': 'Package is not in pending state',
        'First session already booked': 'First session already booked for this package'
      };
      const userError = errorMap[rpcResult.error] || rpcResult.error;
      return c.json({ error: userError }, 400);
    }

    const reservationId = rpcResult.reservation_id;
    const isFriendBooking = rpcResult.is_friend_booking || false;
    const newRemainingSessions = pkg.remaining_sessions - 1;

    // sessions_booked is now updated atomically inside create_reservation RPC

    // Sync to users table for backwards compatibility (Admin Panel reads from here)
    const usedSessions = (pkg.total_sessions || 0) - newRemainingSessions;
    await supabase
      .from('users')
      .update({
        remaining_sessions: newRemainingSessions,
        used_sessions: usedSessions,
        updated_at: now
      })
      .eq('email', pkg.user_email);

    // Check user from Supabase and send email if needed
    try {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', pkg.user_email)
        .single();

      if (!user || !user.password_hash) {
        const verificationToken = generateSecureToken('verify');
        const tokenKey = `verification_token:${verificationToken}`;
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        // Token stays in KV (acceptable for temporary tokens)
        const tokenData = {
          id: tokenKey,
          token: verificationToken,
          email: pkg.user_email,
          expiresAt: tokenExpiry.toISOString(),
          used: false,
          createdAt: now
        };
        await kv.set(tokenKey, tokenData);

        await sendBookingEmail(
          pkg.user_email,
          pkg.name,
          pkg.package_type,
          dateString,
          timeSlot,
          endTime,
          pkg.language || 'en',
          pkg.bonus_classes || 0
        );
        console.log(`Booking email sent to: ${pkg.user_email}`);
      }
    } catch (emailError) {
      console.error('Error sending registration email:', emailError);
    }

    console.log(`First session booked for package ${packageId}: ${reservationId} (Supabase)`);

    // Build response in camelCase for frontend compatibility
    const reservation = {
      id: reservationId,
      userId: pkg.user_email,
      packageId: pkg.id,
      serviceType,
      dateKey,
      date: dateString,
      timeSlot,
      endTime,
      instructor,
      name: pkg.name,
      surname: pkg.surname,
      email: pkg.user_email,
      mobile: pkg.mobile,
      partnerName: partnerName || null,
      partnerSurname: partnerSurname || null,
      reservationStatus: 'pending',
      paymentStatus: pkg.payment_status || 'unpaid',
      createdAt: now,
      language: pkg.language || 'en'
    };

    const pkgResponse = {
      id: pkg.id,
      userId: pkg.user_email,
      packageType: pkg.package_type,
      totalSessions: pkg.total_sessions,
      remainingSessions: newRemainingSessions,
      firstReservationId: reservationId,
      name: pkg.name,
      surname: pkg.surname,
      email: pkg.user_email,
      mobile: pkg.mobile,
      language: pkg.language || 'en',
      bonusClasses: pkg.bonus_classes || 0,
      redeemedCouponCode: pkg.redeemed_coupon_code || null
    };

    return c.json({
      success: true,
      package: pkgResponse,
      reservation,
      message: "Booking successful! Check your email to complete registration."
    });

  } catch (error) {
    console.error('Error booking first session:', error);
    return c.json({ error: 'Failed to book first session', details: (error as Error).message }, 500);
  }
});

app.get("/make-server-b87b0c07/packages", async (c) => {
  try {
    const userId = c.req.query('userId');
    const supabase = getSupabase();

    let query = supabase
      .from('user_packages')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      query = query.eq('user_email', normalizedEmail);
    }

    const { data: packages, error } = await query;

    if (error) {
      console.error('Error fetching packages from Supabase:', error);
      return c.json({ error: 'Failed to fetch packages', details: error.message }, 500);
    }

    // Map snake_case to camelCase for frontend compatibility
    const mappedPackages = (packages || []).map((pkg: any) => ({
      id: pkg.id,
      userId: pkg.user_email,
      packageType: pkg.package_type,
      totalSessions: pkg.total_sessions,
      remainingSessions: pkg.remaining_sessions,
      baseSessions: pkg.base_sessions,
      bonusClasses: pkg.bonus_classes,
      redeemedCouponCode: pkg.redeemed_coupon_code,
      sessionsBooked: pkg.sessions_booked || [],
      sessionsAttended: pkg.sessions_attended || [],
      purchaseDate: pkg.purchase_date,
      activationDate: pkg.activation_date,
      expiryDate: pkg.expiry_date,
      packageStatus: pkg.package_status,
      activationStatus: pkg.activation_status,
      paymentStatus: pkg.payment_status,
      firstReservationId: pkg.first_reservation_id,
      paymentId: pkg.payment_id,
            name: pkg.name,
      surname: pkg.surname,
      mobile: pkg.mobile,
      email: pkg.email,
      language: pkg.language,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at
    }));

    console.log(`📦 Retrieved ${mappedPackages.length} packages from Supabase`);
    return c.json({ success: true, packages: mappedPackages });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return c.json({ error: 'Failed to fetch packages', details: error.message }, 500);
  }
});

app.get("/make-server-b87b0c07/packages/:id", async (c) => {
  try {
    const packageId = c.req.param('id');
    const supabase = getSupabase();

    const { data: pkg, error } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching package from Supabase:', error);
      return c.json({ error: 'Failed to fetch package', details: error.message }, 500);
    }

    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    // Map to camelCase for frontend compatibility
    const mappedPackage = {
      id: pkg.id,
      userId: pkg.user_email,
      packageType: pkg.package_type,
      totalSessions: pkg.total_sessions,
      remainingSessions: pkg.remaining_sessions,
      baseSessions: pkg.base_sessions,
      bonusClasses: pkg.bonus_classes,
      redeemedCouponCode: pkg.redeemed_coupon_code,
      sessionsBooked: pkg.sessions_booked || [],
      sessionsAttended: pkg.sessions_attended || [],
      purchaseDate: pkg.purchase_date,
      activationDate: pkg.activation_date,
      expiryDate: pkg.expiry_date,
      packageStatus: pkg.package_status,
      activationStatus: pkg.activation_status,
      paymentStatus: pkg.payment_status,
      firstReservationId: pkg.first_reservation_id,
      paymentId: pkg.payment_id,
            name: pkg.name,
      surname: pkg.surname,
      mobile: pkg.mobile,
      email: pkg.email,
      language: pkg.language,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at
    };

    return c.json({ success: true, package: mappedPackage });
  } catch (error) {
    console.error('Error fetching package:', error);
    return c.json({ error: 'Failed to fetch package', details: error.message }, 500);
  }
});

// ============ RESERVATION ENDPOINTS ============

app.post("/make-server-b87b0c07/reservations", async (c) => {
  try {
    const body = await c.req.json();
    const {
      userId,
      packageId,
      serviceType,
      dateKey,
      timeSlot,
      instructor,
      name,
      surname,
      email,
      mobile,
      partnerName,
      partnerSurname,
      language,
      packageType
    } = body;

    if (!userId || !serviceType || !dateKey || !timeSlot) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    if (!name || !surname || !email || !mobile) {
      return c.json({ error: "Missing personal information" }, 400);
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      return c.json({ error: emailCheck.reason === 'typo' ? `Invalid email domain. Did you mean ${emailCheck.suggestion}?` : 'Invalid email address', suggestion: emailCheck.suggestion }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const isPackageSession = !!packageId;

    // Ensure user exists in users table (for admin panel visibility)
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { data: existingUser, error: userCheckError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userCheckError) {
      console.error('Error checking user:', userCheckError);
      return c.json({ error: 'Failed to check user', details: userCheckError.message }, 500);
    }

    if (existingUser && !isPackageSession) {
      // Block registered users from using the public booking flow again
      // Exception: allow if booking a first session for a just-created package (isPackageSession=true)
      console.log(`⚠️ Blocked duplicate registration for ${normalizedEmail} via /reservations`);
      return c.json({
        error: 'This email is already registered. Please log in to your account to book a session.',
        errorType: 'EMAIL_ALREADY_REGISTERED'
      }, 400);
    }

    if (!existingUser) {
      // Create new user for single session booking
      const { error: userCreateError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          name,
          surname,
          mobile,
          language: language?.toLowerCase() || 'sq',
          payment_status: 'unpaid',
          created_at: now,
          updated_at: now,
          blocked: false
        });

      if (userCreateError) {
        console.error('Error creating user:', userCreateError);
        return c.json({ error: 'Failed to create user', details: userCreateError.message }, 500);
      }
      console.log(`User created in Supabase for single session: ${normalizedEmail}`);
    }

    // Call atomic RPC for reservation creation
    // This handles: capacity check, duplicate check, package decrement - all atomically

    // Log the request parameters for debugging
    console.log('Creating reservation with params:', {
      p_user_email: normalizedEmail,
      p_service_type: serviceType,
      p_date_key: dateKey,
      p_time_slot: timeSlot,
      p_name: name,
      p_surname: surname,
      p_package_id: packageId || null
    });

    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation', {
      p_user_email: normalizedEmail,
      p_package_id: packageId || null,
      p_service_type: serviceType,
      p_date_key: dateKey,
      p_time_slot: timeSlot,
      p_instructor: instructor || '',
      p_name: name,
      p_surname: surname,
      p_mobile: mobile,
      p_package_type: packageType || null,
      p_partner_name: partnerName || null,
      p_partner_surname: partnerSurname || null
    });

    if (rpcError) {
      console.error('RPC error creating reservation:', rpcError);
      // Check if RPC function doesn't exist
      if (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist')) {
        console.error('RPC function create_reservation does not exist. Please run the migration.');
        return c.json({
          error: 'Booking system unavailable',
          details: 'Database function missing. Contact admin.',
          debug: rpcError.message
        }, 500);
      }
      return c.json({ error: 'Failed to create reservation', details: rpcError.message }, 500);
    }

    if (rpcResult?.error) {
      // Map RPC errors to user-friendly messages
      const errorMap: Record<string, string> = {
        'Slot blocked by private session': 'Slot not available for booking',
        'Insufficient capacity': 'Slot is full',
        'Duplicate booking': 'You already have a booking for this time slot',
        'Package not found': 'Package not found',
        'No remaining sessions': 'No remaining sessions in package',
        'Package not active': 'Package is not active'
      };
      const userError = errorMap[rpcResult.error] || rpcResult.error;
      return c.json({ error: userError }, 400);
    }

    const reservationId = rpcResult.reservation_id;
    const reservationStatus = rpcResult.status;
    const isFriendBooking = rpcResult.is_friend_booking || false;
    const dateString = formatDateString(dateKey, language || 'en');
    const endTime = calculateEndTime(timeSlot);

    console.log(`✅ Reservation created via RPC: ${reservationId} (status: ${reservationStatus})`);

    // Build reservation object for response (matches frontend expectations)
    const reservation = {
      id: reservationId,
      userId: normalizedEmail,
      packageId: packageId || null,
      serviceType,
      dateKey,
      date: dateString,
      timeSlot,
      endTime,
      instructor,
      name,
      surname,
      email: normalizedEmail,
      mobile,
      partnerName: partnerName || null,
      partnerSurname: partnerSurname || null,
      reservationStatus,
      paymentStatus: isPackageSession ? 'paid' : 'unpaid',
      createdAt: new Date().toISOString(),
      language: language || 'en'
    };

    if (isPackageSession) {
      // Package session - reservation already confirmed, package decremented by RPC
      console.log(`📦 Package session booked: ${reservationId}`);

      return c.json({
        success: true,
        reservation,
        reservationId,
        requiresActivation: false,
        message: "Session booked successfully!"
      });

    } else {
      // Single session booking - user stays pending until admin activates
      // NO activation code generated - admin will activate after payment

      // Send booking confirmation email (not activation code)
      try {
        const appUrl = c.req.header('origin') || c.req.header('referer') || 'https://app.wellnestpilates.com';

        await sendBookingEmail(
          normalizedEmail,
          name,
          'single',
          dateString,
          timeSlot,
          endTime,
          language,
          0
        );
      } catch (emailError) {
        console.error('Error sending booking confirmation email:', emailError);
      }

      console.log(`Single session reserved: ${reservationId} (pending admin activation)`);

      return c.json({
        success: true,
        reservation,
        reservationId,
        requiresActivation: true,
        message: "Reservation created! You will receive a login email after your payment is confirmed in the studio."
      });
    }

  } catch (error) {
    console.error('Error creating reservation:', error);
    return c.json({ error: 'Failed to create reservation', details: error.message }, 500);
  }
});

// GET /reservations - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/reservations", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const userId = c.req.query('userId');
    const dateKey = c.req.query('dateKey');
    const status = c.req.query('status');
    const paymentStatus = c.req.query('paymentStatus');

    const supabase = getSupabase();
    let query = supabase.from('reservations').select('*');

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      query = query.eq('user_email', normalizedEmail);
    }

    if (dateKey) {
      query = query.in('date_key', getDateKeyVariants(dateKey));
    }

    if (status) {
      query = query.eq('reservation_status', status);
    }

    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reservations from Supabase:', error);
      return c.json({ error: 'Failed to fetch reservations', details: error.message }, 500);
    }

    // Map Supabase fields to expected frontend format
    const reservations = (data || []).map((r: any) => ({
      id: r.id,
      userId: r.user_email,
      packageId: r.package_id,
      serviceType: r.service_type,
      dateKey: r.date_key,
      timeSlot: r.time_slot,
      instructor: r.instructor,
      name: r.name,
      surname: r.surname,
      email: r.user_email,
      mobile: r.mobile,
      reservationStatus: r.reservation_status,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    console.log(`📋 Retrieved ${reservations.length} reservations from Supabase`);
    return c.json({ success: true, reservations });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return c.json({ error: 'Failed to fetch reservations', details: (error as Error).message }, 500);
  }
});

// GET /reservations/:id - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/reservations/:id", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const reservationId = c.req.param('id');

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (error || !data) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    // Map to frontend format
    const reservation = {
      id: data.id,
      userId: data.user_email,
      packageId: data.package_id,
      serviceType: data.service_type,
      dateKey: data.date_key,
      timeSlot: data.time_slot,
      instructor: data.instructor,
      name: data.name,
      surname: data.surname,
      email: data.user_email,
      mobile: data.mobile,
      reservationStatus: data.reservation_status,
      paymentStatus: data.payment_status,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

    return c.json({ success: true, reservation });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    return c.json({ error: 'Failed to fetch reservation', details: (error as Error).message }, 500);
  }
});

// PATCH /reservations/:id/status - MIGRATED TO SUPABASE
app.patch("/make-server-b87b0c07/reservations/:id/status", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const reservationId = c.req.param('id');
    const body = await c.req.json();
    const { reservationStatus, paymentStatus, cancelReason } = body;

    const supabase = getSupabase();

    // Fetch reservation from Supabase
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (fetchError || !reservation) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    // Capacity check: when reactivating a reservation (changing to confirmed/attended from a non-active status),
    // verify the slot still has capacity to prevent overbooking
    const activeStatuses = ['confirmed', 'attended', 'pending'];
    const currentlyActive = activeStatuses.includes(reservation.reservation_status);
    const becomingActive = reservationStatus && (reservationStatus === 'confirmed' || reservationStatus === 'attended');

    if (becomingActive && !currentlyActive) {
      // Count current active reservations in this slot (excluding this one)
      const { data: slotReservations, error: slotError } = await supabase
        .from('reservations')
        .select('id, service_type')
        .in('date_key', getDateKeyVariants(reservation.date_key))
        .eq('time_slot', reservation.time_slot)
        .in('reservation_status', ['confirmed', 'attended', 'pending'])
        .neq('id', reservationId);

      if (slotError) {
        console.error('Error checking slot capacity:', slotError);
        return c.json({ error: 'Failed to verify slot capacity' }, 500);
      }

      // Calculate occupied seats (duo=2, individual=4, others=1)
      let seatsOccupied = 0;
      for (const r of (slotReservations || [])) {
        if (r.service_type === 'duo') seatsOccupied += 2;
        else if (r.service_type === 'individual') seatsOccupied += 4;
        else seatsOccupied += 1;
      }

      // Calculate seats needed for this reservation
      let seatsNeeded = 1;
      if (reservation.service_type === 'duo') seatsNeeded = 2;
      else if (reservation.service_type === 'individual') seatsNeeded = 4;

      const maxCapacity = 4; // MAX_CAPACITY
      if (seatsOccupied + seatsNeeded > maxCapacity) {
        return c.json({
          error: `Cannot reactivate reservation: slot ${reservation.date_key} ${reservation.time_slot} is at capacity (${seatsOccupied}/${maxCapacity} seats occupied)`
        }, 409);
      }

      console.log(`✅ Capacity check passed for slot ${reservation.date_key} ${reservation.time_slot}: ${seatsOccupied}+${seatsNeeded}/${maxCapacity}`);
    }

    // Build update object
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (reservationStatus) {
      updates.reservation_status = reservationStatus;

      if (reservationStatus === 'attended') {
        // Mark as attended - update package sessions_attended array if linked
        if (reservation.package_id) {
          const { data: pkg } = await supabase
            .from('user_packages')
            .select('sessions_attended')
            .eq('id', reservation.package_id)
            .single();

          if (pkg && !pkg.sessions_attended?.includes(reservationId)) {
            await supabase
              .from('user_packages')
              .update({
                sessions_attended: [...(pkg.sessions_attended || []), reservationId],
                updated_at: new Date().toISOString()
              })
              .eq('id', reservation.package_id);
          }

          // Check if all sessions are now consumed (attended/no-show) → mark fully_used
          await maybeMarkPackageFullyUsed(supabase, reservation.package_id);
        }
      }

      if (reservationStatus === 'cancelled') {
        // Atomic cancel: sets reservation_status + updates package (sessions_booked, remaining) in one transaction
        const { data: cancelResult, error: cancelRpcError } = await supabase.rpc('cancel_reservation', {
          p_reservation_id: reservationId,
          p_package_id: reservation.package_id || null
        });

        if (cancelRpcError) {
          console.error('RPC error cancelling reservation:', cancelRpcError);
          return c.json({ error: 'Failed to cancel reservation', details: cancelRpcError.message }, 500);
        }

        if (cancelResult?.error) {
          return c.json({ error: cancelResult.error }, 400);
        }

        // RPC already set reservation_status = 'cancelled', so remove from general updates
        delete updates.reservation_status;

        console.log(`🔄 Session restored for cancelled reservation ${reservationId}. Remaining: ${cancelResult?.new_remaining ?? 'n/a'}`);

        // Sync users table for backwards compat
        if (reservation.package_id && cancelResult?.new_remaining != null) {
          const { data: updatedPkg } = await supabase
            .from('user_packages')
            .select('total_sessions, remaining_sessions')
            .eq('id', reservation.package_id)
            .single();
          if (updatedPkg) {
            const usedSessions = (updatedPkg.total_sessions || 0) - (updatedPkg.remaining_sessions || 0);
            await supabase
              .from('users')
              .update({ remaining_sessions: updatedPkg.remaining_sessions, used_sessions: usedSessions, updated_at: new Date().toISOString() })
              .eq('email', reservation.user_email);
          }
        }

        // Defensive: verify sessions_booked was actually cleaned by RPC
        if (reservation.package_id) {
          await verifySessionsBookedCleanup(supabase, reservation.package_id, reservationId, reservation.user_email);
        }

        // Audit trail: log admin cancellation
        try {
          await supabase.from('booking_changes').insert({
            reservation_id: reservationId,
            user_email: reservation.user_email,
            change_type: 'cancelled',
            old_date_key: reservation.date_key,
            old_time_slot: reservation.time_slot,
            user_name: reservation.name,
            user_surname: reservation.surname,
            package_type: reservation.package_type,
          });
        } catch (auditErr) {
          console.error('Audit log error (admin cancel):', auditErr);
        }
      }

      if (reservationStatus === 'no_show') {
        // No show - session is consumed as penalty, but mark it in attended array
        // so we know it was "used" (even though user didn't show)
        // Also remove from sessions_booked to prevent duplicate display
        if (reservation.package_id) {
          const { data: pkg } = await supabase
            .from('user_packages')
            .select('sessions_attended, sessions_booked')
            .eq('id', reservation.package_id)
            .single();

          if (pkg && !pkg.sessions_attended?.includes(reservationId)) {
            const updatedBooked = (pkg.sessions_booked || []).filter((id: string) => id !== reservationId);
            await supabase
              .from('user_packages')
              .update({
                sessions_attended: [...(pkg.sessions_attended || []), reservationId],
                sessions_booked: updatedBooked,
                updated_at: new Date().toISOString()
              })
              .eq('id', reservation.package_id);
          }

          // Check if all sessions are now consumed (attended/no-show) → mark fully_used
          await maybeMarkPackageFullyUsed(supabase, reservation.package_id);
        }
        console.log(`⚠️ No-show recorded for reservation ${reservationId}. Session consumed as penalty.`);
      }
    }

    if (paymentStatus) {
      updates.payment_status = paymentStatus;

      // Also update package payment status if linked
      if (reservation.package_id) {
        await supabase
          .from('user_packages')
          .update({
            payment_status: paymentStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', reservation.package_id);
      }
    }

    // Update reservation in Supabase
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', reservationId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating reservation:', updateError);
      return c.json({ error: 'Failed to update reservation', details: updateError.message }, 500);
    }

    console.log(`✅ Reservation ${reservationId} status updated in Supabase`);

    // Map to frontend format
    const mappedReservation = {
      id: updated.id,
      userId: updated.user_email,
      packageId: updated.package_id,
      serviceType: updated.service_type,
      dateKey: updated.date_key,
      timeSlot: updated.time_slot,
      instructor: updated.instructor,
      name: updated.name,
      surname: updated.surname,
      email: updated.user_email,
      mobile: updated.mobile,
      reservationStatus: updated.reservation_status,
      paymentStatus: updated.payment_status,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };

    return c.json({
      success: true,
      reservation: mappedReservation,
      message: 'Reservation updated successfully'
    });

  } catch (error) {
    console.error('Error updating reservation:', error);
    return c.json({ error: 'Failed to update reservation', details: (error as Error).message }, 500);
  }
});

// DELETE /reservations/:id - MIGRATED TO SUPABASE
app.delete("/make-server-b87b0c07/reservations/:id", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const reservationId = c.req.param('id');
    const supabase = getSupabase();

    // Fetch reservation from Supabase
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (fetchError || !reservation) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    // If linked to a package, restore the session atomically via RPC
    if (reservation.package_id) {
      const { data: cancelResult, error: cancelRpcError } = await supabase.rpc('cancel_reservation', {
        p_reservation_id: reservationId,
        p_package_id: reservation.package_id
      });

      if (cancelRpcError) {
        console.error('RPC error in admin delete (cancel package):', cancelRpcError);
        return c.json({ error: 'Failed to restore package session', details: cancelRpcError.message }, 500);
      }

      // Handle first_reservation_id cleanup (not in RPC)
      const { data: pkg } = await supabase
        .from('user_packages')
        .select('first_reservation_id, activation_status')
        .eq('id', reservation.package_id)
        .single();

      if (pkg && pkg.first_reservation_id === reservationId) {
        const firstResUpdate: Record<string, any> = {
          first_reservation_id: null,
          updated_at: new Date().toISOString()
        };
        if (pkg.activation_status !== 'activated') {
          firstResUpdate.package_status = 'pending';
        }
        await supabase
          .from('user_packages')
          .update(firstResUpdate)
          .eq('id', reservation.package_id);
      }

      // Sync users table
      if (cancelResult?.new_remaining != null) {
        const { data: updatedPkg } = await supabase
          .from('user_packages')
          .select('total_sessions, remaining_sessions')
          .eq('id', reservation.package_id)
          .single();
        if (updatedPkg) {
          const usedSessions = (updatedPkg.total_sessions || 0) - (updatedPkg.remaining_sessions || 0);
          await supabase
            .from('users')
            .update({ remaining_sessions: updatedPkg.remaining_sessions, used_sessions: usedSessions, updated_at: new Date().toISOString() })
            .eq('email', reservation.user_email);
        }
      }
    }

    // Audit trail: log admin removal before deleting
    try {
      await supabase.from('booking_changes').insert({
        reservation_id: reservationId,
        user_email: reservation.user_email,
        change_type: 'cancelled',
        old_date_key: reservation.date_key,
        old_time_slot: reservation.time_slot,
        user_name: reservation.name,
        user_surname: reservation.surname,
        package_type: reservation.package_type,
      });
    } catch (auditErr) {
      console.error('Audit log error (admin remove):', auditErr);
    }

    // Delete the reservation from Supabase
    const { error: deleteError } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId);

    if (deleteError) {
      console.error('Error deleting reservation:', deleteError);
      return c.json({ error: 'Failed to delete reservation', details: deleteError.message }, 500);
    }

    console.log(`🗑️ Reservation deleted from Supabase: ${reservationId}`);

    return c.json({
      success: true,
      message: 'Reservation deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting reservation:', error);
    return c.json({ error: 'Failed to delete reservation', details: (error as Error).message }, 500);
  }
});

// ============ ACTIVATION ENDPOINTS ============

// Admin-triggered activation (no activation code required)
// Called when admin clicks "Activate User" after cash payment in studio
app.post("/make-server-b87b0c07/activate", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // 1. Update user in Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .update({
        activation_status: 'activated',
        payment_status: 'paid',
        updated_at: now
      })
      .eq('email', normalizedEmail)
      .select()
      .single();

    if (userError || !user) {
      console.error('Error updating user:', userError);
      return c.json({ error: 'User not found', details: userError?.message }, 404);
    }

    // 2. Activate all pending packages for this user
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 35); // 35 days validity

    const { data: updatedPackages, error: pkgError } = await supabase
      .from('user_packages')
      .update({
        activation_status: 'activated',
        payment_status: 'paid',
        package_status: 'active',
        activation_date: now,
        expiry_date: expiryDate.toISOString(),
        updated_at: now
      })
      .eq('user_email', normalizedEmail)
      .eq('activation_status', 'pending')
      .select();

    if (pkgError) {
      console.error('Error updating packages:', pkgError);
      // Continue anyway - user might not have packages yet
    } else {
      console.log(`Updated ${updatedPackages?.length || 0} packages for ${normalizedEmail}`);

      // Confirm any pending reservations linked to the activated packages
      if (updatedPackages && updatedPackages.length > 0) {
        const packageIds = updatedPackages.map((p: any) => p.id);
        const { error: confirmError } = await supabase
          .from('reservations')
          .update({ reservation_status: 'confirmed', payment_status: 'paid', updated_at: now })
          .eq('user_email', normalizedEmail)
          .in('package_id', packageIds)
          .eq('reservation_status', 'pending');

        if (confirmError) {
          console.error('Error confirming pending reservations:', confirmError);
        }
      }
    }

    // 3. Update payment_status for ALL reservations (not just pending)
    // Don't change reservation_status - preserve attended/no_show/cancelled states
    const { error: resError } = await supabase
      .from('reservations')
      .update({
        payment_status: 'paid',
        updated_at: now
      })
      .eq('user_email', normalizedEmail)
      .neq('payment_status', 'paid');

    if (resError) {
      console.error('Error updating reservations:', resError);
      // Continue anyway
    }

    // 4. Send appropriate email based on whether user already has a password
    const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';
    let emailType = 'none';

    if (user.password_hash) {
      // Existing user — send payment confirmation email (no password setup needed)
      try {
        await sendPaymentConfirmationEmail(normalizedEmail, user.name || '', user.language || 'en');
        emailType = 'payment_confirmation';
        console.log(`Payment confirmation email sent to: ${normalizedEmail}`);
      } catch (emailError) {
        console.error('Failed to send payment confirmation email:', emailError);
      }
    } else {
      // New user — generate token and send password setup email
      const verificationToken = generateSecureToken('verify');
      const tokenKey = `verification_token:${verificationToken}`;
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 24);

      await kv.set(tokenKey, {
        id: tokenKey,
        token: verificationToken,
        email: normalizedEmail,
        expiresAt: tokenExpiry.toISOString(),
        used: false,
        createdAt: now
      });

      try {
        await sendActivationEmail(normalizedEmail, user.name || '', verificationToken, appUrl, user.language || 'en');
        emailType = 'password_setup';
        console.log(`Password setup email sent to: ${normalizedEmail}`);
      } catch (emailError) {
        console.error('Failed to send login email:', emailError);
      }
    }

    console.log(`User activated by admin: ${normalizedEmail} (email: ${emailType})`);

    return c.json({
      success: true,
      message: emailType === 'password_setup'
        ? 'User activated successfully! Login email sent.'
        : 'User activated successfully! Payment confirmation sent.',
      emailType,
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname,
        activation_status: 'activated',
        payment_status: 'paid'
      }
    });

  } catch (error) {
    console.error('Error activating user:', error);
    return c.json({ error: 'Activation failed', details: (error as Error).message }, 500);
  }
});

// Resend login email to a paid user
// POST /admin/users/:email/resend-login-email
app.post("/make-server-b87b0c07/admin/users/:email/resend-login-email", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const email = c.req.param('email');
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Note: removed payment_status check - admin can send login to unpaid users too
    // (e.g. users who missed first class and need to rebook)

    // Generate new verification token
    const verificationToken = generateSecureToken('verify');
    const tokenKey = `verification_token:${verificationToken}`;
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);

    await kv.set(tokenKey, {
      id: tokenKey,
      token: verificationToken,
      email: normalizedEmail,
      expiresAt: tokenExpiry.toISOString(),
      used: false,
      createdAt: now
    });

    // Send activation email
    const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';
    const emailResult = await sendActivationEmail(
      normalizedEmail,
      user.name || '',
      verificationToken,
      appUrl,
      user.language || 'en'
    );

    if (!emailResult.success) {
      console.error('Failed to send login email:', emailResult.error);
      return c.json({ error: 'Failed to send email', details: emailResult.error }, 500);
    }

    // Update user with email sent timestamp
    await supabase
      .from('users')
      .update({
        login_email_sent_at: now,
        updated_at: now
      })
      .eq('email', normalizedEmail);

    console.log(`Login email resent to: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: 'Login email sent successfully!',
      email: normalizedEmail,
      sentAt: now
    });

  } catch (error) {
    console.error('Error resending login email:', error);
    return c.json({ error: 'Failed to resend email', details: (error as Error).message }, 500);
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /admin/login-requests - Fetch pending login requests
app.get("/make-server-b87b0c07/admin/login-requests", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();

    // Get pending requests with user info
    const { data: requests, error } = await supabase
      .from('login_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching login requests:', error);
      return c.json({ error: 'Failed to fetch requests' }, 500);
    }

    // Enrich with user details
    const enrichedRequests = [];
    for (const req of requests || []) {
      const { data: user } = await supabase
        .from('users')
        .select('name, surname, email, payment_status, activation_status')
        .eq('email', req.user_email)
        .maybeSingle();

      const { data: packages } = await supabase
        .from('user_packages')
        .select('package_type, package_status, payment_status, remaining_sessions, total_sessions')
        .eq('user_email', req.user_email)
        .order('created_at', { ascending: false })
        .limit(1);

      enrichedRequests.push({
        id: req.id,
        email: req.user_email,
        name: user?.name || '',
        surname: user?.surname || '',
        paymentStatus: user?.payment_status || 'unpaid',
        package: packages?.[0] || null,
        createdAt: req.created_at
      });
    }

    return c.json({ requests: enrichedRequests });

  } catch (error) {
    console.error('Error in login-requests:', error);
    return c.json({ error: 'Failed to fetch requests' }, 500);
  }
});

// POST /admin/login-requests/:id/approve - Approve a login request and send credentials
app.post("/make-server-b87b0c07/admin/login-requests/:id/approve", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const requestId = c.req.param('id');
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Get the request
    const { data: loginRequest, error: reqError } = await supabase
      .from('login_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !loginRequest) {
      return c.json({ error: 'Login request not found' }, 404);
    }

    if (loginRequest.status !== 'pending') {
      return c.json({ error: 'Request already processed' }, 400);
    }

    const normalizedEmail = loginRequest.user_email;

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Generate verification token (same as existing resend-login flow)
    const verificationToken = generateSecureToken('verify');
    const tokenKey = `verification_token:${verificationToken}`;
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);

    await kv.set(tokenKey, {
      id: tokenKey,
      token: verificationToken,
      email: normalizedEmail,
      expiresAt: tokenExpiry.toISOString(),
      used: false,
      createdAt: now
    });

    // Send activation email with password setup link
    const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';
    const emailResult = await sendActivationEmail(
      normalizedEmail,
      user.name || '',
      verificationToken,
      appUrl,
      user.language || 'en'
    );

    if (!emailResult.success) {
      console.error('Failed to send login email:', emailResult.error);
      return c.json({ error: 'Failed to send email', details: emailResult.error }, 500);
    }

    // Mark request as approved
    await supabase
      .from('login_requests')
      .update({ status: 'approved', updated_at: now })
      .eq('id', requestId);

    // Update user login email timestamp
    await supabase
      .from('users')
      .update({ login_email_sent_at: now, updated_at: now })
      .eq('email', normalizedEmail);

    console.log(`✅ Login request approved for: ${normalizedEmail}`);
    return c.json({ success: true, message: 'Login email sent successfully!' });

  } catch (error) {
    console.error('Error approving login request:', error);
    return c.json({ error: 'Failed to approve request' }, 500);
  }
});

// POST /admin/login-requests/:id/dismiss - Dismiss a login request
app.post("/make-server-b87b0c07/admin/login-requests/:id/dismiss", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const requestId = c.req.param('id');
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('login_requests')
      .update({ status: 'dismissed', updated_at: now })
      .eq('id', requestId);

    if (error) {
      return c.json({ error: 'Failed to dismiss request' }, 500);
    }

    return c.json({ success: true });

  } catch (error) {
    console.error('Error dismissing login request:', error);
    return c.json({ error: 'Failed to dismiss request' }, 500);
  }
});

// Get all users with aggregated package and payment data - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/admin/users", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();

    // Fetch users from Supabase
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users from Supabase:', usersError);
      return c.json({ error: 'Failed to fetch users', details: usersError.message }, 500);
    }

    // Fetch reservations from Supabase
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false });

    if (resError) {
      console.error('Error fetching reservations from Supabase:', resError);
      return c.json({ error: 'Failed to fetch reservations', details: resError.message }, 500);
    }

    // Fetch all user_packages (full details for multi-package support)
    const { data: userPackages, error: pkgError } = await supabase
      .from('user_packages')
      .select('id, user_email, package_type, package_status, activation_status, payment_status, total_sessions, remaining_sessions, base_sessions, bonus_classes, activation_date, expiry_date, purchase_date, created_at')
      .order('created_at', { ascending: false });

    if (pkgError) {
      console.error('Error fetching user_packages:', pkgError);
      // Non-fatal: continue without package dates
    }

    // Build user summaries with package info from users table
    const userSummaries = (users || []).map((user: any) => {
      // Find reservations for this user
      const userReservations = (reservations || []).filter(
        (res: any) => res.user_email === user.email
      );

      // Get ALL packages for this user from user_packages table
      const userPkgs = (userPackages || []).filter(
        (pkg: any) => pkg.user_email === user.email
      );

      const packages = userPkgs.map((pkg: any) => ({
        id: pkg.id,
        type: pkg.package_type,
        status: pkg.package_status || 'pending',
        paymentStatus: pkg.payment_status || 'unpaid',
        activationStatus: pkg.activation_status || 'pending',
        totalSessions: pkg.total_sessions || 0,
        remainingSessions: pkg.remaining_sessions || 0,
        baseSessions: pkg.base_sessions || 0,
        bonusClasses: pkg.bonus_classes || 0,
        createdAt: pkg.created_at,
        purchaseDate: pkg.purchase_date || pkg.created_at,
        activationDate: pkg.activation_date || null,
        expiryDate: pkg.expiry_date || null,
      }));

      // Aggregate totals across all packages
      const totalSessions = packages.reduce((sum: number, p: any) => sum + p.totalSessions, 0);
      const remainingSessions = packages.reduce((sum: number, p: any) => sum + p.remainingSessions, 0);
      const usedSessions = totalSessions - remainingSessions;
      const userPaymentStatus = user.payment_status === 'paid' ? 'paid' : 'unpaid';
      const hasPaidOrActivatedPackage = packages.some((p: any) =>
        p.paymentStatus === 'paid' || p.activationStatus === 'activated'
      );
      const effectivePaymentStatus = (userPaymentStatus === 'paid' || hasPaidOrActivatedPackage) ? 'paid' : 'unpaid';

      // Derive user flag from package state
      const hasUnpaidPackage = packages.some((p: any) =>
        p.paymentStatus === 'unpaid' && p.status === 'pending'
      );
      const isNewUser = !user.password_hash;
      const hasActivePackage = packages.some((p: any) =>
        p.status === 'active'
      );
      const now = getSkopjeTime();
      const hasExpiringPackage = packages.some((p: any) => {
        if (p.status !== 'active' || !p.expiryDate) return false;
        const daysLeft = (new Date(p.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return daysLeft <= 5 && daysLeft > 0;
      });
      const terminalStatuses = ['fully_used', 'expired', 'cancelled'];
      const allTerminal = packages.length > 0 && packages.every((p: any) => terminalStatuses.includes(p.status));

      let flag: string;
      let flagMessage: string;
      if (hasUnpaidPackage) {
        const unpaidCount = packages.filter((p: any) => p.paymentStatus === 'unpaid' && p.status === 'pending').length;
        flag = 'needs_payment';
        flagMessage = `${unpaidCount} package${unpaidCount > 1 ? 's' : ''} awaiting payment`;
      } else if (isNewUser && hasActivePackage) {
        flag = 'new_user';
        flagMessage = 'New user, password not yet set';
      } else if (hasExpiringPackage) {
        const expiringPkg = packages.find((p: any) => {
          if (p.status !== 'active' || !p.expiryDate) return false;
          const daysLeft = (new Date(p.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysLeft <= 5 && daysLeft > 0;
        });
        const daysLeft = Math.ceil((new Date(expiringPkg.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        flag = 'expiring';
        flagMessage = `Package expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
      } else if (hasActivePackage) {
        flag = 'active';
        flagMessage = 'All packages active';
      } else if (allTerminal) {
        flag = 'inactive';
        flagMessage = 'No active packages';
      } else {
        flag = 'inactive';
        flagMessage = 'No packages';
      }

      return {
        id: user.id,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile,
        email: user.email,
        paymentStatus: effectivePaymentStatus,
        packages,
        reservations: userReservations.map((res: any) => ({
          id: res.id,
          dateKey: res.date_key,
          timeSlot: res.time_slot,
          reservationStatus: res.reservation_status,
          paymentStatus: res.payment_status,
          packageId: res.package_id,
          createdAt: res.created_at,
        })),
        activeReservationCount: userReservations.filter(
          (res: any) => res.reservation_status !== 'cancelled'
        ).length,
        totalSessions,
        usedSessions,
        remainingSessions,
        sessionsAdjustedAt: user.sessions_adjusted_at || null,
        createdAt: user.created_at,
        blocked: user.blocked || false,
        flag,
        flagMessage,
      };
    });

    console.log(`👥 Retrieved ${userSummaries.length} users from Supabase`);

    return c.json({
      success: true,
      users: userSummaries,
      total: userSummaries.length,
      paid: userSummaries.filter((u: any) => u.paymentStatus === 'paid').length,
      unpaid: userSummaries.filter((u: any) => u.paymentStatus === 'unpaid').length,
    });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return c.json({ error: 'Failed to fetch users', details: error.message }, 500);
  }
});

// GET /admin/consistency-check - Per-user data consistency audit (admin only)
app.get("/make-server-b87b0c07/admin/consistency-check", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();
    const now = getSkopjeTime();
    const todayDateKey = formatDateKey(now);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, payment_status, remaining_sessions, used_sessions, created_at');

    if (usersError) {
      return c.json({ error: 'Failed to fetch users', details: usersError.message }, 500);
    }

    const { data: userPackages, error: packagesError } = await supabase
      .from('user_packages')
      .select('id, user_email, total_sessions, remaining_sessions, sessions_booked, sessions_attended, payment_status, package_status, first_reservation_id, created_at');

    if (packagesError) {
      return c.json({ error: 'Failed to fetch user packages', details: packagesError.message }, 500);
    }

    const { data: reservations, error: reservationsError } = await supabase
      .from('reservations')
      .select('id, user_email, package_id, date_key, time_slot, reservation_status, payment_status, created_at');

    if (reservationsError) {
      return c.json({ error: 'Failed to fetch reservations', details: reservationsError.message }, 500);
    }

    const isIsoDateKey = (dateKey: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(dateKey || '');
    const isLegacyDateKey = (dateKey: string): boolean => /^\d{1,2}-\d{1,2}$/.test(dateKey || '');

    const parseFlexibleDateTime = (dateKey: string, timeSlot: string): Date | null => {
      if (!dateKey || !timeSlot) return null;

      let year: number;
      let month: number;
      let day: number;

      if (isIsoDateKey(dateKey)) {
        const parsed = parseDateKey(dateKey);
        if (!parsed) return null;
        year = parsed.getFullYear();
        month = parsed.getMonth() + 1;
        day = parsed.getDate();
      } else if (isLegacyDateKey(dateKey)) {
        const [m, d] = dateKey.split('-').map(Number);
        year = now.getFullYear();
        month = m;
        day = d;
      } else {
        return null;
      }

      const [hours, minutes] = (timeSlot || '').split(':').map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return new Date(year, month - 1, day, hours, minutes);
    };

    const reservationById = new Map<string, any>();
    const reservationsByUser = new Map<string, any[]>();
    const packagesByUser = new Map<string, any[]>();

    for (const reservation of reservations || []) {
      reservationById.set(reservation.id, reservation);
      const key = normalizeEmail(reservation.user_email || '');
      const bucket = reservationsByUser.get(key) || [];
      bucket.push(reservation);
      reservationsByUser.set(key, bucket);
    }

    for (const pkg of userPackages || []) {
      const key = normalizeEmail(pkg.user_email || '');
      const bucket = packagesByUser.get(key) || [];
      bucket.push(pkg);
      packagesByUser.set(key, bucket);
    }

    const reportUsers = (users || []).map((user: any) => {
      const normalizedEmail = normalizeEmail(user.email || '');
      const pkgs = packagesByUser.get(normalizedEmail) || [];
      const userReservations = reservationsByUser.get(normalizedEmail) || [];
      const issues: Array<{ code: string; details: string }> = [];

      const nonIsoDateKeys = userReservations
        .map((r: any) => r.date_key)
        .filter((dk: string) => dk && !isIsoDateKey(dk));
      if (nonIsoDateKeys.length > 0) {
        const unique = Array.from(new Set(nonIsoDateKeys)).slice(0, 5);
        issues.push({
          code: 'legacy_or_invalid_date_key',
          details: `Found non-ISO date_key values (sample: ${unique.join(', ')})`
        });
      }

      const totalSessionsFromPackages = pkgs.reduce((sum: number, p: any) => sum + (p.total_sessions || 0), 0);
      const remainingSessionsFromPackages = pkgs.reduce((sum: number, p: any) => sum + (p.remaining_sessions || 0), 0);
      const usedSessionsFromPackages = totalSessionsFromPackages - remainingSessionsFromPackages;

      if (
        user.remaining_sessions !== null &&
        user.remaining_sessions !== undefined &&
        user.remaining_sessions !== remainingSessionsFromPackages
      ) {
        issues.push({
          code: 'users_remaining_sessions_mismatch',
          details: `users.remaining_sessions=${user.remaining_sessions}, aggregated_packages_remaining=${remainingSessionsFromPackages}`
        });
      }

      if (
        user.used_sessions !== null &&
        user.used_sessions !== undefined &&
        user.used_sessions !== usedSessionsFromPackages
      ) {
        issues.push({
          code: 'users_used_sessions_mismatch',
          details: `users.used_sessions=${user.used_sessions}, aggregated_packages_used=${usedSessionsFromPackages}`
        });
      }

      const latestPkg = [...pkgs].sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )[0];

      if (latestPkg && user.payment_status && latestPkg.payment_status && user.payment_status !== latestPkg.payment_status) {
        issues.push({
          code: 'payment_status_mismatch_latest_package',
          details: `users.payment_status=${user.payment_status}, latest_package.payment_status=${latestPkg.payment_status}`
        });
      }

      for (const pkg of pkgs) {
        const bookedIds = Array.isArray(pkg.sessions_booked) ? pkg.sessions_booked : [];
        const attendedIds = Array.isArray(pkg.sessions_attended) ? pkg.sessions_attended : [];

        for (const reservationId of [...bookedIds, ...attendedIds]) {
          const ref = reservationById.get(reservationId);
          if (!ref) {
            issues.push({
              code: 'dangling_reservation_reference',
              details: `package_id=${pkg.id} references missing reservation_id=${reservationId}`
            });
            continue;
          }

          if (normalizeEmail(ref.user_email || '') !== normalizedEmail) {
            issues.push({
              code: 'reservation_user_mismatch',
              details: `package_id=${pkg.id} references reservation_id=${reservationId} owned by ${ref.user_email}`
            });
          }

          if (ref.package_id && ref.package_id !== pkg.id) {
            issues.push({
              code: 'reservation_package_mismatch',
              details: `package_id=${pkg.id} references reservation_id=${reservationId} with package_id=${ref.package_id}`
            });
          }
        }

        const cancelledStillBooked = bookedIds.filter((reservationId: string) => {
          const ref = reservationById.get(reservationId);
          return ref && ref.reservation_status === 'cancelled';
        });

        if (cancelledStillBooked.length > 0) {
          issues.push({
            code: 'cancelled_reservation_still_in_sessions_booked',
            details: `package_id=${pkg.id} has ${cancelledStillBooked.length} cancelled reservation(s) in sessions_booked`
          });
        }

        const expectedRemaining = Math.max(0, (pkg.total_sessions || 0) - bookedIds.length - attendedIds.length);
        if (pkg.remaining_sessions !== expectedRemaining) {
          issues.push({
            code: 'package_remaining_sessions_mismatch',
            details: `package_id=${pkg.id}, remaining_sessions=${pkg.remaining_sessions}, expected=${expectedRemaining} (total - booked - attended)`
          });
        }

        if (pkg.first_reservation_id) {
          const firstRef = reservationById.get(pkg.first_reservation_id);
          if (!firstRef) {
            issues.push({
              code: 'missing_first_reservation',
              details: `package_id=${pkg.id} has first_reservation_id=${pkg.first_reservation_id} but reservation does not exist`
            });
          } else if (firstRef.reservation_status === 'cancelled') {
            issues.push({
              code: 'cancelled_first_reservation',
              details: `package_id=${pkg.id} first_reservation_id=${pkg.first_reservation_id} is cancelled`
            });
          }
        }

        if (pkg.payment_status !== 'paid') {
          const upcomingActiveCount = userReservations.filter((r: any) => {
            if (r.package_id !== pkg.id) return false;
            if (!(r.reservation_status === 'pending' || r.reservation_status === 'confirmed')) return false;

            const dt = parseFlexibleDateTime(r.date_key, r.time_slot);
            if (!dt) return false;
            return formatDateKey(dt) >= todayDateKey;
          }).length;

          if (upcomingActiveCount > 1) {
            issues.push({
              code: 'unpaid_package_booking_limit_violation',
              details: `package_id=${pkg.id} is unpaid and has ${upcomingActiveCount} upcoming pending/confirmed bookings`
            });
          }
        }
      }

      return {
        userId: user.id,
        email: normalizedEmail,
        issueCount: issues.length,
        issues,
        stats: {
          packageCount: pkgs.length,
          reservationCount: userReservations.length,
          usersRemainingSessions: user.remaining_sessions,
          usersUsedSessions: user.used_sessions,
          aggregatedRemainingSessions: remainingSessionsFromPackages,
          aggregatedUsedSessions: usedSessionsFromPackages
        }
      };
    });

    const usersWithIssues = reportUsers.filter((u: any) => u.issueCount > 0);
    const totalIssues = usersWithIssues.reduce((sum: number, u: any) => sum + u.issueCount, 0);

    return c.json({
      success: true,
      checkedAt: new Date().toISOString(),
      summary: {
        totalUsers: reportUsers.length,
        usersWithIssues: usersWithIssues.length,
        totalIssues
      },
      users: reportUsers
    });
  } catch (error) {
    console.error('Error running consistency check:', error);
    return c.json({ error: 'Failed consistency check', details: (error as Error).message }, 500);
  }
});

// Update payment status for a user's package
// PATCH /admin/users/:email/payment - MIGRATED TO SUPABASE
app.patch("/make-server-b87b0c07/admin/users/:email/payment", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const email = c.req.param('email');
    const body = await c.req.json();
    const { paymentStatus } = body; // 'paid' or 'unpaid'

    if (!email || !paymentStatus) {
      return c.json({ error: "Email and paymentStatus are required" }, 400);
    }

    if (paymentStatus !== 'paid' && paymentStatus !== 'unpaid') {
      return c.json({ error: "paymentStatus must be 'paid' or 'unpaid'" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Fetch user to check password_hash
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('name, password_hash, language')
      .eq('email', normalizedEmail)
      .single();

    if (fetchError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Update user payment status
    const { data: userUpdate, error: userError } = await supabase
      .from('users')
      .update({
        payment_status: paymentStatus,
        activation_status: paymentStatus === 'paid' ? 'activated' : undefined,
        updated_at: now,
      })
      .eq('email', normalizedEmail)
      .select();

    if (userError) {
      console.error('Error updating user payment status:', userError);
      return c.json({ error: 'Failed to update user', details: userError.message }, 500);
    }

    // Update user_packages — when marking paid, also activate pending packages
    if (paymentStatus === 'paid') {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 35);

      const { data: activatedPkgs, error: pkgError } = await supabase
        .from('user_packages')
        .update({
          payment_status: 'paid',
          activation_status: 'activated',
          package_status: 'active',
          activation_date: now,
          expiry_date: expiryDate.toISOString(),
          updated_at: now,
        })
        .eq('user_email', normalizedEmail)
        .eq('activation_status', 'pending')
        .select();

      if (pkgError) {
        console.error('Error activating user_packages:', pkgError);
      }

      // Also update already-active packages' payment status
      await supabase
        .from('user_packages')
        .update({ payment_status: 'paid', updated_at: now })
        .eq('user_email', normalizedEmail)
        .neq('activation_status', 'pending');

      // Confirm pending reservations linked to activated packages
      if (activatedPkgs && activatedPkgs.length > 0) {
        const packageIds = activatedPkgs.map((p: any) => p.id);
        await supabase
          .from('reservations')
          .update({ reservation_status: 'confirmed', payment_status: 'paid', updated_at: now })
          .eq('user_email', normalizedEmail)
          .in('package_id', packageIds)
          .eq('reservation_status', 'pending');
      }
    } else {
      // Setting to unpaid
      const { error: pkgError } = await supabase
        .from('user_packages')
        .update({ payment_status: 'unpaid', updated_at: now })
        .eq('user_email', normalizedEmail);

      if (pkgError) {
        console.error('Error updating user_packages payment status:', pkgError);
      }
    }

    // Update all reservations payment_status
    const { data: resUpdate, error: resError } = await supabase
      .from('reservations')
      .update({ payment_status: paymentStatus, updated_at: now })
      .eq('user_email', normalizedEmail)
      .select();

    if (resError) {
      console.error('Error updating reservations payment status:', resError);
    }

    // Send email when marking as paid
    let emailType = 'none';
    if (paymentStatus === 'paid') {
      const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';

      if (user.password_hash) {
        // Existing user — payment confirmation email
        try {
          await sendPaymentConfirmationEmail(normalizedEmail, user.name || '', user.language || 'en');
          emailType = 'payment_confirmation';
        } catch (emailError) {
          console.error('Failed to send payment confirmation email:', emailError);
        }
      } else {
        // New user — password setup email
        const verificationToken = generateSecureToken('verify');
        const tokenKey = `verification_token:${verificationToken}`;
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        await kv.set(tokenKey, {
          id: tokenKey,
          token: verificationToken,
          email: normalizedEmail,
          expiresAt: tokenExpiry.toISOString(),
          used: false,
          createdAt: now
        });

        try {
          await sendActivationEmail(normalizedEmail, user.name || '', verificationToken, appUrl, user.language || 'en');
          emailType = 'password_setup';
        } catch (emailError) {
          console.error('Failed to send activation email:', emailError);
        }
      }
    }

    console.log(`💳 Payment status updated to '${paymentStatus}' for user: ${normalizedEmail} (email: ${emailType})`);

    return c.json({
      success: true,
      message: paymentStatus === 'paid'
        ? (emailType === 'password_setup' ? 'Paid! Login email sent.' : 'Paid! Confirmation email sent.')
        : 'Payment status updated to unpaid.',
      emailType,
      userUpdated: userUpdate?.length || 0,
      reservationsUpdated: resUpdate?.length || 0,
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    return c.json({ error: 'Failed to update payment status', details: error.message }, 500);
  }
});

// Activate a SINGLE package by ID
// PATCH /admin/packages/:id/payment
app.patch("/make-server-b87b0c07/admin/packages/:id/payment", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const packageId = c.req.param('id');
    const { paymentStatus } = await c.req.json();

    if (!paymentStatus || !['paid', 'unpaid'].includes(paymentStatus)) {
      return c.json({ error: 'Invalid paymentStatus' }, 400);
    }

    const supabase = getSupabase();

    // Fetch the package
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const userEmail = pkg.user_email;

    // Fetch the user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (paymentStatus === 'paid') {
      const now = getSkopjeTime();

      if (pkg.activation_status === 'pending') {
        const expiryDate = new Date(now);
        expiryDate.setDate(expiryDate.getDate() + 35);

        await supabase
          .from('user_packages')
          .update({
            payment_status: 'paid',
            activation_status: 'activated',
            package_status: 'active',
            activation_date: now.toISOString(),
            expiry_date: expiryDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId);
      } else {
        await supabase
          .from('user_packages')
          .update({
            payment_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId);
      }

      // Confirm pending reservations linked to THIS package only
      const { data: pendingRes } = await supabase
        .from('reservations')
        .select('id')
        .eq('package_id', packageId)
        .eq('reservation_status', 'pending');

      if (pendingRes && pendingRes.length > 0) {
        const pendingIds = pendingRes.map((r: any) => r.id);
        await supabase
          .from('reservations')
          .update({
            reservation_status: 'confirmed',
            payment_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .in('id', pendingIds);
      }

      // Ensure user is activated (first-time onboarding)
      if (user.activation_status !== 'activated') {
        await supabase
          .from('users')
          .update({
            activation_status: 'activated',
            updated_at: new Date().toISOString(),
          })
          .eq('email', userEmail);
      }

      // Email logic
      let emailType = 'none';
      const userLang = pkg.language || user.language || 'en';
      const appUrl = 'https://app.wellnestpilates.com';

      try {
        if (user.password_hash) {
          await sendPaymentConfirmationEmail(userEmail, user.name || pkg.name || '', userLang);
          emailType = 'payment_confirmation';
        } else {
          const verificationToken = generateSecureToken('verify');
          const tokenKey = `verification_token:${verificationToken}`;
          const tokenExpiry = new Date();
          tokenExpiry.setHours(tokenExpiry.getHours() + 24);

          await kv.set(tokenKey, {
            id: tokenKey,
            token: verificationToken,
            email: userEmail,
            expiresAt: tokenExpiry.toISOString(),
            used: false,
            createdAt: now.toISOString(),
          });

          await sendActivationEmail(userEmail, user.name || pkg.name || '', verificationToken, appUrl, userLang);
          emailType = 'password_setup';
        }
      } catch (emailError) {
        console.error(`Email sending failed for ${userEmail}:`, emailError);
      }

      console.log(`✅ Package ${packageId} marked paid for ${userEmail} (email: ${emailType})`);
      return c.json({ success: true, emailType });

    } else {
      // MARK THIS PACKAGE UNPAID
      await supabase
        .from('user_packages')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', packageId);

      await supabase
        .from('reservations')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('package_id', packageId);

      console.log(`❌ Package ${packageId} marked unpaid for ${userEmail}`);
      return c.json({ success: true });
    }

  } catch (error) {
    console.error('Error updating package payment:', error);
    return c.json({ error: 'Failed to update payment', details: (error as Error).message }, 500);
  }
});

// DELETE /admin/packages/:id - Remove an unpaid package (admin only)
app.delete("/make-server-b87b0c07/admin/packages/:id", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const packageId = c.req.param('id');
    const supabase = getSupabase();

    // Fetch the package
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('id, user_email, package_type, payment_status, package_status')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    // Only allow deleting unpaid packages
    if (pkg.payment_status === 'paid') {
      return c.json({ error: 'Cannot remove a paid package' }, 400);
    }

    // Delete linked reservations first (pending ones for this package)
    const { data: deletedRes } = await supabase
      .from('reservations')
      .delete()
      .eq('package_id', packageId)
      .in('reservation_status', ['pending', 'confirmed'])
      .select('id');

    // Delete the package
    const { error: delError } = await supabase
      .from('user_packages')
      .delete()
      .eq('id', packageId);

    if (delError) {
      console.error('Error deleting package:', delError);
      return c.json({ error: 'Failed to delete package', details: delError.message }, 500);
    }

    console.log(`🗑️ Package ${packageId} (${pkg.package_type}) removed for ${pkg.user_email}, ${deletedRes?.length || 0} reservations deleted`);
    return c.json({ success: true, deletedReservations: deletedRes?.length || 0 });
  } catch (error) {
    console.error('Error deleting package:', error);
    return c.json({ error: 'Failed to delete package', details: (error as Error).message }, 500);
  }
});

// Adjust remaining sessions for a user (+1 or -1)
// PATCH /admin/users/:email/adjust-sessions
app.patch("/make-server-b87b0c07/admin/users/:email/adjust-sessions", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const email = c.req.param('email');
    const body = await c.req.json();
    const { adjustment } = body; // +1 or -1

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    if (adjustment !== 1 && adjustment !== -1) {
      return c.json({ error: "Adjustment must be +1 or -1" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // Get active/pending package (source of truth for remaining sessions)
    const { data: activePkg, error: pkgFetchError } = await supabase
      .from('user_packages')
      .select('id, remaining_sessions, total_sessions, package_type, package_status')
      .eq('user_email', normalizedEmail)
      .in('package_status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pkgFetchError || !activePkg) {
      console.error('Error fetching active package:', pkgFetchError);
      return c.json({ error: 'No active package found' }, 404);
    }

    const currentRemaining = activePkg.remaining_sessions || 0;
    const totalSessions = activePkg.total_sessions || 8;
    const newRemaining = currentRemaining + adjustment;

    // Validate bounds
    if (newRemaining < 0) {
      return c.json({ error: 'Cannot reduce below 0 sessions' }, 400);
    }
    if (newRemaining > totalSessions) {
      return c.json({ error: 'Cannot exceed total sessions' }, 400);
    }

    // Update the specific package and sync users table
    const adjustedAt = new Date().toISOString();
    const [{ error: pkgUpdateError }, { error: userUpdateError }] = await Promise.all([
      supabase
        .from('user_packages')
        .update({
          remaining_sessions: newRemaining,
          sessions_adjusted_at: adjustedAt,
          updated_at: adjustedAt,
        })
        .eq('id', activePkg.id),
      supabase
        .from('users')
        .update({
          remaining_sessions: newRemaining,
          used_sessions: totalSessions - newRemaining,
          sessions_adjusted_at: adjustedAt,
          updated_at: adjustedAt,
        })
        .eq('email', normalizedEmail),
    ]);

    if (pkgUpdateError) {
      console.error('Error updating package:', pkgUpdateError);
      return c.json({ error: 'Failed to update package' }, 500);
    }
    if (userUpdateError) {
      console.error('Error syncing users table:', userUpdateError);
    }

    console.log(`📊 Sessions adjusted for ${normalizedEmail} (pkg ${activePkg.id}): ${currentRemaining} → ${newRemaining} (${adjustment > 0 ? '+1' : '-1'})`);

    // If remaining hit 0, check if package should be marked fully_used
    if (newRemaining === 0) {
      await maybeMarkPackageFullyUsed(supabase, activePkg.id);
    }

    return c.json({
      success: true,
      email: normalizedEmail,
      remainingSessions: newRemaining,
      sessionsAdjustedAt: adjustedAt,
      totalSessions: totalSessions,
      usedSessions: totalSessions - newRemaining,
    });
  } catch (error) {
    console.error('Error adjusting sessions:', error);
    return c.json({ error: 'Failed to adjust sessions', details: error.message }, 500);
  }
});

// DELETE /users/:email - Delete a user and all their data
app.delete("/make-server-b87b0c07/users/:email", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const emailParam = c.req.param('email');
    if (!emailParam) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Decode URL-encoded email and normalize
    const email = decodeURIComponent(emailParam);
    const normalizedEmail = normalizeEmail(email);
    console.log(`🗑️ Delete user request for: ${normalizedEmail}`);
    const supabase = getSupabase();

    // Check if user exists
    const { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userFetchError) {
      console.error('Error fetching user:', userFetchError);
      return c.json({ error: 'Failed to fetch user' }, 500);
    }

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Delete in cascade order:

    // 1. Delete reservations
    const { error: resError } = await supabase
      .from('reservations')
      .delete()
      .eq('user_email', normalizedEmail);

    if (resError) {
      console.error('Error deleting reservations:', resError);
    }

    // 2. Delete user_packages
    const { error: pkgError } = await supabase
      .from('user_packages')
      .delete()
      .eq('user_email', normalizedEmail);

    if (pkgError) {
      console.error('Error deleting packages:', pkgError);
    }

    // 3. Delete user
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('email', normalizedEmail);

    if (userError) {
      console.error('Error deleting user:', userError);
      return c.json({ error: 'Failed to delete user', details: userError.message }, 500);
    }

    console.log(`🗑️ Deleted user: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: `User ${normalizedEmail} and all related data deleted successfully`
    });

  } catch (error) {
    console.error('Error in delete user:', error);
    return c.json({ error: 'Delete failed', details: (error as Error).message }, 500);
  }
});

// ============ LEGACY ENDPOINTS ============

// GET /bookings - MIGRATED TO SUPABASE (Admin only - returns user PII)
app.get("/make-server-b87b0c07/bookings", async (c) => {
  try {
    // Verify admin session - this endpoint exposes user PII
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const userId = c.req.query('userId');
    const dateKey = c.req.query('dateKey');

    const supabase = getSupabase();
    let query = supabase.from('reservations').select('*');

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      query = query.eq('user_email', normalizedEmail);
    }

    if (dateKey) {
      query = query.in('date_key', getDateKeyVariants(dateKey));
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings from Supabase:', error);
      return c.json({ error: 'Failed to fetch bookings', details: error.message }, 500);
    }

    // Map Supabase fields to expected frontend format
    const bookings = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      surname: r.surname,
      mobile: r.mobile,
      email: r.user_email,
      date: r.date_key,
      dateKey: r.date_key,
      timeSlot: r.time_slot,
      instructor: r.instructor || '',
      selectedPackage: r.package_type,
      payInStudio: r.payment_status !== 'paid',
      language: 'EN',
      status: r.reservation_status || 'pending',
      createdAt: r.created_at,
      userId: r.user_email,
      reservationStatus: r.reservation_status,
      paymentStatus: r.payment_status,
      isFriendBooking: r.is_friend_booking || false,
      serviceType: r.service_type || 'single',
      packageId: r.package_id,
    }));

    console.log(`📅 Retrieved ${bookings.length} bookings from Supabase`);

    return c.json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return c.json({ error: 'Failed to fetch bookings', details: error.message }, 500);
  }
});

// ============ MIGRATION ENDPOINT ============

app.post("/make-server-b87b0c07/migrate-bookings", async (c) => {
  // Verify admin session - migration is admin-only
  const adminAuth = await verifyAdminSession(c);
  if (!adminAuth.valid) {
    return c.json({ error: adminAuth.error }, 401);
  }

  const stats = {
    reservations: 0,
    orphanedPackages: 0,
    linkedReservations: 0,
    activationCodes: 0,
    errors: [] as string[]
  };
  
  try {
    const oldBookings = await kv.getByPrefix('booking:');
    console.log(`Found ${oldBookings.length} old bookings to migrate`);
    
    for (const booking of oldBookings) {
      try {
        if (booking.dateKey && booking.timeSlot) {
          const serviceType = booking.selectedPackage?.includes('individual') ? 'individual' 
                            : booking.selectedPackage?.includes('duo') ? 'duo'
                            : booking.selectedPackage ? 'package' 
                            : 'single';
          
          const reservation = {
            id: `reservation:${booking.id.replace('booking:', '')}`,
            userId: normalizeEmail(booking.email),
            packageId: null,
            serviceType,
            sessionNumber: null,
            dateKey: booking.dateKey,
            date: booking.date,
            fullDate: constructFullDate(booking.dateKey, booking.timeSlot),
            timeSlot: booking.timeSlot,
            endTime: calculateEndTime(booking.timeSlot),
            instructor: booking.instructor || '',
            name: booking.name,
            surname: booking.surname,
            email: normalizeEmail(booking.email),
            mobile: booking.mobile,
            partnerName: null,
            partnerSurname: null,
            reservationStatus: booking.status === 'confirmed' ? 'confirmed' : 'pending',
            paymentStatus: 'unpaid' as PaymentStatus,
            seatsOccupied: serviceType === 'duo' ? 2 : (serviceType === 'individual' ? 4 : 1),
            isPrivateSession: serviceType === 'individual',
            isOverbooked: false,
            isFirstSessionOfPackage: false,
            autoConfirmed: false,
            lateCancellation: false,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt || booking.createdAt,
            activatedAt: booking.activatedAt || null,
            attendedAt: null,
            language: booking.language || 'en'
          };
          
          await kv.set(reservation.id, reservation);
          stats.reservations++;
        } 
        else if (booking.selectedPackage) {
          const packageType = booking.selectedPackage.includes('10') ? 'package10'
                           : booking.selectedPackage.includes('8') ? 'package8'
                           : booking.selectedPackage.includes('12') ? 'package12'
                           : booking.selectedPackage.includes('individual1') ? 'individual1'
                           : booking.selectedPackage.includes('individual8') ? 'individual8'
                           : booking.selectedPackage.includes('individual12') ? 'individual12'
                           : booking.selectedPackage.includes('duo1') ? 'duo1'
                           : booking.selectedPackage.includes('duo8') ? 'duo8'
                           : booking.selectedPackage.includes('duo12') ? 'duo12'
                           : 'package8';
          
          const totalSessions = extractSessionCount(packageType);
          const normalizedEmail = normalizeEmail(booking.email);
          
          const pkg = {
            id: `package:${normalizedEmail}:${Date.parse(booking.createdAt)}`,
            userId: normalizedEmail,
            packageType,
            totalSessions,
            remainingSessions: totalSessions,
            sessionsBooked: [],
            sessionsAttended: [],
            purchaseDate: booking.createdAt,
            activationDate: booking.activatedAt || null,
            expiryDate: booking.activatedAt ? calculateExpiry(booking.activatedAt) : null,
            packageStatus: (booking.status === 'cancelled' ? 'cancelled' 
                          : booking.activatedAt ? 'active' 
                          : 'pending') as PackageStatus,
            activationStatus: (booking.status === 'confirmed' ? 'activated' : 'pending') as ActivationStatus,
            paymentStatus: 'unpaid' as PaymentStatus,
            firstReservationId: null,
            paymentId: null,
            name: booking.name,
            surname: booking.surname,
            mobile: booking.mobile,
            email: normalizedEmail,
            language: booking.language || 'en',
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt || booking.createdAt
          };
          
          await kv.set(pkg.id, pkg);
          await kv.set(`orphaned_package:${pkg.id}`, {userId: normalizedEmail});
          stats.orphanedPackages++;
        }
      } catch (error) {
        console.error(`Error migrating booking ${booking.id}:`, error);
        stats.errors.push(`Booking ${booking.id}: ${error.message}`);
      }
    }
    
    console.log(`Migration complete: ${stats.reservations} reservations, ${stats.orphanedPackages} orphaned packages`);
    
    return c.json({ 
      success: true, 
      migrated: stats,
      message: "Migration completed. Please review orphaned packages."
    });
    
  } catch (error) {
    console.error("Migration error:", error);
    stats.errors.push(error.message);
    return c.json({ success: false, stats, error: error.message }, 500);
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /admin/calendar - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/admin/calendar", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const dateKey = c.req.query('dateKey');

    if (!dateKey) {
      return c.json({ error: "dateKey parameter required" }, 400);
    }

    const supabase = getSupabase();
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .in('date_key', getDateKeyVariants(dateKey));

    if (error) {
      console.error('Error fetching calendar from Supabase:', error);
      return c.json({ error: 'Failed to fetch calendar', details: error.message }, 500);
    }

    const dateReservations = reservations || [];

    // Fetch payment_status from linked packages (source of truth)
    const packageIds = [...new Set(dateReservations.map((r: any) => r.package_id).filter(Boolean))];
    let packagePaymentMap: Record<string, string> = {};
    if (packageIds.length > 0) {
      const { data: packages } = await supabase
        .from('user_packages')
        .select('id, payment_status')
        .in('id', packageIds);
      for (const pkg of (packages || [])) {
        packagePaymentMap[pkg.id] = pkg.payment_status;
      }
    }

    const calendarData = getDefaultSlotsForDate(dateKey).map((timeSlot) => {
      // Filter pending/confirmed/attended reservations for this slot (all active bookings)
      const slotReservations = dateReservations.filter((r: any) =>
        r.time_slot === timeSlot &&
        (r.reservation_status === 'pending' || r.reservation_status === 'confirmed' || r.reservation_status === 'attended')
      );

      // Calculate capacity inline
      const hasPrivateSession = slotReservations.some((r: any) => r.service_type === 'individual' || r.service_type === 'duo');
      const seatsOccupied = slotReservations.reduce((total: number, r: any) => {
        return total + (r.service_type === 'individual' ? 4 : r.service_type === 'duo' ? 2 : 1);
      }, 0);
      const available = hasPrivateSession ? 0 : Math.max(0, 4 - seatsOccupied);

      // Map to frontend format — use package payment_status as source of truth
      const mappedReservations = slotReservations.map((r: any) => ({
        id: r.id,
        userId: r.user_email,
        name: r.name,
        surname: r.surname,
        mobile: r.mobile,
        email: r.user_email,
        dateKey: r.date_key,
        timeSlot: r.time_slot,
        reservationStatus: r.reservation_status,
        paymentStatus: r.package_id ? (packagePaymentMap[r.package_id] || r.payment_status) : r.payment_status,
        createdAt: r.created_at,
      }));

      return {
        timeSlot,
        endTime: calculateEndTime(timeSlot),
        capacity: available,
        maxCapacity: 4,
        isBlocked: seatsOccupied >= 4 || hasPrivateSession,
        isPrivate: hasPrivateSession,
        reservations: mappedReservations,
        count: slotReservations.length
      };
    });

    console.log(`📆 Retrieved calendar for ${dateKey}: ${dateReservations.length} reservations from Supabase`);

    return c.json({ success: true, dateKey, slots: calendarData });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    return c.json({ error: 'Failed to fetch calendar', details: error.message }, 500);
  }
});

// ============ TIMESLOT MANAGEMENT ENDPOINTS ============

// GET /slots - Public endpoint for user booking flow (only live days)
app.get("/make-server-b87b0c07/slots", async (c) => {
  try {
    const date = c.req.query('date'); // YYYY-MM-DD
    if (!date) {
      return c.json({ error: 'Date required' }, 400);
    }

    const supabase = getSupabase();

    // Check if day is live
    const { data: daySchedule } = await supabase
      .from('day_schedules')
      .select('status')
      .eq('date', date)
      .maybeSingle();

    // If no row OR status !== 'live' → return 404
    if (!daySchedule || daySchedule.status !== 'live') {
      return c.json({ error: 'Day not available for booking' }, 404);
    }

    // Fetch slots for this date
    const { data: slots, error } = await supabase
      .from('time_slots')
      .select('id, date, start_time, max_capacity')
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching slots:', error);
      return c.json({ error: 'Failed to fetch slots' }, 500);
    }

    // If no custom slots, use defaults
    if (!slots || slots.length === 0) {
      const defaultSlots = getDefaultSlotsForDate(date).map(time => ({
        start_time: time,
        max_capacity: DEFAULT_MAX_CAPACITY
      }));
      return c.json({ success: true, slots: defaultSlots, isDefault: true });
    }

    // Normalize start_time to HH:MM (in case stored as HH:MM:SS)
    const normalizedSlots = slots.map(slot => ({
      ...slot,
      start_time: slot.start_time.substring(0, 5)
    }));

    return c.json({ success: true, slots: normalizedSlots, isDefault: false });
  } catch (error) {
    console.error('Error fetching public slots:', error);
    return c.json({ error: 'Failed to fetch slots', details: error.message }, 500);
  }
});

// GET /slots/live-days - Get all live days for date picker
app.get("/make-server-b87b0c07/slots/live-days", async (c) => {
  try {
    const supabase = getSupabase();

    const { data: liveDays, error } = await supabase
      .from('day_schedules')
      .select('date')
      .eq('status', 'live')
      .gte('date', getSkopjeTime().toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching live days:', error);
      return c.json({ error: 'Failed to fetch live days' }, 500);
    }

    return c.json({ success: true, dates: (liveDays || []).map(d => d.date) });
  } catch (error) {
    console.error('Error fetching live days:', error);
    return c.json({ error: 'Failed to fetch live days', details: error.message }, 500);
  }
});

// GET /slots/availability - Public endpoint for booking counts (no PII)
app.get("/make-server-b87b0c07/slots/availability", async (c) => {
  try {
    const supabase = getSupabase();

    // Get all live days
    const { data: liveDays, error: liveDaysError } = await supabase
      .from('day_schedules')
      .select('date')
      .eq('status', 'live')
      .gte('date', getSkopjeTime().toISOString().split('T')[0]);

    if (liveDaysError) {
      console.error('Error fetching live days:', liveDaysError);
      return c.json({ error: 'Failed to fetch availability' }, 500);
    }

    const liveDates = (liveDays || []).map(d => d.date);

    if (liveDates.length === 0) {
      return c.json({ success: true, bookings: [] });
    }

    // Build both ISO format (2026-02-05) and short format (2-5) date keys
    // to handle legacy reservations with short format
    const allDateKeys: string[] = [];
    liveDates.forEach(isoDate => {
      allDateKeys.push(isoDate); // ISO format: 2026-02-05
      const [, month, day] = isoDate.split('-');
      const shortKey = `${parseInt(month)}-${parseInt(day)}`; // Short format: 2-5
      allDateKeys.push(shortKey);
    });

    // Fetch all reservations for live days (only pending, confirmed, attended - not cancelled/no_show)
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('date_key, time_slot, reservation_status, service_type')
      .in('date_key', allDateKeys)
      .in('reservation_status', ['pending', 'confirmed', 'attended']);

    if (resError) {
      console.error('Error fetching reservations:', resError);
      return c.json({ error: 'Failed to fetch availability' }, 500);
    }

    // Map to simple booking counts (no PII)
    // Normalize date_key to short format for frontend compatibility
    const bookings = (reservations || []).map(r => {
      let dateKey = r.date_key;
      // Convert ISO format to short format if needed
      if (dateKey.includes('-') && dateKey.length === 10) {
        const [, month, day] = dateKey.split('-');
        dateKey = `${parseInt(month)}-${parseInt(day)}`;
      }
      return {
        dateKey,
        timeSlot: r.time_slot,
        status: r.reservation_status,
        serviceType: r.service_type
      };
    });

    // Fetch slot configs for live dates
    const { data: slotConfigData } = await supabase
      .from('time_slots')
      .select('date, start_time, class_type, max_capacity')
      .in('date', liveDates);

    const slotConfigs = (slotConfigData || []).reduce((acc: any, s: any) => {
      if (!acc[s.date]) acc[s.date] = {};
      acc[s.date][s.start_time] = { classType: s.class_type || 'group', maxCapacity: s.max_capacity };
      return acc;
    }, {});

    return c.json({ success: true, bookings, slotConfigs });
  } catch (error) {
    console.error('Error fetching slot availability:', error);
    return c.json({ error: 'Failed to fetch availability', details: (error as Error).message }, 500);
  }
});

// GET /slots/user-calendar - Combined endpoint: live dates + slot configs + bookings in one call
app.get("/make-server-b87b0c07/slots/user-calendar", async (c) => {
  try {
    const supabase = getSupabase();
    const todayStr = getSkopjeTime().toISOString().split('T')[0];

    // 1. Fetch live dates
    const { data: liveDays, error: liveDaysError } = await supabase
      .from('day_schedules')
      .select('date')
      .eq('status', 'live')
      .gte('date', todayStr)
      .order('date', { ascending: true });

    if (liveDaysError) {
      console.error('Error fetching live days:', liveDaysError);
      return c.json({ error: 'Failed to fetch calendar data' }, 500);
    }

    const liveDates = (liveDays || []).map(d => d.date);

    if (liveDates.length === 0) {
      return c.json({ success: true, dates: [], slotConfigs: {}, bookings: [] });
    }

    // 2. Fetch slot configs and reservations in parallel
    // Build date key variants for reservation query (ISO + short format)
    const allDateKeys: string[] = [];
    liveDates.forEach(isoDate => {
      allDateKeys.push(isoDate);
      const [, month, day] = isoDate.split('-');
      allDateKeys.push(`${parseInt(month)}-${parseInt(day)}`);
    });

    const [slotsResult, reservationsResult] = await Promise.all([
      supabase
        .from('time_slots')
        .select('date, start_time, max_capacity, class_type')
        .in('date', liveDates)
        .order('start_time', { ascending: true }),
      supabase
        .from('reservations')
        .select('date_key, time_slot, reservation_status, service_type, user_email')
        .in('date_key', allDateKeys)
        .in('reservation_status', ['pending', 'confirmed', 'attended']),
    ]);

    if (slotsResult.error) {
      console.error('Error fetching time slots:', slotsResult.error);
      return c.json({ error: 'Failed to fetch calendar data' }, 500);
    }
    if (reservationsResult.error) {
      console.error('Error fetching reservations:', reservationsResult.error);
      return c.json({ error: 'Failed to fetch calendar data' }, 500);
    }

    // 3. Build slotConfigs grouped by date
    const slotConfigs: Record<string, { start_time: string; max_capacity: number; class_type: string }[]> = {};
    for (const slot of slotsResult.data || []) {
      const st = slot.start_time.length > 5 ? slot.start_time.substring(0, 5) : slot.start_time;
      if (!slotConfigs[slot.date]) slotConfigs[slot.date] = [];
      slotConfigs[slot.date].push({ start_time: st, max_capacity: slot.max_capacity, class_type: slot.class_type || 'group' });
    }

    // 4. Normalize bookings — keep ISO dateKey, include lowercased email
    const bookings = (reservationsResult.data || []).map(r => {
      let dateKey = r.date_key;
      // Normalize short format to ISO for consistent frontend handling
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        const [m, d] = dateKey.split('-');
        const year = todayStr.substring(0, 4);
        dateKey = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      return {
        dateKey,
        timeSlot: r.time_slot,
        status: r.reservation_status,
        serviceType: r.service_type,
        email: (r.user_email || '').toLowerCase(),
      };
    });

    return c.json({ success: true, dates: liveDates, slotConfigs, bookings });
  } catch (error) {
    console.error('Error fetching user calendar:', error);
    return c.json({ error: 'Failed to fetch calendar data', details: (error as Error).message }, 500);
  }
});

// GET /admin/slots - Get time slots for a specific date (admin)
app.get("/make-server-b87b0c07/admin/slots", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const date = c.req.query('date'); // YYYY-MM-DD
    if (!date) {
      return c.json({ error: 'Date required' }, 400);
    }

    const supabase = getSupabase();

    // Get day status
    const { data: daySchedule } = await supabase
      .from('day_schedules')
      .select('status')
      .eq('date', date)
      .maybeSingle();

    const dayStatus = daySchedule?.status || 'draft';

    const { data: slots, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching slots:', error);
      return c.json({ error: 'Failed to fetch slots' }, 500);
    }

    // If no custom slots, return default slots
    if (!slots || slots.length === 0) {
      const dateSlotsArr = getDefaultSlotsForDate(date);
      const defaultSlots = dateSlotsArr.map((time, index) => ({
        id: `default-${index + 1}`,
        date,
        start_time: time,
        max_capacity: DEFAULT_MAX_CAPACITY,
        class_type: 'group',
        isDefault: true,
      }));
      return c.json({ success: true, slots: defaultSlots, isDefault: true, dayStatus });
    }

    return c.json({ success: true, slots, isDefault: false, dayStatus });
  } catch (error) {
    console.error('Error fetching slots:', error);
    return c.json({ error: 'Failed to fetch slots', details: error.message }, 500);
  }
});

// PATCH /admin/days/:date/status - Toggle day live/draft status
app.patch("/make-server-b87b0c07/admin/days/:date/status", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const date = c.req.param('date');
    const { status } = await c.req.json();

    if (!status || !['live', 'draft'].includes(status)) {
      return c.json({ error: 'Status must be "live" or "draft"' }, 400);
    }

    const supabase = getSupabase();

    // Upsert day schedule
    const { data, error } = await supabase
      .from('day_schedules')
      .upsert({
        date,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'date' })
      .select()
      .single();

    if (error) {
      console.error('Error updating day status:', error);
      return c.json({ error: 'Failed to update day status' }, 500);
    }

    // When setting to "live", auto-create default time slots if none exist
    if (status === 'live') {
      // Check if slots already exist for this date
      const { data: existingSlots } = await supabase
        .from('time_slots')
        .select('id')
        .eq('date', date)
        .limit(1);

      // Only create default slots if none exist
      if (!existingSlots || existingSlots.length === 0) {
        const dateSlotsArr = getDefaultSlotsForDate(date);
        const defaultSlotsToInsert = dateSlotsArr.map(time => ({
          date,
          start_time: time, // HH:MM format
          max_capacity: DEFAULT_MAX_CAPACITY,
        }));

        const { error: slotsError } = await supabase
          .from('time_slots')
          .upsert(defaultSlotsToInsert, {
            onConflict: 'date,start_time',
            ignoreDuplicates: true
          });

        if (slotsError) {
          console.error('Error creating default slots:', slotsError);
          // Don't fail the request, slots can be added manually
        } else {
          console.log(`📅 Created ${dateSlotsArr.length} default slots for ${date}`);
        }
      }
    }

    console.log(`📅 Day ${date} set to ${status}`);
    return c.json({ success: true, daySchedule: data });
  } catch (error) {
    console.error('Error updating day status:', error);
    return c.json({ error: 'Failed to update day status', details: error.message }, 500);
  }
});

// POST /admin/slots - Create a new time slot
app.post("/make-server-b87b0c07/admin/slots", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const { date, startTime, maxCapacity, classType } = await c.req.json();
    if (!date || !startTime) {
      return c.json({ error: 'Date and startTime required' }, 400);
    }

    const effectiveClassType = classType || 'group';
    const effectiveMaxCapacity = maxCapacity || (effectiveClassType === 'group' ? 4 : 1);

    const supabase = getSupabase();

    // Just add the requested slot — no longer auto-initializing defaults
    const { data, error } = await supabase
      .from('time_slots')
      .insert({
        date,
        start_time: startTime,
        max_capacity: effectiveMaxCapacity,
        class_type: effectiveClassType,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return c.json({ error: 'Slot already exists for this time' }, 409);
      }
      console.error('Error creating slot:', error);
      return c.json({ error: 'Failed to create slot' }, 500);
    }

    console.log(`📅 Created time slot for ${date} at ${startTime}`);
    return c.json({ success: true, slot: data });
  } catch (error) {
    console.error('Error creating slot:', error);
    return c.json({ error: 'Failed to create slot', details: error.message }, 500);
  }
});

// PATCH /admin/slots/:id - Update a time slot
app.patch("/make-server-b87b0c07/admin/slots/:id", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const id = c.req.param('id');
    const { startTime, maxCapacity, date, classType } = await c.req.json();

    const supabase = getSupabase();

    // Handle default slots (id starts with "default-")
    if (id.startsWith('default-')) {
      if (!date) {
        return c.json({ error: 'Date required for editing default slot' }, 400);
      }

      // Get the original default slot time from the index
      const dateSlotsArr = getDefaultSlotsForDate(date);
      const defaultIndex = parseInt(id.replace('default-', '')) - 1;
      const originalTime = dateSlotsArr[defaultIndex];

      if (!originalTime) {
        return c.json({ error: 'Invalid default slot ID' }, 400);
      }

      // Materialize all default slots for this date, with the edited one modified
      const slotsToInsert = dateSlotsArr.map((time, idx) => ({
        date,
        start_time: idx === defaultIndex ? (startTime || time) : time,
        max_capacity: idx === defaultIndex ? (maxCapacity ?? DEFAULT_MAX_CAPACITY) : DEFAULT_MAX_CAPACITY,
        class_type: idx === defaultIndex ? (classType || 'group') : 'group',
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('time_slots')
        .insert(slotsToInsert)
        .select();

      if (insertError) {
        console.error('Error creating slots from default:', insertError);
        return c.json({ error: 'Failed to update slot', details: insertError.message }, 500);
      }

      const updatedSlot = inserted?.find((s: any) =>
        s.start_time === (startTime || originalTime)
      );

      console.log(`📅 Created custom slots for ${date}, updated slot at ${startTime || originalTime}`);
      return c.json({ success: true, slot: updatedSlot });
    }

    // Regular slot update
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (startTime) updates.start_time = startTime;
    if (maxCapacity !== undefined) updates.max_capacity = maxCapacity;
    if (classType) updates.class_type = classType;

    const { data, error } = await supabase
      .from('time_slots')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating slot:', error);
      return c.json({ error: 'Failed to update slot', details: error.message }, 500);
    }

    console.log(`📅 Updated time slot ${id}`);
    return c.json({ success: true, slot: data });
  } catch (error) {
    console.error('Error updating slot:', error);
    return c.json({ error: 'Failed to update slot', details: (error as Error).message }, 500);
  }
});

// DELETE /admin/slots/:id - Delete a time slot (only if no bookings)
app.delete("/make-server-b87b0c07/admin/slots/:id", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const id = c.req.param('id');
    const supabase = getSupabase();

    // Handle default slots (ID format: "default-X")
    if (id.startsWith('default-')) {
      const date = c.req.query('date');
      const startTime = c.req.query('startTime');

      if (!date || !startTime) {
        return c.json({ error: 'Date and startTime required for default slot deletion' }, 400);
      }

      // Check if slot has bookings
      const { data: bookings } = await supabase
        .from('reservations')
        .select('id')
        .in('date_key', getDateKeyVariants(date))
        .eq('time_slot', startTime)
        .in('reservation_status', ['confirmed', 'attended', 'pending'])
        .limit(1);

      if (bookings && bookings.length > 0) {
        return c.json({ error: 'Cannot delete slot with existing bookings' }, 400);
      }

      // Initialize custom slots for this date, excluding the one being deleted
      const slotsToInsert = getDefaultSlotsForDate(date)
        .filter(time => time !== startTime)
        .map(time => ({
          date,
          start_time: time,
          max_capacity: DEFAULT_MAX_CAPACITY,
        }));

      const { error: insertError } = await supabase
        .from('time_slots')
        .insert(slotsToInsert);

      if (insertError) {
        console.error('Error initializing slots:', insertError);
        return c.json({ error: 'Failed to delete slot' }, 500);
      }

      console.log(`🗑️ Deleted default time slot ${startTime} for ${date}`);
      return c.json({ success: true, message: 'Slot deleted' });
    }

    // Handle custom slots (real UUID)
    const { data: slot, error: fetchError } = await supabase
      .from('time_slots')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !slot) {
      return c.json({ error: 'Slot not found' }, 404);
    }

    // Check if slot has bookings
    const { data: bookings } = await supabase
      .from('reservations')
      .select('id')
      .in('date_key', getDateKeyVariants(slot.date))
      .eq('time_slot', slot.start_time.substring(0, 5))
      .in('reservation_status', ['confirmed', 'attended', 'pending'])
      .limit(1);

    if (bookings && bookings.length > 0) {
      return c.json({ error: 'Cannot delete slot with existing bookings' }, 400);
    }

    // Delete the slot
    const { error } = await supabase
      .from('time_slots')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting slot:', error);
      return c.json({ error: 'Failed to delete slot' }, 500);
    }

    console.log(`🗑️ Deleted time slot ${id}`);
    return c.json({ success: true, message: 'Slot deleted' });
  } catch (error) {
    console.error('Error deleting slot:', error);
    return c.json({ error: 'Failed to delete slot', details: error.message }, 500);
  }
});

// POST /admin/cancel-class - Cancel an entire class (all bookings for a date+time slot)
app.post("/make-server-b87b0c07/admin/cancel-class", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const { date, timeSlot } = await c.req.json();
    if (!date || !timeSlot) {
      return c.json({ error: 'date and timeSlot are required' }, 400);
    }

    const supabase = getSupabase();

    // Fetch all active reservations for this slot
    const { data: reservations, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .in('date_key', getDateKeyVariants(date))
      .eq('time_slot', timeSlot)
      .in('reservation_status', ['confirmed', 'attended', 'pending']);

    if (fetchError) {
      console.error('Error fetching reservations for cancel-class:', fetchError);
      return c.json({ error: 'Failed to fetch reservations' }, 500);
    }

    if (!reservations || reservations.length === 0) {
      return c.json({ error: 'No active bookings found for this class' }, 404);
    }

    console.log(`🚫 Cancelling entire class: ${date} ${timeSlot} — ${reservations.length} bookings`);

    let cancelledCount = 0;

    for (const reservation of reservations) {
      // Atomic cancel: sets reservation_status + updates package in one transaction
      const { data: cancelResult, error: cancelRpcError } = await supabase.rpc('cancel_reservation', {
        p_reservation_id: reservation.id,
        p_package_id: reservation.package_id || null
      });

      if (cancelRpcError) {
        console.error(`⚠️ Failed to cancel reservation ${reservation.id}:`, cancelRpcError);
      } else {
        cancelledCount++;
        if (cancelResult?.new_remaining != null) {
          console.log(`🔄 Session restored for ${reservation.user_email}. Remaining: ${cancelResult.new_remaining}`);
        }
      }

      // Sync users table for backwards compat
      if (reservation.package_id && cancelResult?.new_remaining != null) {
        const { data: updatedPkg } = await supabase
          .from('user_packages')
          .select('total_sessions, remaining_sessions')
          .eq('id', reservation.package_id)
          .single();
        if (updatedPkg) {
          const usedSessions = (updatedPkg.total_sessions || 0) - (updatedPkg.remaining_sessions || 0);
          await supabase
            .from('users')
            .update({ remaining_sessions: updatedPkg.remaining_sessions, used_sessions: usedSessions, updated_at: new Date().toISOString() })
            .eq('email', reservation.user_email);
        }
      }

      // Defensive: verify sessions_booked was actually cleaned by RPC
      if (reservation.package_id) {
        await verifySessionsBookedCleanup(supabase, reservation.package_id, reservation.id, reservation.user_email);
      }

      // Audit trail
      try {
        await supabase.from('booking_changes').insert({
          reservation_id: reservation.id,
          user_email: reservation.user_email,
          change_type: 'class_cancelled',
          old_date_key: reservation.date_key,
          old_time_slot: reservation.time_slot,
          user_name: reservation.name,
          user_surname: reservation.surname,
          package_type: reservation.package_type,
        });
      } catch (auditErr) {
        console.error('Audit log error (cancel-class):', auditErr);
      }
    }

    // Send cancellation emails to all affected users
    const uniqueEmails = [...new Set(reservations.map(r => r.user_email))];
    for (const email of uniqueEmails) {
      try {
        // Look up user language
        const { data: user } = await supabase
          .from('users')
          .select('name, language')
          .eq('email', email)
          .single();

        const lang = user?.language || 'en';
        const name = user?.name || reservations.find(r => r.user_email === email)?.name || '';
        const dateStr = formatDateString(date, lang);

        await sendClassCancelledEmail(email, name, dateStr, timeSlot, lang);
        console.log(`📧 Cancellation email sent to ${email}`);
      } catch (emailErr) {
        console.error(`Failed to send cancellation email to ${email}:`, emailErr);
      }
    }

    console.log(`✅ Class cancelled: ${date} ${timeSlot} — ${cancelledCount} bookings cancelled, ${uniqueEmails.length} emails sent`);

    return c.json({
      success: true,
      cancelledCount,
      emailsSent: uniqueEmails.length,
      message: `Class cancelled. ${cancelledCount} booking(s) cancelled and ${uniqueEmails.length} notification(s) sent.`
    });
  } catch (error) {
    console.error('Error cancelling class:', error);
    return c.json({ error: 'Failed to cancel class', details: error.message }, 500);
  }
});

// ============ DEV ENDPOINTS ============

app.post("/make-server-b87b0c07/dev/clear-all-data", async (c) => {
  if (!isDevEndpointsEnabled()) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const prefixes = ['user:', 'package:', 'reservation:', 'activation_code:', 'verification_token:', 'session:', 'orphaned_package:', 'booking:', 'payment:'];
    
    let totalDeleted = 0;
    for (const prefix of prefixes) {
      const items = await kv.getByPrefix(prefix);
      for (const item of items) {
        await kv.del(item.id);
        totalDeleted++;
      }
    }
    
    console.log(`Cleared ${totalDeleted} items from database`);
    
    return c.json({ 
      success: true, 
      message: `Successfully cleared ${totalDeleted} items from all tables`,
      itemsDeleted: totalDeleted
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    return c.json({ error: 'Failed to clear data', details: error.message }, 500);
  }
});

app.post("/make-server-b87b0c07/dev/generate-mock-data", async (c) => {
  if (!isDevEndpointsEnabled()) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const mockPassword = await hashPassword('password123');
    const testUsers = [
      { email: 'test1@example.com', name: 'John', surname: 'Doe', mobile: '+38970123456' },
      { email: 'test2@example.com', name: 'Jane', surname: 'Smith', mobile: '+38970234567' },
    ];

    for (const userData of testUsers) {
      const normalizedEmail = normalizeEmail(userData.email);
      const userKey = `user:${normalizedEmail}`;
      
      const user = {
        id: userKey,
        email: normalizedEmail,
        name: userData.name,
        surname: userData.surname,
        mobile: userData.mobile,
        passwordHash: mockPassword,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        blocked: false,
        verified: true
      };
      
      await kv.set(userKey, user);
    }
    
    console.log('Mock data generated');
    
    return c.json({
      success: true,
      message: 'Mock data generated successfully',
      users: testUsers.map(u => ({ email: u.email, password: 'password123' }))
    });
  } catch (error) {
    console.error('Error generating mock data:', error);
    return c.json({ error: 'Failed to generate mock data', details: error.message }, 500);
  }
});

// ============ AUTH ENDPOINTS ============

// POST /auth/setup-password - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/auth/setup-password", async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = body;

    if (!token || !password) {
      return c.json({ error: "Token and password are required" }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    // Token stays in KV (acceptable for temporary tokens)
    const tokenKey = `verification_token:${token}`;
    const tokenData = await kv.get(tokenKey);

    if (!tokenData) {
      return c.json({ error: "Invalid or expired registration link" }, 400);
    }

    if (tokenData.used) {
      return c.json({ error: "This registration link has already been used. Please log in instead." }, 400);
    }

    if (new Date(tokenData.expiresAt) < new Date()) {
      return c.json({ error: "This registration link has expired. Please contact support." }, 400);
    }

    const normalizedEmail = normalizeEmail(tokenData.email);
    const supabase = getSupabase();

    // Read user from Supabase (not KV)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: "User not found" }, 404);
    }

    const isResetToken = tokenData.type === 'reset';
    if (user.password_hash && !isResetToken) {
      return c.json({ error: "Password already set. Please log in instead." }, 400);
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    // Update password_hash in Supabase (not KV)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: now
      })
      .eq('email', normalizedEmail);

    if (updateError) {
      console.error('Error updating password in Supabase:', updateError);
      return c.json({ error: 'Failed to set password', details: updateError.message }, 500);
    }

    // Mark token as used (stays in KV)
    tokenData.used = true;
    tokenData.usedAt = now;
    await kv.set(tokenKey, tokenData);

    // Session stays in KV (acceptable for ephemeral session data)
    const sessionToken = generateSecureToken('session');
    const sessionKey = `session:${sessionToken}`;
    const sessionData = {
      id: sessionKey,
      token: sessionToken,
      email: normalizedEmail,
      createdAt: now,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    await kv.set(sessionKey, sessionData);

    console.log(`Password set for user (Supabase): ${normalizedEmail}`);

    // Auto-deduct any missed sessions (past confirmed reservations never attended)
    const { deducted } = await autoDeductMissedSessions(normalizedEmail);
    if (deducted > 0) {
      console.log(`📋 Auto-deducted ${deducted} missed session(s) for ${normalizedEmail} on password setup`);
    }

    return c.json({
      success: true,
      message: "Registration complete! You can now log in.",
      session: sessionToken,
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname,
        language: user.language || 'sq',
        profileImageUrl: user.profile_image_url || null
      }
    });

  } catch (error) {
    console.error('Error setting up password:', error);
    return c.json({ error: 'Failed to set up password', details: (error as Error).message }, 500);
  }
});

// POST /auth/register - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/auth/register", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, surname, mobile, language } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      return c.json({ error: emailCheck.reason === 'typo' ? `Invalid email domain. Did you mean ${emailCheck.suggestion}?` : 'Invalid email address', suggestion: emailCheck.suggestion }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // Check if user exists in Supabase
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email, password_hash, name, surname, mobile')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking user:', checkError);
      return c.json({ error: 'Registration failed', details: checkError.message }, 500);
    }

    if (existingUser?.password_hash) {
      return c.json({
        error: 'An account with this email already exists. Please use the login form instead.',
        errorType: 'USER_EXISTS'
      }, 400);
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    if (existingUser) {
      // User exists but no password - update with password
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          name: name || existingUser.name,
          surname: surname || existingUser.surname,
          mobile: mobile || existingUser.mobile,
          verified: true,
          updated_at: now
        })
        .eq('email', normalizedEmail);

      if (updateError) {
        console.error('Error updating user:', updateError);
        return c.json({ error: 'Registration failed', details: updateError.message }, 500);
      }
      console.log(`User password set: ${normalizedEmail}`);
    } else {
      // Create new user
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          name: name || '',
          surname: surname || '',
          mobile: mobile || '',
          language: language?.toLowerCase() || 'sq',
          password_hash: passwordHash,
          verified: true,
          blocked: false,
          activation_status: 'activated',
          payment_status: 'unpaid',
          created_at: now,
          updated_at: now
        });

      if (insertError) {
        console.error('Error creating user:', insertError);
        return c.json({ error: 'Registration failed', details: insertError.message }, 500);
      }
      console.log(`User account created: ${normalizedEmail}`);
    }

    return c.json({
      success: true,
      message: 'Registration successful! You can now login.',
      user: {
        email: normalizedEmail,
        name: name || '',
        surname: surname || ''
      }
    });

  } catch (error) {
    console.error('Error during registration:', error);
    return c.json({ error: 'Registration failed', details: (error as Error).message }, 500);
  }
});

// POST /auth/request-login - Public endpoint for users to request login credentials
// POST /auth/forgot-password - Send password reset email
app.post("/make-server-b87b0c07/auth/forgot-password", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // Look up user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, password_hash, blocked, language')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (userError || !user || user.blocked || !user.password_hash) {
      console.log(`Password reset requested for unknown/ineligible email: ${normalizedEmail}`);
      return c.json({ success: true, message: 'If an account exists, a reset link will be sent.' });
    }

    // Generate reset token and store in KV
    const resetToken = generateSecureToken('reset');
    const tokenKey = `verification_token:${resetToken}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await kv.set(tokenKey, {
      email: normalizedEmail,
      expiresAt,
      used: false,
      type: 'reset'
    });

    // Send reset email
    const lang = user.language || 'en';
    const t = getEmailTranslations(lang);
    const appUrl = 'https://app.wellnestpilates.com';
    const resetUrl = `${appUrl}/setup-password?token=${resetToken}`;
    const capitalizedName = capitalizeName(user.name);

    const content: EmailContent = {
      greeting: `${t.greeting}, ${capitalizedName}`,
      message: t.resetPasswordMessage,
      button: {
        text: t.resetPasswordButton,
        url: resetUrl,
        hideUrl: true
      },
      instructions: {
        title: '',
        steps: [
          t.resetLinkExpires,
          t.resetIgnore
        ]
      }
    };

    const html = generateEmailTemplate(content, (lang?.toLowerCase() || 'en') as 'sq' | 'mk' | 'en');
    await sendEmail(normalizedEmail, t.resetPasswordSubject, html);

    console.log(`🔑 Password reset email sent to: ${normalizedEmail}`);
    return c.json({ success: true, message: 'If an account exists, a reset link will be sent.' });

  } catch (error) {
    console.error('Error in forgot-password:', error);
    return c.json({ error: 'Request failed', details: (error as Error).message }, 500);
  }
});

app.post("/make-server-b87b0c07/auth/request-login", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, surname')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userError || !user) {
      return c.json({ error: 'No account found with this email.' }, 404);
    }

    // Check if there's already a pending request for this email
    const { data: existingRequest } = await supabase
      .from('login_requests')
      .select('id, created_at')
      .eq('user_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      return c.json({
        success: true,
        message: 'A login request has already been submitted. The admin will send your credentials shortly.'
      });
    }

    // Create login request
    const { error: insertError } = await supabase
      .from('login_requests')
      .insert({
        user_email: normalizedEmail,
        status: 'pending',
        created_at: now,
        updated_at: now
      });

    if (insertError) {
      console.error('Error creating login request:', insertError);
      return c.json({ error: 'Failed to submit request' }, 500);
    }

    console.log(`📩 Login request created for: ${normalizedEmail}`);
    return c.json({
      success: true,
      message: 'Your request has been sent to the admin. You will receive a login email shortly.'
    });

  } catch (error) {
    console.error('Error in request-login:', error);
    return c.json({ error: 'Request failed', details: (error as Error).message }, 500);
  }
});

// POST /auth/login - MIGRATED TO SUPABASE (sessions stay in KV)
app.post("/make-server-b87b0c07/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // Fetch user from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    if (user.blocked) {
      return c.json({ error: "This account has been blocked. Please contact support." }, 403);
    }

    if (!user.password_hash) {
      return c.json({ error: "Please complete your registration first. Check your email for the registration link." }, 401);
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Session stays in KV (ephemeral data)
    const sessionToken = generateSecureToken('session');
    const sessionKey = `session:${sessionToken}`;
    const sessionData = {
      id: sessionKey,
      token: sessionToken,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    await kv.set(sessionKey, sessionData);

    console.log(`User logged in: ${normalizedEmail}`);

    // Auto-deduct any missed sessions (past confirmed reservations never attended)
    const { deducted } = await autoDeductMissedSessions(normalizedEmail);
    if (deducted > 0) {
      console.log(`📋 Auto-deducted ${deducted} missed session(s) for ${normalizedEmail} on login`);
    }

    return c.json({
      success: true,
      message: "Login successful",
      session: sessionToken,
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile,
        language: user.language || 'sq',
        profileImageUrl: user.profile_image_url || null
      }
    });

  } catch (error) {
    console.error('Error logging in:', error);
    return c.json({ error: 'Login failed', details: (error as Error).message }, 500);
  }
});

app.get("/make-server-b87b0c07/auth/verify", async (c) => {
  try {
    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }
    const session = sessionAuth.session;

    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, surname, mobile, blocked, profile_image_url')
      .eq('email', session.email)
      .maybeSingle();

    if (userError || !user || user.blocked) {
      return c.json({ error: "User not found or blocked" }, 401);
    }

    return c.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile,
        profileImageUrl: user.profile_image_url || null
      }
    });

  } catch (error) {
    console.error('Error verifying session:', error);
    return c.json({ error: 'Session verification failed', details: error.message }, 500);
  }
});

app.post("/make-server-b87b0c07/auth/logout", async (c) => {
  try {
    const sessionToken = c.req.header('X-Session-Token');

    if (sessionToken) {
      const sessionKey = `session:${sessionToken}`;
      await kv.del(sessionKey);
      console.log(`User logged out`);
    }

    return c.json({ success: true, message: "Logged out successfully" });

  } catch (error) {
    console.error('Error logging out:', error);
    return c.json({ error: 'Logout failed', details: (error as Error).message }, 500);
  }
});

// ============ ADMIN AUTH ============

// Admin login - creates session with isAdmin: true
app.post("/make-server-b87b0c07/auth/admin/login", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: "Username and password are required" }, 400);
    }

    // Verify admin credentials
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return c.json({ error: "Invalid admin credentials" }, 401);
    }

    // Create admin session in KV
    const sessionToken = generateSecureToken('admin_session');
    const sessionKey = `session:${sessionToken}`;
    const now = new Date().toISOString();
    const sessionData = {
      id: sessionKey,
      token: sessionToken,
      email: 'admin@wellnestpilates.com',
      isAdmin: true,
      createdAt: now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };
    await kv.set(sessionKey, sessionData);

    console.log(`Admin logged in: ${username}`);

    return c.json({
      success: true,
      message: "Admin login successful",
      session: sessionToken,
      isAdmin: true
    });

  } catch (error) {
    console.error('Error admin login:', error);
    return c.json({ error: 'Admin login failed', details: (error as Error).message }, 500);
  }
});

// ============ USER ENDPOINTS ============

// PATCH /user/language - Update user's language preference
app.patch("/make-server-b87b0c07/user/language", async (c) => {
  try {
    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }
    const session = sessionAuth.session;

    const body = await c.req.json();
    const { language } = body;

    if (!language || !['sq', 'mk', 'en'].includes(language.toLowerCase())) {
      return c.json({ error: "Invalid language. Must be 'sq', 'mk', or 'en'" }, 400);
    }

    const normalizedEmail = normalizeEmail(session.email);
    const normalizedLanguage = language.toLowerCase();
    const supabase = getSupabase();

    const { error: updateError } = await supabase
      .from('users')
      .update({ language: normalizedLanguage, updated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);

    if (updateError) {
      console.error('Error updating user language:', updateError);
      return c.json({ error: 'Failed to update language' }, 500);
    }

    console.log(`Language updated for ${normalizedEmail}: ${normalizedLanguage}`);

    return c.json({ success: true, language: normalizedLanguage });

  } catch (error) {
    console.error('Error updating language:', error);
    return c.json({ error: 'Failed to update language', details: (error as Error).message }, 500);
  }
});

app.get("/make-server-b87b0c07/user/packages", async (c) => {
  try {
    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }
    const session = sessionAuth.session;

    const supabase = getSupabase();

    // Fetch packages from Supabase
    const { data: packages, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('user_email', session.email)
      .order('created_at', { ascending: false });

    if (pkgError) {
      console.error('Error fetching user packages from Supabase:', pkgError);
      return c.json({ error: 'Failed to fetch packages', details: pkgError.message }, 500);
    }

    // Auto-expire packages past their expiry_date
    const now = getSkopjeTime();
    const expiredPkgs = (packages || []).filter((pkg: any) =>
      pkg.package_status === 'active' && pkg.expiry_date && new Date(pkg.expiry_date) < now
    );
    if (expiredPkgs.length > 0) {
      for (const pkg of expiredPkgs) {
        const { error: expErr } = await supabase
          .from('user_packages')
          .update({ package_status: 'expired', remaining_sessions: 0, updated_at: new Date().toISOString() })
          .eq('id', pkg.id);
        if (!expErr) {
          pkg.package_status = 'expired';
          pkg.remaining_sessions = 0;
          console.log(`⏰ Auto-expired package ${pkg.id} for ${session.email} (expired ${pkg.expiry_date})`);
        }
      }
    }

    // Fetch reservations from Supabase
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_email', session.email)
      .order('created_at', { ascending: false });

    if (resError) {
      console.error('Error fetching user reservations from Supabase:', resError);
      return c.json({ error: 'Failed to fetch reservations', details: resError.message }, 500);
    }

    // Create a map of reservations by ID for quick lookup
    const reservationMap = new Map((reservations || []).map((r: any) => [r.id, r]));

    // Map packages to camelCase and populate firstSession + bookedSessions
    const mappedPackages = (packages || []).map((pkg: any) => {
      // Find the first session reservation
      const userLang = pkg.language || 'en';
      let firstSession = null;
      if (pkg.first_reservation_id) {
        const res = reservationMap.get(pkg.first_reservation_id);
        if (res) {
          const endTime = calculateEndTime(res.time_slot);
          firstSession = {
            id: res.id,
            date: formatDateString(res.date_key, userLang),
            dateKey: res.date_key,
            time: res.time_slot,
            endTime,
            instructor: res.instructor
          };
        }
      }

      // Build bookedSessions array from BOTH sessionsBooked AND sessionsAttended
      const sessionsBookedIds = pkg.sessions_booked || [];
      const sessionsAttendedIds = pkg.sessions_attended || [];

      // Attended sessions come first (slots 0, 1, 2, ...)
      const attendedSessions = sessionsAttendedIds.map((resId: string, index: number) => {
        const res = reservationMap.get(resId);
        if (res) {
          return {
            id: res.id,
            date: formatDateString(res.date_key, userLang),
            dateKey: res.date_key,
            time: res.time_slot,
            endTime: calculateEndTime(res.time_slot),
            slotIndex: res.slot_index ?? index,
            attended: true,
            createdAt: res.created_at
          };
        }
        return null;
      }).filter(Boolean);

      // Booked sessions come after attended (slots continue from attendedCount)
      const bookedSessionsFromBooked = sessionsBookedIds.map((resId: string, index: number) => {
        const res = reservationMap.get(resId);
        if (res && res.reservation_status !== 'cancelled' && res.reservation_status !== 'no_show') {
          return {
            id: res.id,
            date: formatDateString(res.date_key, userLang),
            dateKey: res.date_key,
            time: res.time_slot,
            endTime: calculateEndTime(res.time_slot),
            slotIndex: res.slot_index ?? (sessionsAttendedIds.length + index),
            attended: false,
            isFriendBooking: res.is_friend_booking || false,
            createdAt: res.created_at
          };
        }
        return null;
      }).filter(Boolean);

      const bookedSessions = [...attendedSessions, ...bookedSessionsFromBooked];

      return {
        id: pkg.id,
        userId: pkg.user_email,
        packageType: pkg.package_type,
        totalSessions: pkg.total_sessions,
        remainingSessions: pkg.remaining_sessions,
        baseSessions: pkg.base_sessions,
        bonusClasses: pkg.bonus_classes,
        redeemedCouponCode: pkg.redeemed_coupon_code,
        sessionsBooked: pkg.sessions_booked || [],
        sessionsAttended: pkg.sessions_attended || [],
        bookedSessions,
        purchaseDate: pkg.purchase_date,
        activationDate: pkg.activation_date,
        expiryDate: pkg.expiry_date,
        packageStatus: pkg.package_status,
        activationStatus: pkg.activation_status,
        paymentStatus: pkg.payment_status,
        firstReservationId: pkg.first_reservation_id,
        firstSession,
        paymentId: pkg.payment_id,
        name: pkg.name,
        surname: pkg.surname,
        mobile: pkg.mobile,
        email: pkg.email,
        language: pkg.language,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at
      };
    });

    // Map reservations to camelCase
    const mappedReservations = (reservations || []).map((res: any) => ({
      id: res.id,
      userId: res.user_email,
      packageId: res.package_id,
      dateKey: res.date_key,
      timeSlot: res.time_slot,
      instructor: res.instructor,
      reservationStatus: res.reservation_status,
      paymentStatus: res.payment_status,
      isFriendBooking: res.is_friend_booking || false,
      createdAt: res.created_at,
      updatedAt: res.updated_at
    }));

    console.log(`📦 User ${session.email}: ${mappedPackages.length} packages, ${mappedReservations.length} reservations`);
    return c.json({
      success: true,
      packages: mappedPackages,
      reservations: mappedReservations
    });

  } catch (error) {
    console.error('Error fetching user packages:', error);
    return c.json({ error: 'Failed to fetch packages', details: error.message }, 500);
  }
});

// POST /user/packages/:id/reschedule - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/user/packages/:id/reschedule", async (c) => {
  try {
    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }

    const packageId = c.req.param('id');
    const body = await c.req.json();
    const { dateKey, timeSlot, instructor } = body;

    if (!dateKey || !timeSlot) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const bookingDate = parseDateKey(dateKey);
    if (!bookingDate || !isValidBookingDate(bookingDate)) {
      return c.json({ error: "Invalid booking date - must be a future weekday" }, 400);
    }
    if (isTimeSlotPast(bookingDate, timeSlot)) {
      return c.json({ error: "This time slot has already passed" }, 400);
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Read package from Supabase
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    // Verify user owns this package
    if (pkg.user_email !== sessionAuth.session.email) {
      return c.json({ error: "Not authorized to reschedule this package" }, 403);
    }

    if (!pkg.first_reservation_id) {
      return c.json({ error: "No first session to reschedule" }, 400);
    }

    // Read reservation from Supabase
    const { data: firstReservation, error: resError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', pkg.first_reservation_id)
      .single();

    if (resError || !firstReservation) {
      return c.json({ error: "First session not found" }, 404);
    }

    // Check 24-hour rule using date_key and time_slot (handle both date formats)
    const dk = firstReservation.date_key;
    const isIsoFormat = dk.includes('-') && dk.length > 5;
    const [yrVal, moVal, dyVal] = isIsoFormat
      ? [parseInt(dk.split('-')[0]), parseInt(dk.split('-')[1]), parseInt(dk.split('-')[2])]
      : [getSkopjeTime().getFullYear(), ...dk.split('-').map(Number)];
    const [hours, minutes] = firstReservation.time_slot.split(':').map(Number);
    const sessionTime = new Date(yrVal, moVal - 1, dyVal, hours, minutes);
    const hoursUntilSession = (sessionTime.getTime() - getSkopjeTime().getTime()) / (1000 * 60 * 60);

    if (hoursUntilSession < 24) {
      return c.json({ error: "Cannot reschedule less than 24 hours before the session" }, 400);
    }

    const serviceType = extractServiceType(pkg.package_type);
    const capacity = await calculateSlotCapacity(dateKey, timeSlot);

    // Validate class type compatibility
    if (capacity.classType === 'group' && !['single', 'package'].includes(serviceType)) {
      return c.json({ error: "This slot is for group classes only" }, 400);
    }
    if (capacity.classType === 'individual' && serviceType !== 'individual') {
      return c.json({ error: "This slot is for Individual training only" }, 400);
    }
    if (capacity.classType === 'duo' && serviceType !== 'duo') {
      return c.json({ error: "This slot is for DUO training only" }, 400);
    }

    if (capacity.available < 1) {
      return c.json({ error: "Slot is full" }, 400);
    }

    const dateString = formatDateString(dateKey, pkg.language || 'en');
    const endTime = calculateEndTime(timeSlot);

    // Update reservation in Supabase
    const { data: updatedReservation, error: updateError } = await supabase
      .from('reservations')
      .update({
        date_key: dateKey,
        time_slot: timeSlot,
        instructor,
        updated_at: now
      })
      .eq('id', pkg.first_reservation_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating reservation:', updateError);
      return c.json({ error: 'Failed to reschedule session', details: updateError.message }, 500);
    }

    console.log(`Rescheduled first session for package ${packageId} (Supabase)`);

    // Audit trail: log the reschedule
    try {
      await supabase.from('booking_changes').insert({
        reservation_id: firstReservation.id,
        user_email: firstReservation.user_email,
        change_type: 'rescheduled',
        old_date_key: firstReservation.date_key,
        old_time_slot: firstReservation.time_slot,
        new_date_key: updatedReservation.date_key,
        new_time_slot: updatedReservation.time_slot,
        user_name: firstReservation.name,
        user_surname: firstReservation.surname,
        package_type: pkg.package_type,
      });
    } catch (auditErr) {
      console.error('Audit log error (reschedule):', auditErr);
    }

    // Build response in camelCase for frontend
    const reservation = {
      id: updatedReservation.id,
      userId: updatedReservation.user_email,
      packageId: updatedReservation.package_id,
      dateKey: updatedReservation.date_key,
      date: dateString,
      timeSlot: updatedReservation.time_slot,
      endTime,
      instructor: updatedReservation.instructor,
      reservationStatus: updatedReservation.reservation_status,
      updatedAt: updatedReservation.updated_at
    };

    return c.json({
      success: true,
      message: "Session rescheduled successfully",
      reservation
    });

  } catch (error) {
    console.error('Error rescheduling session:', error);
    return c.json({ error: 'Failed to reschedule session', details: error.message }, 500);
  }
});

// POST /user/packages/purchase - Buy a new package from the dashboard (authenticated)
app.post("/make-server-b87b0c07/user/packages/purchase", async (c) => {
  try {
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }

    const body = await c.req.json();
    const { packageType, couponCode } = body;

    const allowedTypes = ['package8', 'package10', 'package12', 'individual1', 'individual8', 'individual12', 'duo1', 'duo8', 'duo12'];
    if (!packageType || !allowedTypes.includes(packageType)) {
      return c.json({ error: 'Invalid package type' }, 400);
    }

    const normalizedEmail = sessionAuth.session.email;
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('name, surname, mobile, email, language')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check eligibility: only blocked by active packages of the SAME service type
    const requestedServiceType = extractServiceType(packageType as PackageType);
    const { data: activePackages } = await supabase
      .from('user_packages')
      .select('id, package_type, remaining_sessions, package_status')
      .eq('user_email', normalizedEmail)
      .in('package_status', ['active'])
      .gt('remaining_sessions', 1);

    // Only block if there's an active package of the same service type with >1 remaining
    const blockingPackages = (activePackages || []).filter(
      (p: any) => extractServiceType(p.package_type) === requestedServiceType
    );
    if (blockingPackages.length > 0) {
      return c.json({
        error: 'You can only purchase a new package when your current package has 1 or fewer sessions remaining.',
        errorType: 'PACKAGE_NOT_ELIGIBLE'
      }, 400);
    }

    // Prevent duplicate pending packages of the same type
    // Single-session packages (individual1, duo1) are exempt — users can buy as many as they want
    const isSingleSession = packageType === 'individual1' || packageType === 'duo1';
    if (!isSingleSession) {
      const { data: existingPkg } = await supabase
        .from('user_packages')
        .select('id')
        .eq('user_email', normalizedEmail)
        .eq('package_type', packageType)
        .eq('package_status', 'pending')
        .maybeSingle();

      if (existingPkg) {
        return c.json({
          success: true,
          package: { id: existingPkg.id },
          packageId: existingPkg.id,
          requiresFirstSessionBooking: true,
          bonusClasses: 0,
          redeemedCoupon: null,
          message: 'Package already exists. Please select date and time for your first session.'
        });
      }
    }

    let totalSessions = extractSessionCount(packageType);
    let bonusClasses = 0;
    let redeemedCouponCode = null;

    // Handle coupon redemption
    if (couponCode) {
      const normalizedCoupon = couponCode.trim().toUpperCase();

      const { data: coupon, error: couponError } = await supabase
        .from('redemption_codes')
        .select('*')
        .eq('code', normalizedCoupon)
        .maybeSingle();

      if (coupon && !couponError) {
        const isUsed = coupon.used === true || coupon.status === 'used' || coupon.status === 'redeemed';
        const expiresAt = coupon.expires_at || coupon.expiresAt;
        const isExpired = expiresAt && new Date(expiresAt) < getSkopjeTime();
        const isActive = !coupon.status || coupon.status === 'active';

        if (!isUsed && !isExpired && isActive) {
          bonusClasses = 1;
          totalSessions += bonusClasses;
          redeemedCouponCode = normalizedCoupon;

          await supabase
            .from('redemption_codes')
            .update({ used: true, status: 'redeemed', used_at: now, used_by_email: normalizedEmail })
            .eq('id', coupon.id);

          console.log(`✅ Coupon ${normalizedCoupon} redeemed by ${normalizedEmail} (dashboard purchase)`);
        }
      }
    }

    // Insert package
    const { data: insertedPackage, error: packageError } = await supabase
      .from('user_packages')
      .insert({
        user_email: normalizedEmail,
        package_type: packageType,
        total_sessions: totalSessions,
        base_sessions: extractSessionCount(packageType),
        bonus_classes: bonusClasses,
        remaining_sessions: totalSessions,
        sessions_booked: [],
        sessions_attended: [],
        redeemed_coupon_code: redeemedCouponCode,
        package_status: 'pending',
        activation_status: 'pending',
        payment_status: 'unpaid',
        purchase_date: now,
        activation_date: null,
        expiry_date: null,
        first_reservation_id: null,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile,
        email: normalizedEmail,
        language: user.language || 'sq',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (packageError) {
      console.error('Error creating package (dashboard):', packageError);
      return c.json({ error: 'Failed to create package', details: packageError.message }, 500);
    }

    const packageId = insertedPackage.id;

    // Update redemption_codes with package_id if coupon was used
    if (redeemedCouponCode) {
      await supabase
        .from('redemption_codes')
        .update({ package_id: packageId })
        .eq('code', redeemedCouponCode);
    }

    console.log(`📦 Dashboard package purchase: ${normalizedEmail} bought ${packageType} (id: ${packageId})`);

    return c.json({
      success: true,
      packageId,
      requiresFirstSessionBooking: true,
      bonusClasses,
      redeemedCoupon: redeemedCouponCode
    });

  } catch (error) {
    console.error('Error in user package purchase:', error);
    return c.json({ error: 'Failed to purchase package', details: (error as Error).message }, 500);
  }
});

// POST /user/packages/:id/book-session - Book a session for a package (when no first session exists)
app.post("/make-server-b87b0c07/user/packages/:id/book-session", async (c) => {
  try {
    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }

    const packageId = c.req.param('id');
    const body = await c.req.json();
    const { dateKey, timeSlot, slotIndex } = body;

    if (!dateKey || !timeSlot) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const bookingDate = parseDateKey(dateKey);
    if (!bookingDate || !isValidBookingDate(bookingDate)) {
      return c.json({ error: "Invalid booking date - must be a future weekday" }, 400);
    }
    if (isTimeSlotPast(bookingDate, timeSlot)) {
      return c.json({ error: "This time slot has already passed" }, 400);
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Read package from Supabase
    const { data: pkg, error: pkgError } = await supabase
      .from('user_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    // Check package expiry — also persist the status change
    if (pkg.expiry_date && getSkopjeTime() > new Date(pkg.expiry_date)) {
      await supabase.from('user_packages')
        .update({ package_status: 'expired', remaining_sessions: 0, updated_at: now })
        .eq('id', pkg.id);
      return c.json({ error: "Package has expired" }, 400);
    }

    // Auto-expire any older packages past their expiry_date before checking the block rule
    // Only block within the same service type (group blocks group, individual blocks individual, etc.)
    const { data: olderActivePkgs } = await supabase
      .from('user_packages')
      .select('id, remaining_sessions, created_at, expiry_date, package_type')
      .eq('user_email', pkg.user_email)
      .eq('package_status', 'active')
      .gt('remaining_sessions', 0)
      .lt('created_at', pkg.created_at);

    const skopjeNow = getSkopjeTime();
    const stillBlocking = [];
    for (const older of (olderActivePkgs || [])) {
      if (older.expiry_date && new Date(older.expiry_date) < skopjeNow) {
        // Auto-expire stale package
        await supabase.from('user_packages')
          .update({ package_status: 'expired', remaining_sessions: 0, updated_at: now })
          .eq('id', older.id);
        console.log(`⏰ Auto-expired blocking package ${older.id} for ${pkg.user_email}`);
      } else if (extractServiceType(older.package_type) === serviceType) {
        // Only block if the older package is the same service type
        stillBlocking.push(older);
      }
    }

    if (stillBlocking.length > 0) {
      return c.json({ error: "Please use all sessions from your current package before booking from this one" }, 400);
    }

    // Unpaid packages: allow at most 1 upcoming active booking
    if (pkg.payment_status !== 'paid') {
      const todayKey = formatDateKey(getSkopjeToday());
      const { data: upcomingBookings } = await supabase
        .from('reservations')
        .select('id')
        .eq('package_id', packageId)
        .in('reservation_status', ['pending', 'confirmed'])
        .gte('date_key', todayKey);

      if (upcomingBookings && upcomingBookings.length >= 1) {
        return c.json({ error: "Please complete payment to book more sessions" }, 400);
      }
    }

    // Auto-correct package_status if package was activated but status drifted
    // (e.g., 'fully_used' after cancel restored sessions, or admin reset to 'pending')
    if (pkg.activation_status === 'activated' && pkg.package_status !== 'active' && pkg.remaining_sessions > 0) {
      console.log(`🔧 Auto-correcting package_status from '${pkg.package_status}' to 'active' for package ${packageId}`);
      await supabase
        .from('user_packages')
        .update({ package_status: 'active', updated_at: new Date().toISOString() })
        .eq('id', packageId);
    }

    const serviceType = extractServiceType(pkg.package_type);

    // Validate class type compatibility
    const { data: slotConfig } = await supabase
      .from('time_slots')
      .select('class_type')
      .eq('date', dateKey)
      .eq('start_time', timeSlot)
      .single();

    const slotClassType = slotConfig?.class_type || 'group';

    if (slotClassType === 'group' && !['single', 'package'].includes(serviceType)) {
      return c.json({ error: 'This slot is for group classes only' }, 400);
    }
    if (slotClassType === 'individual' && serviceType !== 'individual') {
      return c.json({ error: 'This slot is for Individual training only' }, 400);
    }
    if (slotClassType === 'duo' && serviceType !== 'duo') {
      return c.json({ error: 'This slot is for DUO training only' }, 400);
    }

    const dateString = formatDateString(dateKey, pkg.language || 'en');
    const endTime = calculateEndTime(timeSlot);

    // Atomic RPC: locks slot rows, checks capacity, validates package, creates reservation
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation', {
      p_user_email: pkg.user_email,
      p_package_id: packageId,
      p_service_type: serviceType,
      p_date_key: dateKey,
      p_time_slot: timeSlot,
      p_instructor: '',
      p_name: pkg.name,
      p_surname: pkg.surname,
      p_mobile: pkg.mobile,
      p_package_type: pkg.package_type,
      p_partner_name: null,
      p_partner_surname: null,
      p_is_first_session: false,
      p_slot_index: typeof slotIndex === 'number' ? slotIndex : null
    });

    if (rpcError) {
      console.error('RPC error booking session:', rpcError);
      return c.json({ error: 'Failed to book session', details: rpcError.message }, 500);
    }

    if (rpcResult?.error) {
      const errorMap: Record<string, string> = {
        'Slot blocked by private session': 'Slot not available for booking',
        'Insufficient capacity': 'Slot is full',
        'Package not found': 'Package not found',
        'No remaining sessions': 'No sessions remaining in this package',
        'Package not active': 'Package is not active'
      };
      const userError = errorMap[rpcResult.error] || rpcResult.error;
      return c.json({ error: userError }, 400);
    }

    const reservationId = rpcResult.reservation_id;
    const isFriendBooking = rpcResult.is_friend_booking || false;

    // sessions_booked is now updated atomically inside create_reservation RPC

    // Backfill first_reservation_id if somehow missing (edge case for old packages)
    if (!pkg.first_reservation_id) {
      await supabase
        .from('user_packages')
        .update({ first_reservation_id: reservationId, updated_at: now })
        .eq('id', packageId);
    }

    // Sync to users table for backwards compatibility with GET /admin/users
    const newRemainingForUser = pkg.remaining_sessions - 1;
    const usedSessions = (pkg.total_sessions || 0) - newRemainingForUser;
    await supabase
      .from('users')
      .update({
        remaining_sessions: newRemainingForUser,
        used_sessions: usedSessions,
        updated_at: now
      })
      .eq('email', pkg.user_email);

    console.log(`📅 Booked session for package ${packageId}: ${reservationId}`);

    // Build response in camelCase for frontend
    const reservation = {
      id: reservationId,
      userId: pkg.user_email,
      packageId,
      dateKey,
      date: dateString,
      timeSlot,
      endTime,
      reservationStatus: rpcResult.status,
      createdAt: now
    };

    return c.json({
      success: true,
      message: "Session booked successfully",
      reservation
    });

  } catch (error) {
    console.error('Error booking session:', error);
    return c.json({ error: 'Failed to book session', details: error.message }, 500);
  }
});

// DELETE /user/packages/:id/reservations/:reservationId - Cancel a booked session (24h+ before)
app.delete("/make-server-b87b0c07/user/packages/:id/reservations/:reservationId", async (c) => {
  try {
    const packageId = c.req.param('id');
    const reservationId = c.req.param('reservationId');

    // Verify session with sliding expiration
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }
    const session = sessionAuth.session;

    const supabase = getSupabase();
    const now = getSkopjeTime();
    const nowISO = new Date().toISOString();

    // Get the reservation
    const { data: reservation, error: resError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      return c.json({ error: "Reservation not found" }, 404);
    }

    // Verify user owns this reservation
    if (reservation.user_email !== session.email) {
      return c.json({ error: "Not authorized to cancel this reservation" }, 403);
    }

    // Check 24-hour rule (use Skopje timezone since sessions are in Skopje time)
    const [month, day] = reservation.date_key.includes('-') && reservation.date_key.length > 5
      ? [parseInt(reservation.date_key.split('-')[1]), parseInt(reservation.date_key.split('-')[2])]
      : reservation.date_key.split('-').map(Number);
    const year = reservation.date_key.length > 5
      ? parseInt(reservation.date_key.split('-')[0])
      : now.getFullYear();
    const [hours, minutes] = reservation.time_slot.split(':').map(Number);

    const sessionDateTime = new Date(year, month - 1, day, hours, minutes);
    const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Check cancellation rules:
    // 1. If 24+ hours before session → can always cancel
    // 2. If within 24 hours → can only cancel within 2 minutes of booking (grace period)
    if (hoursUntilSession < 24) {
      const createdAtUTC = new Date(reservation.created_at);
      const createdAt = new Date(createdAtUTC.toLocaleString('en-US', { timeZone: 'Europe/Skopje' }));
      const minutesSinceBooking = (now.getTime() - createdAt.getTime()) / (1000 * 60);
      const gracePeriodMinutes = 2;

      if (minutesSinceBooking > gracePeriodMinutes) {
        const secondsRemaining = Math.max(0, (gracePeriodMinutes * 60) - (now.getTime() - createdAt.getTime()) / 1000);
        return c.json({
          error: "Cannot cancel - grace period expired",
          hoursUntilSession: Math.round(hoursUntilSession * 10) / 10,
          gracePeriodExpired: true,
          minutesSinceBooking: Math.round(minutesSinceBooking * 10) / 10
        }, 400);
      }
      // Within grace period - allow cancellation
      console.log(`🕐 Grace period cancel: ${minutesSinceBooking.toFixed(1)} min since booking`);
    }

    // Atomic cancel: sets reservation_status + updates package in one transaction
    const { data: cancelResult, error: cancelRpcError } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: reservationId,
      p_package_id: packageId
    });

    if (cancelRpcError) {
      console.error('RPC error cancelling reservation:', cancelRpcError);
      return c.json({ error: 'Failed to cancel reservation', details: cancelRpcError.message }, 500);
    }

    if (cancelResult?.error) {
      return c.json({ error: cancelResult.error }, 400);
    }

    // Sync to users table for backwards compat
    if (cancelResult?.new_remaining != null) {
      const { data: updatedPkg } = await supabase
        .from('user_packages')
        .select('total_sessions, remaining_sessions')
        .eq('id', packageId)
        .single();
      if (updatedPkg) {
        const usedSessions = (updatedPkg.total_sessions || 0) - (updatedPkg.remaining_sessions || 0);
        await supabase
          .from('users')
          .update({ remaining_sessions: updatedPkg.remaining_sessions, used_sessions: usedSessions, updated_at: nowISO })
          .eq('email', session.email);
      }
    }

    // Defensive: verify sessions_booked was actually cleaned by RPC
    if (packageId) {
      await verifySessionsBookedCleanup(supabase, packageId, reservationId, session.email);
    }

    console.log(`🗑️ Cancelled reservation ${reservationId} for package ${packageId}`);

    // Audit trail: log the cancellation
    try {
      await supabase.from('booking_changes').insert({
        reservation_id: reservationId,
        user_email: reservation.user_email,
        change_type: 'cancelled',
        old_date_key: reservation.date_key,
        old_time_slot: reservation.time_slot,
        user_name: reservation.name,
        user_surname: reservation.surname,
        package_type: reservation.package_type,
      });
    } catch (auditErr) {
      console.error('Audit log error (cancel):', auditErr);
    }

    return c.json({
      success: true,
      message: "Session cancelled successfully",
      reservationId
    });

  } catch (error: any) {
    console.error('Error cancelling session:', error);
    return c.json({ error: 'Failed to cancel session', details: error.message }, 500);
  }
});

// ============ DEBUG ENDPOINT ============

app.get("/make-server-b87b0c07/debug/check-users", async (c) => {
  // Protected - only available when ENABLE_DEV_ENDPOINTS=true
  if (!isDevEndpointsEnabled()) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const allUsers = await kv.getByPrefix('user:');
    return c.json({
      success: true,
      userCount: allUsers.length,
      hasUsers: allUsers.length > 0,
      users: allUsers.map((u: any) => ({
        email: u.email,
        name: u.name,
        surname: u.surname,
        hasPassword: !!u.passwordHash,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    console.error('Error checking users:', error);
    return c.json({ error: 'Failed to check users', details: error.message }, 500);
  }
});

// POST /admin/sync-user-sessions - Sync all user_packages data to users table
app.post("/make-server-b87b0c07/admin/sync-user-sessions", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Get all user_packages
    const { data: packages, error: pkgError } = await supabase
      .from('user_packages')
      .select('*');

    if (pkgError) {
      return c.json({ error: 'Failed to fetch packages', details: pkgError.message }, 500);
    }

    let synced = 0;
    let errors = 0;

    // For each package, update the corresponding user
    for (const pkg of packages || []) {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          remaining_sessions: pkg.remaining_sessions,
          used_sessions: (pkg.total_sessions || 0) - (pkg.remaining_sessions || 0),
          total_sessions: pkg.total_sessions,
          updated_at: now
        })
        .eq('email', pkg.user_email);

      if (updateError) {
        console.error(`Failed to sync user ${pkg.user_email}:`, updateError);
        errors++;
      } else {
        synced++;
      }
    }

    console.log(`🔄 Synced ${synced} users, ${errors} errors`);

    return c.json({
      success: true,
      message: `Synced ${synced} users from user_packages to users table`,
      synced,
      errors
    });

  } catch (error: any) {
    console.error('Error syncing user sessions:', error);
    return c.json({ error: 'Failed to sync', details: error.message }, 500);
  }
});

// ============ BOOKING CHANGES ENDPOINTS ============

// GET /admin/booking-changes - Fetch recent booking changes (admin only)
app.get("/make-server-b87b0c07/admin/booking-changes", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const limitParam = parseInt(c.req.query('limit') || '50');
    const limit = Math.min(Math.max(limitParam, 1), 200);
    const since = c.req.query('since'); // optional ISO timestamp
    const archived = c.req.query('archived') === 'true';

    const supabase = getSupabase();
    let query = supabase
      .from('booking_changes')
      .select('*')
      .eq('is_archived', archived)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching booking changes:', error);
      return c.json({ error: 'Failed to fetch booking changes' }, 500);
    }

    return c.json({
      changes: (data || []).map((ch: any) => ({
        id: ch.id,
        reservationId: ch.reservation_id,
        userEmail: ch.user_email,
        changeType: ch.change_type,
        oldDateKey: ch.old_date_key,
        oldTimeSlot: ch.old_time_slot,
        newDateKey: ch.new_date_key,
        newTimeSlot: ch.new_time_slot,
        userName: ch.user_name,
        userSurname: ch.user_surname,
        packageType: ch.package_type,
        createdAt: ch.created_at,
      }))
    });
  } catch (error: any) {
    console.error('Error fetching booking changes:', error);
    return c.json({ error: 'Failed to fetch booking changes', details: error.message }, 500);
  }
});

// POST /admin/booking-changes/archive - Archive all unarchived booking changes (admin only)
app.post("/make-server-b87b0c07/admin/booking-changes/archive", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();
    // Optional: only archive changes created before a given ISO timestamp
    const body = await c.req.json().catch(() => ({}));
    const before = body?.before; // ISO timestamp, e.g. "2026-03-23T00:00:00"

    let query = supabase
      .from('booking_changes')
      .update({ is_archived: true })
      .eq('is_archived', false);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('Error archiving booking changes:', error);
      return c.json({ error: 'Failed to archive booking changes' }, 500);
    }

    return c.json({ success: true, archivedCount: data?.length || 0 });
  } catch (error: any) {
    console.error('Error archiving booking changes:', error);
    return c.json({ error: 'Failed to archive booking changes', details: error.message }, 500);
  }
});

// Send re-engagement email to archived users (admin action)
app.post("/make-server-b87b0c07/admin/archived-users/send-email", async (c) => {
  try {
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const { emails } = await c.req.json();

    if (!emails || (Array.isArray(emails) && emails.length === 0)) {
      return c.json({ error: 'No emails provided' }, 400);
    }

    const emailList = Array.isArray(emails) ? emails : [emails];
    const results: Array<{ email: string; success: boolean; error?: string }> = [];
    const supabase = getSupabase();

    for (const email of emailList) {
      const normalizedEmail = normalizeEmail(email);

      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('name, surname, language')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (fetchError || !user) {
        results.push({ email: normalizedEmail, success: false, error: 'User not found' });
        continue;
      }

      const language = user.language || 'sq';

      try {
        const emailResult = await sendReengagementEmail(
          normalizedEmail,
          user.name || '',
          language
        );

        if (emailResult.success) {
          results.push({ email: normalizedEmail, success: true });
          console.log(`✅ Sent re-engagement email to ${normalizedEmail}`);
        } else {
          results.push({ email: normalizedEmail, success: false, error: emailResult.error });
        }
      } catch (emailError: any) {
        results.push({ email: normalizedEmail, success: false, error: emailError.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return c.json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      }
    });
  } catch (error: any) {
    console.error('Error sending re-engagement emails:', error);
    return c.json({ error: 'Failed to send emails', details: error.message }, 500);
  }
});

// ============ USER AVATAR UPLOAD ============
app.post('/make-server-b87b0c07/user/upload-avatar', async (c) => {
  try {
    const sessionAuth = await verifyUserSession(c);
    if (!sessionAuth.valid) {
      return c.json({ error: sessionAuth.error }, 401);
    }
    const session = sessionAuth.session;
    const userEmail = session.email;

    const formData = await c.req.formData();
    const file = formData.get('avatar');

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No avatar file provided' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, 400);
    }

    // Validate file size (2MB max - images are already resized client-side)
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: 'File too large. Maximum 2MB.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const supabase = getSupabase();

    // Ensure assets bucket exists
    const bucketName = 'assets';
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket: any) => bucket.name === bucketName);

    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5242880,
      });
      if (createError) {
        return c.json({ error: 'Failed to create storage bucket', details: createError.message }, 500);
      }
    }

    // Use email hash as filename to avoid special chars
    const encoder = new TextEncoder();
    const data = encoder.encode(userEmail.toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const emailHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `profile-images/${emailHash}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return c.json({ error: 'Failed to upload avatar', details: uploadError.message }, 500);
    }

    // Get public URL with cache-busting timestamp
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Update user record
    const { error: updateError } = await supabase
      .from('users')
      .update({ profile_image_url: publicUrl })
      .eq('email', userEmail);

    if (updateError) {
      console.error('Failed to update user profile_image_url:', updateError);
    }

    console.log(`✅ Avatar uploaded for ${userEmail}: ${publicUrl}`);

    return c.json({
      success: true,
      url: publicUrl,
    });

  } catch (error: any) {
    console.error('Error uploading avatar:', error);
    return c.json({ error: 'Failed to upload avatar', details: error.message }, 500);
  }
});

// ============ LOGO UPLOAD ENDPOINT ============
app.post('/make-server-b87b0c07/upload-logo', async (c) => {
  try {
    console.log('📤 Upload logo request received');
    
    const formData = await c.req.formData();
    const file = formData.get('logo');
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No logo file provided' }, 400);
    }
    
    console.log('📁 File received:', file.name, file.type, file.size, 'bytes');
    
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);
    
    // Use the existing Supabase client
    const supabase = getSupabase();
    
    // Ensure assets bucket exists and is public
    const bucketName = 'assets';
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      console.log('📦 Creating assets bucket...');
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
      });
      
      if (createError) {
        console.error('❌ Failed to create bucket:', createError);
        return c.json({ error: 'Failed to create storage bucket', details: createError.message }, 500);
      }
    }
    
    // Upload logo
    const fileName = 'wellnest-logo.png';
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true, // Replace if exists
      });
    
    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return c.json({ error: 'Failed to upload logo', details: uploadError.message }, 500);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    const publicUrl = urlData.publicUrl;
    console.log('✅ Logo uploaded successfully:', publicUrl);
    
    return c.json({ 
      success: true, 
      url: publicUrl,
      message: 'Logo uploaded successfully. Please update the email template with this URL.'
    });
    
  } catch (error) {
    console.error('❌ Error uploading logo:', error);
    return c.json({ error: 'Failed to upload logo', details: error.message }, 500);
  }
});

// ============ SERVER STARTUP ============

console.log('🚀 Wellnest Pilates Server Starting...');
console.log('📧 Email Configuration:');
const hasResendKey = !!Deno.env.get('RESEND_API_KEY');
console.log(`   - RESEND_API_KEY: ${hasResendKey ? '✅ Configured' : '❌ Missing'}`);
if (hasResendKey) {
  console.log(`   - From address: ${STUDIO_INFO.email}`);
  console.log('   - Emails will be sent to all addresses');
  console.log('   - Note: If domain not verified, verify at resend.com/domains');
}

Deno.serve(app.fetch);
