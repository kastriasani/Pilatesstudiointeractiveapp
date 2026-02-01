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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '16:00', '17:00', '18:00'];

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
  individual1: { price: 1600, label: '1-on-1 Single Session', description: 'Private training' },
  individual8: { price: 12000, label: '1-on-1 8 Sessions', description: '8 private sessions' },
  individual12: { price: 16800, label: '1-on-1 12 Sessions', description: '12 private sessions' },
  duo1: { price: 1200, label: 'DUO Single Session', description: 'For 2 people' },
  duo8: { price: 8800, label: 'DUO 8 Sessions', description: '8 duo sessions' },
  duo12: { price: 12000, label: 'DUO 12 Sessions', description: '12 duo sessions' },
};

const STUDIO_INFO = {
  name: 'WellNest Pilates',
  address: 'Gjuro Gjakovikj 59, Kumanovo 1300',
  email: 'info@wellnestpilates.com',
};

// ============ EMAIL TRANSLATIONS ============

const EMAIL_TRANSLATIONS = {
  EN: {
    greeting: 'Hello',
    bookingConfirmation: 'Booking Confirmation',
    thankYou: 'Thank you for registering on our waitlist. Reservations are now open.',
    gratitude: 'As a thank you, you have received a special bonus. Enter the code at checkout when purchasing a package.',
    bonusTitle: 'WAITLIST BENEFIT',
    bonusDescription: '1 bonus class added after purchasing an 8+ class package',
    bonusNote: 'Pay for 8, get 9 classes',
    exclusions: 'Not valid for single, 1-on-1, or duo classes.',
    personalCode: 'YOUR PERSONAL CODE',
    validPackages: 'Valid for packages 8, 10, or 12. Valid only 50 days. Not shareable.',
    redeem: 'Redeem Package',
    howToRedeem: 'How to redeem the code',
    step1: 'Open packages',
    step2: 'Redeem packages 8, 10, or 12',
    step3: 'At checkout, enter the code to receive 1 bonus class',
    needHelp: 'Need help with the code? Contact us at',
    bookingDate: 'Booking Date',
    yourSession: 'Your Session',
    date: 'Date',
    time: 'Time',
    important: 'Important',
    paymentMessage: 'Your account will be activated after payment is completed at the studio.',
    lookForward: 'We look forward to seeing you!',
    questionsContact: 'Questions? Contact us:',
    subject: 'Booking Confirmation - WellNest Pilates',
  },
  SQ: {
    greeting: 'Përshëndetje',
    bookingConfirmation: 'Konfirmim Rezervimi',
    thankYou: 'Faleminderit që u regjistruat në listën tonë të pritjes. Rezervimet tani janë të hapura.',
    gratitude: 'Si falënderim, keni përfituar një bonus të veçantë. Vendosni kodin në checkout gjatë blerjes së paketës.',
    bonusTitle: 'PËRFITIMI I LISTËS SË PRITJES',
    bonusDescription: '1 seancë bonus shtohet vetëm pasi blini paketë me 8 ose më shumë',
    bonusNote: 'Paguani 8, merrni 9 seanca',
    exclusions: 'Nuk vlen për seancë teke, 1 on 1, ose duo.',
    personalCode: 'KODI JUAJ PERSONAL',
    validPackages: 'Vlen per paketat 8, 10, ose 12. Vlen vetëm 50 ditë. Nuk përdoret.',
    redeem: 'Zgjedh paketën',
    howToRedeem: 'Si ta përdorni kodin',
    step1: 'Hapni faqen e paketave',
    step2: 'Zgjedhni paketat 8, 10, ose 12',
    step3: 'Në checkout, vendosni kodin për të marrë 1 seancë bonus',
    needHelp: 'Nëse keni problem me kodin, na shkruani tek',
    bookingDate: 'Data e Rezervimit',
    yourSession: 'Seanca Juaj',
    date: 'Data',
    time: 'Ora',
    important: 'I rëndësishëm',
    paymentMessage: 'Llogaria juaj do të aktivizohet pas përfundimit të pagesës në studio.',
    lookForward: 'Presim me padurim t\'ju shohim!',
    questionsContact: 'Pyetje? Na kontaktoni:',
    subject: 'Konfirmim Rezervimi - WellNest Pilates',
  },
  MK: {
    greeting: 'Здраво',
    bookingConfirmation: 'Потврда за резервација',
    thankYou: 'Ви благодариме што се регистриравте на нашата листа на чекање. Резервациите сега се отворени.',
    gratitude: 'Како благодарност, добивте специјален бонус. Внесете го кодот при плаќање кога купувате пакет.',
    bonusTitle: 'БЕНЕФИТ ОД ЛИСТАТА НА ЧЕКАЊЕ',
    bonusDescription: '1 бонус час се додава само ако купите пакет со 8 или повеќе',
    bonusNote: 'Платете 8, добијте 9 часови',
    exclusions: 'Не важи за поединечни, 1 на 1, или дуо часови.',
    personalCode: 'ВАШ ЛИЧЕН КОД',
    validPackages: 'Важи за пакети 8, 10, или 12. Важи само 50 дена. Не се споделува.',
    redeem: 'Искористи пакет',
    howToRedeem: 'Како да го искористите кодот',
    step1: 'Отворете ја страната со пакети',
    step2: 'Изберете пакети 8, 10, или 12',
    step3: 'При плаќање, внесете го кодот за да добиете 1 бонус час',
    needHelp: 'Ако имате проблем со кодот, контактирајте нѐ на',
    bookingDate: 'Датум на резервација',
    yourSession: 'Вашата сесија',
    date: 'Датум',
    time: 'Време',
    important: 'Важно',
    paymentMessage: 'Вашата сметка ќе биде активирана по завршувањето на уплатата во студиото.',
    lookForward: 'Се радуваме да ве видиме!',
    questionsContact: 'Прашања? Контактирајте нѐ:',
    subject: 'Потврда за резервација - WellNest Pilates',
  }
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

function generateActivationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'WN-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
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
  const [month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = timeSlot.split(':').map(Number);
  const year = 2026;
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

function formatDateString(dateKey: string): string {
  const [month, day] = dateKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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

  return { valid: true };
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

async function calculateSlotCapacity(dateKey: string, timeSlot: string): Promise<{available: number, isBlocked: boolean, isPrivate: boolean}> {
  const allReservations = await kv.getByPrefix('reservation:');
  const slotReservations = allReservations.filter((r: any) => 
    r.dateKey === dateKey && 
    r.timeSlot === timeSlot && 
    (r.reservationStatus === 'confirmed' || r.reservationStatus === 'attended')
  );

  const hasPrivateSession = slotReservations.some((r: any) => r.isPrivateSession);
  if (hasPrivateSession) {
    return { available: 0, isBlocked: true, isPrivate: true };
  }

  const seatsOccupied = slotReservations.reduce((total: number, r: any) => {
    return total + (r.seatsOccupied || 1);
  }, 0);

  return {
    available: Math.max(0, 4 - seatsOccupied),
    isBlocked: seatsOccupied >= 4,
    isPrivate: false
  };
}

// ============ EMAIL FUNCTIONS ============

function getEmailHeader(): string {
  return `
    <tr>
      <td style="background-color: #3d2f28; padding: 60px 40px; text-align: center;">
        <div style="font-family: 'Georgia', serif; color: #ffffff; font-size: 48px; font-weight: 300; letter-spacing: 6px; margin-bottom: 20px;">
          WELLNEST
        </div>
        <div style="color: #d4c5b9; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px;">
          ESTD. &nbsp;&nbsp; PILATES STUDIO &nbsp;&nbsp; 2025
        </div>
        <div style="color: #d4c5b9; font-size: 11px; letter-spacing: 1px;">
          ${STUDIO_INFO.address}
        </div>
      </td>
    </tr>
  `;
}

function getEmailFooter(language: string = 'EN'): string {
  const lang = (language?.toUpperCase() || 'EN') as keyof typeof EMAIL_TRANSLATIONS;
  const t = EMAIL_TRANSLATIONS[lang] || EMAIL_TRANSLATIONS.EN;
  
  return `
    <tr>
      <td style="background-color: #f5f0ed; padding: 30px; text-align: center;">
        <p style="margin: 0 0 10px 0; color: #6b5949; font-size: 14px;">${t.questionsContact}</p>
        <p style="margin: 0; color: #9ca571; font-size: 14px;">
          📍 ${STUDIO_INFO.address}<br>
          📧 ${STUDIO_INFO.email}
        </p>
      </td>
    </tr>
  `;
}

function buildEmailTemplate(content: string, language: string = 'EN'): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f0ed;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f0ed; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                ${getEmailHeader()}
                <tr>
                  <td style="padding: 40px;">
                    ${content}
                  </td>
                </tr>
                ${getEmailFooter(language)}
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendEmail(to: string, subject: string, htmlContent: string, language: string = 'EN') {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('⚠️ RESEND_API_KEY not configured - email not sent');
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
        html: buildEmailTemplate(htmlContent, language),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      const errorData = JSON.parse(errorText);
      
      // Check if it's a domain verification issue
      if (errorData.statusCode === 403 && errorData.name === 'validation_error') {
        console.warn(`⚠️ EMAIL NOT SENT: Domain may not be verified in Resend`);
        console.warn(`   Attempted to send from: ${STUDIO_INFO.email} to: ${to}`);
        console.warn(`   📝 To enable production emails: Verify your domain at resend.com/domains`);
        console.warn(`   📝 Or add the recipient email as a verified sender at resend.com`);
        return { success: false, error: 'Domain verification required', testMode: true };
      }
      
      console.error('❌ Email sending failed:', errorText);
      return { success: false, error: `Failed to send email: ${errorText}` };
    }

    const result = await emailResponse.json();
    console.log('✅ Email sent successfully to:', to, 'in language:', language);
    return { success: true, result };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
}

async function sendActivationEmail(
  email: string,
  name: string,
  surname: string,
  activationCode: string,
  packageType: PackageType,
  firstSessionDetails?: {
    date: string;
    timeSlot: string;
    endTime: string;
    instructor: string;
  }
) {
  const { price, label: packageName } = getPackagePriceInfo(packageType);
  const sessionCount = extractSessionCount(packageType);

  const firstSessionHtml = firstSessionDetails ? `
    <div style="background-color: #e8f5e9; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <h3 style="margin: 0 0 16px 0; color: #2e7d32; font-size: 18px;">📅 Your First Class</h3>
      <p style="margin: 0; color: #1b5e20; font-size: 15px; line-height: 1.6;">
        <strong>Date:</strong> ${firstSessionDetails.date}<br>
        <strong>Time:</strong> ${firstSessionDetails.timeSlot} - ${firstSessionDetails.endTime}<br>
        <strong>Instructor:</strong> ${firstSessionDetails.instructor}
      </p>
    </div>
    <p style="margin: 0 0 20px 0; color: #6b5949; font-size: 15px; line-height: 1.6;">
      <strong>Remaining classes:</strong> ${sessionCount - 1} more class${sessionCount - 1 !== 1 ? 'es' : ''} to book through your dashboard.
    </p>
  ` : '';

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #3d2f28; font-size: 24px;">Welcome, ${name}${surname ? ' ' + surname : ''}! 🎉</h2>
    
    <p style="margin: 0 0 20px 0; color: #6b5949; font-size: 16px; line-height: 1.6;">
      Thank you for choosing ${STUDIO_INFO.name}! Your ${packageName} ${firstSessionDetails ? 'package is ready to be activated' : 'booking is confirmed'}.
    </p>
    
    <div style="background-color: #f5f0ed; border-radius: 12px; padding: 24px; margin: 30px 0;">
      <p style="margin: 0 0 12px 0; color: #6b5949; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Activation Code</p>
      <p style="margin: 0; color: #3d2f28; font-size: 32px; font-weight: bold; letter-spacing: 2px; font-family: 'Courier New', monospace;">
        ${activationCode}
      </p>
    </div>
    
    <div style="background-color: #fff8f0; border-left: 4px solid #9ca571; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #6b5949; font-size: 14px; line-height: 1.6;">
        <strong style="color: #3d2f28;">Package Details:</strong><br>
        ${packageName} - ${price} DEN
      </p>
    </div>
    
    ${firstSessionHtml}
    
    <h3 style="margin: 30px 0 16px 0; color: #3d2f28; font-size: 18px;">How to Activate:</h3>
    <ol style="margin: 0; padding-left: 20px; color: #6b5949; font-size: 15px; line-height: 1.8;">
      <li>Open the ${STUDIO_INFO.name} booking app</li>
      <li>Click on "Member Login" or "Activate Member Area"</li>
      <li>Enter your email and the activation code above</li>
      <li>Start ${firstSessionDetails ? 'booking your remaining sessions' : 'enjoying your Pilates journey'}!</li>
    </ol>
    
    <div style="background-color: #f5f0ed; border-radius: 12px; padding: 20px; margin: 30px 0;">
      <p style="margin: 0 0 12px 0; color: #3d2f28; font-size: 14px; font-weight: 600;">Important:</p>
      <ul style="margin: 0; padding-left: 20px; color: #6b5949; font-size: 14px; line-height: 1.6;">
        <li>Payment is due in the studio before your class</li>
        <li>Please arrive 10 minutes early for your first class</li>
        <li>Cancellations must be made at least 24 hours in advance</li>
        <li>This activation code expires in 24 hours</li>
      </ul>
    </div>
  `;

  return sendEmail(
    email,
    firstSessionDetails
      ? `Activate Your ${packageName} Package - ${STUDIO_INFO.name}`
      : `Confirm Your Booking - ${STUDIO_INFO.name}`,
    content
  );
}

// Send login email after admin activation (no activation code needed)
async function sendLoginEmail(
  email: string,
  name: string,
  verificationToken: string,
  appUrl: string
) {
  const loginUrl = `${appUrl}/set-password?token=${verificationToken}`;

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #3d2f28; font-size: 24px;">Welcome to ${STUDIO_INFO.name}! 🎉</h2>

    <p style="margin: 0 0 20px 0; color: #6b5949; font-size: 16px; line-height: 1.6;">
      Hi ${name},<br><br>
      Great news! Your account has been activated and your payment has been confirmed.
    </p>

    <div style="background-color: #e8f5e9; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 16px 0; color: #2e7d32; font-size: 18px; font-weight: 600;">Your account is ready!</p>
      <a href="${loginUrl}" style="display: inline-block; background-color: #6b5949; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600;">
        Set Password & Login
      </a>
    </div>

    <p style="margin: 0 0 20px 0; color: #6b5949; font-size: 14px; line-height: 1.6;">
      Or copy this link: <a href="${loginUrl}" style="color: #6b5949;">${loginUrl}</a>
    </p>

    <div style="background-color: #fff8f0; border-left: 4px solid #9ca571; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #6b5949; font-size: 14px; line-height: 1.6;">
        <strong style="color: #3d2f28;">What's next?</strong><br>
        1. Click the button above to set your password<br>
        2. Log in to your dashboard<br>
        3. Book your Pilates sessions!
      </p>
    </div>

    <p style="margin: 0; color: #999; font-size: 12px;">
      This link expires in 24 hours. If you didn't request this, please ignore this email.
    </p>
  `;

  return sendEmail(
    email,
    `Your ${STUDIO_INFO.name} Account is Activated!`,
    content
  );
}

async function sendRegistrationEmail(
  email: string,
  name: string,
  surname: string,
  verificationToken: string,
  packageType: PackageType,
  firstSessionDate: string,
  firstSessionTime: string,
  firstSessionEndTime: string,
  appUrl: string,
  language: string = 'EN',
  bonusClasses: number = 0,
  redemptionCode: string = ''
) {
  // Normalize language to uppercase and default to EN if invalid
  const lang = (language?.toUpperCase() || 'EN') as keyof typeof EMAIL_TRANSLATIONS;
  const t = EMAIL_TRANSLATIONS[lang] || EMAIL_TRANSLATIONS.EN;

  const { price, label: packageName } = getPackagePriceInfo(packageType);
  const sessionCount = extractSessionCount(packageType);
  const isSingleSession = packageType === 'single';

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const bonusHtml = bonusClasses > 0 ? `<div style="background-color: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0; border: 2px solid #86efac;"><h3 style="margin: 0 0 12px 0; color: #16a34a; font-size: 18px;">🎁 Bonus Redeemed!</h3><p style="margin: 0; color: #15803d; font-size: 15px; font-weight: bold;">+${bonusClasses} Free Class Added!</p><p style="margin: 8px 0 0 0; color: #166534; font-size: 14px;">Your coupon has been successfully redeemed.</p></div>` : '';

  // Package details section - different for single vs package
  const packageDetailsHtml = isSingleSession
    ? `<div style="background-color: #f5f0ed; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; color: #8b7764; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">SEANCË TEKE</p>
        <p style="margin: 0; color: #3d2f28; font-size: 18px; font-weight: bold;">ÇMIMI: ${price} DEN</p>
      </div>`
    : `<div style="background-color: #f5f0ed; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; color: #8b7764; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">PAKETA</p>
        <p style="margin: 0 0 8px 0; color: #3d2f28; font-size: 18px; font-weight: bold;">${sessionCount} Klase</p>
        <p style="margin: 0; color: #6b5949; font-size: 15px;">ÇMIMI: ${price} DEN</p>
      </div>`;

  // Session label - "KLASA E PARE" for packages, "SEANCA JUAJ" for single
  const sessionLabel = isSingleSession ? t.yourSession : 'KLASA E PARE';

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #3d2f28; font-size: 24px;">${t.bookingConfirmation}</h2>

    <p style="margin: 0 0 10px 0; color: #6b5949; font-size: 16px; line-height: 1.6;">
      ${t.thankYou}
    </p>

    <p style="margin: 0 0 20px 0; color: #8b7764; font-size: 14px;">
      <strong>${t.bookingDate}:</strong> ${currentDate}
    </p>

    ${packageDetailsHtml}

    ${bonusHtml}

    <div style="background-color: #e8f5e9; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <h3 style="margin: 0 0 16px 0; color: #2e7d32; font-size: 18px;">📅 ${sessionLabel}</h3>
      <p style="margin: 0; color: #1b5e20; font-size: 15px; line-height: 1.6;">
        <strong>${t.date}:</strong> ${firstSessionDate}<br>
        <strong>${t.time}:</strong> ${firstSessionTime} - ${firstSessionEndTime}
      </p>
    </div>

    <div style="background-color: #fff8f0; border-left: 4px solid #9ca571; padding: 20px; margin: 24px 0;">
      <p style="margin: 0; color: #6b5949; font-size: 15px; line-height: 1.6;">
        <strong style="color: #3d2f28;">${t.important}:</strong><br>
        ${t.paymentMessage}
      </p>
    </div>

    <p style="margin: 20px 0 0 0; color: #6b5949; font-size: 14px; line-height: 1.6;">
      ${t.lookForward}
    </p>
  `;

  return sendEmail(email, t.subject, content, language);
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
      return c.json({ valid: false, error: "Invalid coupon code format" });
    }

    const normalizedCode = code.trim().toUpperCase();
    console.log(`🔍 Looking for coupon: ${normalizedCode}`);
    
    // Query redemption_codes table DIRECTLY (not kv_store!)
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
      return c.json({ valid: false, error: "Coupon not found" });
    }

    console.log(`✅ Coupon found:`, coupon);
    
    return c.json({ 
      valid: true, 
      message: "Valid coupon! You'll receive +1 free class",
      bonusClasses: 1
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({ valid: false, error: 'Server error' }, 500);
  }
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
      console.log(`❌ Coupon not found in redemption_codes table: ${normalizedCode}`);
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
    if (expiresAt && new Date(expiresAt) < new Date()) {
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

    if (!VALID_PACKAGE_TYPES.includes(packageType)) {
      return c.json({ error: "Invalid package type" }, 400);
    }

    if (packageType === 'single') {
      return c.json({ error: "Use /reservations endpoint for single sessions" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();
    const now = new Date().toISOString();

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

    if (!existingUser) {
      // Create new user
      const { error: userCreateError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          name,
          surname,
          mobile,
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
        const isExpired = expiresAt && new Date(expiresAt) < new Date();
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
        console.log(`⚠️ Coupon ${normalizedCoupon} not found in redemption_codes table`);
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

    if (!dateKey || !timeSlot || !instructor) {
      return c.json({ error: "Missing required fields: dateKey, timeSlot, instructor" }, 400);
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

    if (pkg.first_reservation_id !== null) {
      return c.json({ error: "First session already booked for this package" }, 400);
    }

    if (pkg.package_status !== 'pending') {
      return c.json({ error: "Package is not in pending state" }, 400);
    }

    const serviceType = extractServiceType(pkg.package_type);
    const capacity = await calculateSlotCapacity(dateKey, timeSlot);

    if (serviceType === 'individual') {
      if (capacity.available < 4) {
        return c.json({ error: "Slot not available for 1-on-1 session (must be empty)" }, 400);
      }
    } else if (serviceType === 'duo') {
      if (capacity.available < 2) {
        return c.json({ error: "Slot does not have enough space for DUO (requires 2 spots)" }, 400);
      }
      if (!partnerName || !partnerSurname) {
        return c.json({ error: "Partner name and surname required for DUO bookings" }, 400);
      }
    } else {
      if (capacity.available < 1) {
        return c.json({ error: "Slot is full" }, 400);
      }
    }

    const dateString = formatDateString(dateKey);
    const endTime = calculateEndTime(timeSlot);

    // Insert reservation into Supabase (not KV)
    const { data: insertedReservation, error: resError } = await supabase
      .from('reservations')
      .insert({
        user_email: pkg.user_email,
        package_id: pkg.id,
        date_key: dateKey,
        time_slot: timeSlot,
        reservation_status: 'pending',
        payment_status: pkg.payment_status || 'unpaid',
        name: pkg.name,
        surname: pkg.surname,
        mobile: pkg.mobile,
        instructor,
        package_type: pkg.package_type,
        service_type: serviceType,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (resError || !insertedReservation) {
      console.error('Error creating reservation in Supabase:', resError);
      return c.json({ error: 'Failed to create reservation', details: resError?.message }, 500);
    }

    const reservationId = insertedReservation.id;

    // Update user_packages in Supabase (not KV)
    const { error: updatePkgError } = await supabase
      .from('user_packages')
      .update({
        first_reservation_id: reservationId,
        updated_at: now
      })
      .eq('id', packageId);

    if (updatePkgError) {
      console.error('Error updating package in Supabase:', updatePkgError);
    }

    // Check user from Supabase and send email if needed
    try {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', pkg.user_email)
        .single();

      if (!user || !user.password_hash) {
        const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
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

        await sendRegistrationEmail(
          pkg.user_email,
          pkg.name,
          pkg.surname,
          verificationToken,
          pkg.package_type,
          dateString,
          timeSlot,
          endTime,
          appUrl,
          pkg.language || 'en',
          pkg.bonus_classes || 0,
          pkg.redeemed_coupon_code || ''
        );
        console.log(`Registration email sent to: ${pkg.user_email} in language: ${pkg.language}`);
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
      remainingSessions: pkg.remaining_sessions,
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

    if (!userId || !serviceType || !dateKey || !timeSlot || !instructor) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    if (!name || !surname || !email || !mobile) {
      return c.json({ error: "Missing personal information" }, 400);
    }

    // DUO validation (keep this check before RPC for better error message)
    if (serviceType === 'duo' && (!partnerName || !partnerSurname)) {
      return c.json({ error: "Partner information required for DUO bookings" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const isPackageSession = !!packageId;

    // Call atomic RPC for reservation creation
    // This handles: capacity check, duplicate check, package decrement - all atomically
    const supabase = getSupabase();
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation', {
      p_user_email: normalizedEmail,
      p_package_id: packageId || null,
      p_service_type: serviceType,
      p_date_key: dateKey,
      p_time_slot: timeSlot,
      p_instructor: instructor,
      p_name: name,
      p_surname: surname,
      p_mobile: mobile,
      p_package_type: packageType || null,
      p_partner_name: partnerName || null,
      p_partner_surname: partnerSurname || null
    });

    if (rpcError) {
      console.error('RPC error creating reservation:', rpcError);
      return c.json({ error: 'Failed to create reservation', details: rpcError.message }, 500);
    }

    if (rpcResult?.error) {
      // Map RPC errors to user-friendly messages
      const errorMap: Record<string, string> = {
        'Slot blocked by private session': 'Slot not available for booking',
        'Insufficient capacity': 'Slot is full',
        'Duplicate booking': 'You already have a booking at this time',
        'Package not found': 'Package not found',
        'No remaining sessions': 'No remaining sessions in package',
        'Package not active': 'Package is not active'
      };
      const userError = errorMap[rpcResult.error] || rpcResult.error;
      return c.json({ error: userError }, 400);
    }

    const reservationId = rpcResult.reservation_id;
    const reservationStatus = rpcResult.status;
    const dateString = formatDateString(dateKey);
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

        await sendRegistrationEmail(
          normalizedEmail,
          name,
          surname,
          '', // No verification token yet - will be sent when admin activates
          'single',
          dateString,
          timeSlot,
          endTime,
          appUrl,
          language,
          0, // Single sessions don't have coupons
          '' // No redemption code for single sessions
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
      query = query.eq('date_key', dateKey);
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
        }
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

    // If linked to a package, restore the session
    if (reservation.package_id) {
      const { data: pkg } = await supabase
        .from('user_packages')
        .select('*')
        .eq('id', reservation.package_id)
        .single();

      if (pkg) {
        const newSessionsBooked = (pkg.sessions_booked || []).filter((id: string) => id !== reservationId);
        const newSessionsAttended = (pkg.sessions_attended || []).filter((id: string) => id !== reservationId);
        const newRemainingSessionsions = pkg.total_sessions - newSessionsBooked.length;

        const packageUpdates: Record<string, any> = {
          sessions_booked: newSessionsBooked,
          sessions_attended: newSessionsAttended,
          remaining_sessions: newRemainingSessionsions,
          updated_at: new Date().toISOString()
        };

        // If this was the first reservation, reset package status
        if (pkg.first_reservation_id === reservationId) {
          packageUpdates.first_reservation_id = null;
          packageUpdates.package_status = 'pending';
        }

        await supabase
          .from('user_packages')
          .update(packageUpdates)
          .eq('id', reservation.package_id);
      }
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

    const { error: pkgError } = await supabase
      .from('user_packages')
      .update({
        activation_status: 'activated',
        payment_status: 'paid',
        activation_date: now,
        expiry_date: expiryDate.toISOString(),
        status: 'active',
        updated_at: now
      })
      .eq('user_email', normalizedEmail)
      .eq('activation_status', 'pending');

    if (pkgError) {
      console.error('Error updating packages:', pkgError);
      // Continue anyway - user might not have packages yet
    }

    // 3. Confirm all pending reservations for this user
    const { error: resError } = await supabase
      .from('reservations')
      .update({
        reservation_status: 'confirmed',
        payment_status: 'paid',
        updated_at: now
      })
      .eq('user_email', normalizedEmail)
      .eq('reservation_status', 'pending');

    if (resError) {
      console.error('Error updating reservations:', resError);
      // Continue anyway
    }

    // 4. Generate verification token for password setup
    const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
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

    // 5. Send login email with password setup link
    const appUrl = c.req.header('origin') || 'https://app.wellnestpilates.com';
    try {
      await sendLoginEmail(normalizedEmail, user.name || '', verificationToken, appUrl);
      console.log(`Login email sent to: ${normalizedEmail}`);
    } catch (emailError) {
      console.error('Failed to send login email:', emailError);
      // Don't fail the activation if email fails
    }

    console.log(`User activated by admin: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: 'User activated successfully! Login email sent.',
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

// ============ ADMIN ENDPOINTS ============

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

    // Build user summaries with package info from users table
    const userSummaries = (users || []).map((user: any) => {
      // Find reservations for this user
      const userReservations = (reservations || []).filter(
        (res: any) => res.user_email === user.email
      );

      // Package info is stored directly on user in Supabase schema
      const packages = user.package_type ? [{
        id: user.id,
        type: user.package_type,
        status: user.activation_status || 'pending',
        paymentStatus: user.payment_status || 'unpaid',
        activationStatus: user.activation_status || 'pending',
        sessionsUsed: user.used_sessions || 0,
        createdAt: user.created_at,
        activationDate: user.activated_at,
        expiryDate: user.package_expiry_date,
      }] : [];

      return {
        id: user.id,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile,
        email: user.email,
        paymentStatus: user.payment_status || 'unpaid',
        packages,
        reservations: userReservations.map((res: any) => ({
          id: res.id,
          dateKey: res.date_key,
          timeSlot: res.time_slot,
          reservationStatus: res.reservation_status,
          paymentStatus: res.payment_status,
          createdAt: res.created_at,
        })),
        totalSessions: user.total_sessions || 0,
        usedSessions: user.used_sessions || 0,
        remainingSessions: user.remaining_sessions || 0,
        createdAt: user.created_at,
        blocked: user.blocked || false,
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

    // Update user payment status
    const { data: userUpdate, error: userError } = await supabase
      .from('users')
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('email', normalizedEmail)
      .select();

    if (userError) {
      console.error('Error updating user payment status:', userError);
      return c.json({ error: 'Failed to update user', details: userError.message }, 500);
    }

    // Update all reservations for this user
    const { data: resUpdate, error: resError } = await supabase
      .from('reservations')
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_email', normalizedEmail)
      .select();

    if (resError) {
      console.error('Error updating reservations payment status:', resError);
      // Don't fail - user was updated successfully
    }

    console.log(`💳 Payment status updated to '${paymentStatus}' for user: ${normalizedEmail} (Supabase)`);

    return c.json({
      success: true,
      message: `Payment status updated to '${paymentStatus}'`,
      userUpdated: userUpdate?.length || 0,
      reservationsUpdated: resUpdate?.length || 0,
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    return c.json({ error: 'Failed to update payment status', details: error.message }, 500);
  }
});

// Resend activation code email for a user (OBSOLETE - kept for backwards compatibility)
app.post("/make-server-b87b0c07/admin/resend-activation-code", async (c) => {
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
    
    // Find user's active activation codes
    const allActivationCodes = await kv.getByPrefix('activation_code:');
    const userActivationCodes = allActivationCodes.filter(
      (code: any) => code.email === normalizedEmail && code.status === 'active'
    );

    if (userActivationCodes.length === 0) {
      return c.json({ error: "No active activation codes found for this user" }, 404);
    }

    // Get the most recent activation code
    const latestCode = userActivationCodes.sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    // Get the user info
    const user = await kv.get(`user:${normalizedEmail}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Determine what type of activation code it is
    let packageType: PackageType = 'single';
    let firstSessionDetails = null;

    if (latestCode.packageId) {
      const pkg = await kv.get(latestCode.packageId);
      if (pkg) {
        packageType = pkg.packageType;
        
        // If there's a first reservation, get those details
        if (pkg.firstReservationId) {
          const reservation = await kv.get(pkg.firstReservationId);
          if (reservation) {
            const [hours, minutes] = reservation.timeSlot.split(':');
            const endTime = `${(parseInt(hours) + 1).toString().padStart(2, '0')}:${minutes}`;
            
            firstSessionDetails = {
              date: formatDateString(reservation.dateKey),
              timeSlot: reservation.timeSlot,
              endTime,
              instructor: reservation.instructor,
            };
          }
        }
      }
    } else if (latestCode.reservationId) {
      const reservation = await kv.get(latestCode.reservationId);
      if (reservation) {
        const [hours, minutes] = reservation.timeSlot.split(':');
        const endTime = `${(parseInt(hours) + 1).toString().padStart(2, '0')}:${minutes}`;
        
        firstSessionDetails = {
          date: formatDateString(reservation.dateKey),
          timeSlot: reservation.timeSlot,
          endTime,
          instructor: reservation.instructor,
        };
      }
    }

    // Resend the activation email
    await sendActivationEmail(
      normalizedEmail,
      user.name,
      user.surname,
      latestCode.code,
      packageType,
      firstSessionDetails
    );

    console.log(`Activation code resent to: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: 'Activation code resent successfully',
      code: latestCode.code,
    });
  } catch (error) {
    console.error('Error resending activation code:', error);
    return c.json({ error: 'Failed to resend activation code', details: error.message }, 500);
  }
});

// ============ LEGACY ENDPOINTS ============

// GET /bookings - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/bookings", async (c) => {
  try {
    const userId = c.req.query('userId');
    const dateKey = c.req.query('dateKey');

    const supabase = getSupabase();
    let query = supabase.from('reservations').select('*');

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      query = query.eq('user_email', normalizedEmail);
    }

    if (dateKey) {
      query = query.eq('date_key', dateKey);
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
      instructor: r.instructor || 'Rina',
      selectedPackage: r.package_type,
      payInStudio: r.payment_status !== 'paid',
      language: 'EN',
      status: r.reservation_status || 'pending',
      createdAt: r.created_at,
      userId: r.user_email,
      reservationStatus: r.reservation_status,
      paymentStatus: r.payment_status,
    }));

    console.log(`📅 Retrieved ${bookings.length} bookings from Supabase`);

    return c.json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return c.json({ error: 'Failed to fetch bookings', details: error.message }, 500);
  }
});

app.post("/make-server-b87b0c07/bookings", async (c) => {
  try {
    const body = await c.req.json();
    const { dateKey, timeSlot, instructor, name, surname, email, mobile, password, language } = body;

    if (!dateKey || !timeSlot || !instructor || !name || !surname || !email || !mobile || !password) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const capacity = await calculateSlotCapacity(dateKey, timeSlot);
    
    if (capacity.available < 1) {
      return c.json({ error: "Slot is full" }, 400);
    }

    const allReservations = await kv.getByPrefix('reservation:');
    const duplicateBooking = allReservations.find((r: any) => 
      r.userId === normalizedEmail &&
      r.dateKey === dateKey &&
      r.timeSlot === timeSlot &&
      (r.reservationStatus === 'pending' || r.reservationStatus === 'confirmed')
    );

    if (duplicateBooking) {
      return c.json({ error: "You already have a booking at this time" }, 400);
    }

    const passwordHash = await hashPassword(password);

    const userKey = `user:${normalizedEmail}`;
    let user = await kv.get(userKey);
    
    if (!user) {
      user = {
        id: userKey,
        email: normalizedEmail,
        name,
        surname,
        mobile,
        passwordHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        blocked: false,
        verified: true
      };
      await kv.set(userKey, user);
      console.log(`User created during booking: ${normalizedEmail}`);
    } else if (!user.passwordHash) {
      user.passwordHash = passwordHash;
      user.verified = true;
      user.updatedAt = new Date().toISOString();
      await kv.set(userKey, user);
      console.log(`Password set for existing user: ${normalizedEmail}`);
    }

    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const sessionKey = `session:${sessionToken}`;
    const sessionData = {
      id: sessionKey,
      token: sessionToken,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    await kv.set(sessionKey, sessionData);

    const dateString = formatDateString(dateKey);
    const reservationId = `reservation:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullDate = constructFullDate(dateKey, timeSlot);
    const endTime = calculateEndTime(timeSlot);

    const reservation = {
      id: reservationId,
      userId: normalizedEmail,
      packageId: null,
      sessionNumber: null,
      serviceType: 'single' as ServiceType,
      dateKey,
      date: dateString,
      fullDate,
      timeSlot,
      endTime,
      instructor,
      name,
      surname,
      email: normalizedEmail,
      mobile,
      partnerName: null,
      partnerSurname: null,
      reservationStatus: 'confirmed' as ReservationStatus,
      paymentStatus: 'unpaid' as PaymentStatus,
      seatsOccupied: 1,
      isPrivateSession: false,
      isOverbooked: false,
      isFirstSessionOfPackage: false,
      autoConfirmed: true,
      lateCancellation: false,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      attendedAt: null,
      language: language || 'en'
    };

    await kv.set(reservationId, reservation);
    console.log(`Booking created and confirmed: ${reservationId}`);

    return c.json({
      success: true,
      reservation,
      session: sessionToken,
      user: {
        email: normalizedEmail,
        name,
        surname,
        mobile
      },
      message: "Booking confirmed! You are now logged in."
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    return c.json({ error: 'Failed to create booking', details: error.message }, 500);
  }
});

app.post("/make-server-b87b0c07/activate-member", async (c) => {
  console.warn('Legacy /activate-member endpoint called - use /activate instead');
  return c.redirect('/make-server-b87b0c07/activate');
});

// ============ MIGRATION ENDPOINT ============

app.post("/make-server-b87b0c07/migrate-bookings", async (c) => {
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
            instructor: booking.instructor || 'Rina Krasniqi',
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

app.get("/make-server-b87b0c07/admin/orphaned-packages", async (c) => {
  try {
    const orphanedKeys = await kv.getByPrefix('orphaned_package:');
    const packages = [];
    
    for (const orphanedData of orphanedKeys) {
      const packageId = orphanedData.id.replace('orphaned_package:', '');
      const pkg = await kv.get(packageId);
      if (pkg) {
        packages.push(pkg);
      }
    }
    
    return c.json({ success: true, orphanedPackages: packages, count: packages.length });
  } catch (error) {
    console.error('Error fetching orphaned packages:', error);
    return c.json({ error: 'Failed to fetch orphaned packages', details: error.message }, 500);
  }
});

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
      .eq('date_key', dateKey);

    if (error) {
      console.error('Error fetching calendar from Supabase:', error);
      return c.json({ error: 'Failed to fetch calendar', details: error.message }, 500);
    }

    const dateReservations = reservations || [];

    const calendarData = TIME_SLOTS.map((timeSlot) => {
      // Filter confirmed/attended reservations for this slot
      const slotReservations = dateReservations.filter((r: any) =>
        r.time_slot === timeSlot &&
        (r.reservation_status === 'confirmed' || r.reservation_status === 'attended')
      );

      // Calculate capacity inline
      const hasPrivateSession = slotReservations.some((r: any) => r.service_type === 'individual' || r.service_type === 'duo');
      const seatsOccupied = slotReservations.reduce((total: number, r: any) => {
        return total + (r.service_type === 'duo' ? 2 : 1);
      }, 0);
      const available = hasPrivateSession ? 0 : Math.max(0, 4 - seatsOccupied);

      // Map to frontend format
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
        paymentStatus: r.payment_status,
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

    if (user.password_hash) {
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
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
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

    return c.json({
      success: true,
      message: "Registration complete! You can now log in.",
      session: sessionToken,
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname
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
    const { email, password, name, surname, mobile } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabase();

    // Check if user exists in Supabase
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email, password_hash')
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
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
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

    return c.json({
      success: true,
      message: "Login successful",
      session: sessionToken,
      user: {
        email: normalizedEmail,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile
      }
    });

  } catch (error) {
    console.error('Error logging in:', error);
    return c.json({ error: 'Login failed', details: (error as Error).message }, 500);
  }
});

app.get("/make-server-b87b0c07/auth/verify", async (c) => {
  try {
    const sessionToken = c.req.header('X-Session-Token');

    if (!sessionToken) {
      return c.json({ error: "No session token provided" }, 401);
    }

    const sessionKey = `session:${sessionToken}`;
    const session = await kv.get(sessionKey);

    if (!session) {
      return c.json({ error: "Invalid session" }, 401);
    }

    if (new Date(session.expiresAt) < new Date()) {
      return c.json({ error: "Session expired" }, 401);
    }

    const userKey = `user:${session.email}`;
    const user = await kv.get(userKey);

    if (!user || user.blocked) {
      return c.json({ error: "User not found or blocked" }, 401);
    }

    return c.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        surname: user.surname,
        mobile: user.mobile
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
    const sessionToken = `admin_session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
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

app.get("/make-server-b87b0c07/user/packages", async (c) => {
  try {
    const sessionToken = c.req.header('X-Session-Token');

    if (!sessionToken) {
      return c.json({ error: "No session token provided" }, 401);
    }

    // Session validation still uses KV
    const sessionKey = `session:${sessionToken}`;
    const session = await kv.get(sessionKey);

    if (!session || new Date(session.expiresAt) < new Date()) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }

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

    // Map packages to camelCase
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

app.post("/make-server-b87b0c07/user/packages/:id/reschedule", async (c) => {
  try {
    const packageId = c.req.param('id');
    const body = await c.req.json();
    const { dateKey, timeSlot, instructor } = body;

    if (!dateKey || !timeSlot || !instructor) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const pkg = await kv.get(packageId);
    if (!pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    if (!pkg.firstReservationId) {
      return c.json({ error: "No first session to reschedule" }, 400);
    }

    const firstReservation = await kv.get(pkg.firstReservationId);
    if (!firstReservation) {
      return c.json({ error: "First session not found" }, 404);
    }

    const sessionTime = new Date(firstReservation.fullDate);
    const now = new Date();
    const hoursUntilSession = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilSession < 24) {
      return c.json({ error: "Cannot reschedule less than 24 hours before the session" }, 400);
    }

    const serviceType = extractServiceType(pkg.packageType);
    const capacity = await calculateSlotCapacity(dateKey, timeSlot);

    if (serviceType === 'individual' && capacity.available < 4) {
      return c.json({ error: "Slot not available for 1-on-1 session" }, 400);
    } else if (serviceType === 'duo' && capacity.available < 2) {
      return c.json({ error: "Slot not available for DUO session" }, 400);
    } else if (capacity.available < 1) {
      return c.json({ error: "Slot is full" }, 400);
    }

    const dateString = formatDateString(dateKey);
    const fullDate = constructFullDate(dateKey, timeSlot);
    const endTime = calculateEndTime(timeSlot);

    firstReservation.dateKey = dateKey;
    firstReservation.date = dateString;
    firstReservation.fullDate = fullDate;
    firstReservation.timeSlot = timeSlot;
    firstReservation.endTime = endTime;
    firstReservation.instructor = instructor;
    firstReservation.updatedAt = new Date().toISOString();

    await kv.set(pkg.firstReservationId, firstReservation);

    console.log(`Rescheduled first session for package ${packageId}`);

    return c.json({
      success: true,
      message: "Session rescheduled successfully",
      reservation: firstReservation
    });

  } catch (error) {
    console.error('Error rescheduling session:', error);
    return c.json({ error: 'Failed to reschedule session', details: error.message }, 500);
  }
});

// ============ DEBUG ENDPOINT ============

app.get("/make-server-b87b0c07/debug/check-users", async (c) => {
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

// ============ WAITLIST ENDPOINTS ============

// Add user to waitlist
// POST /waitlist - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/waitlist", async (c) => {
  try {
    const { name, surname, mobile, email, language } = await c.req.json();

    if (!name || !surname || !mobile || !email) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    // Check if already in waitlist
    const { data: existing } = await supabase
      .from('waitlist_members')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return c.json({ error: 'Already in waitlist' }, 400);
    }

    // Insert into waitlist_members
    const { data: inserted, error } = await supabase
      .from('waitlist_members')
      .insert({
        email: normalizedEmail,
        name,
        surname,
        phone: mobile,
        language: language || 'sq',
        status: 'pending',
        signed_up_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting waitlist member:', error);
      return c.json({ error: 'Failed to add to waitlist', details: error.message }, 500);
    }

    console.log(`✅ Added user to waitlist (Supabase): ${normalizedEmail}`);

    // Map to frontend format
    const waitlistUser = {
      id: inserted.id,
      name: inserted.name,
      surname: inserted.surname,
      mobile: inserted.phone,
      email: inserted.email,
      status: inserted.status,
      addedAt: inserted.signed_up_at,
    };

    return c.json({ success: true, waitlistUser });
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    return c.json({ error: 'Failed to add to waitlist', details: error.message }, 500);
  }
});

// Get all waitlist users (admin only) - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/admin/waitlist", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('waitlist_members')
      .select('*')
      .order('signed_up_at', { ascending: false });

    if (error) {
      console.error('Error fetching waitlist from Supabase:', error);
      return c.json({ error: 'Failed to fetch waitlist', details: error.message }, 500);
    }

    // Map Supabase fields to expected frontend format
    const users = (data || []).map(member => ({
      email: member.email,
      name: member.name,
      surname: member.surname,
      phone: member.phone,
      language: member.language,
      status: member.status,
      addedAt: member.signed_up_at || member.imported_at,
      invitedAt: member.invited_at,
    }));

    console.log(`📋 Retrieved ${users.length} waitlist users from Supabase`);

    return c.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    return c.json({ error: 'Failed to fetch waitlist', details: error.message }, 500);
  }
});

// Send invite email to waitlist user(s)
app.post("/make-server-b87b0c07/admin/waitlist/send-invite", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const { emails, bulk = false } = await c.req.json();

    if (!emails || (Array.isArray(emails) && emails.length === 0)) {
      return c.json({ error: 'No emails provided' }, 400);
    }

    const emailList = Array.isArray(emails) ? emails : [emails];
    const results = [];
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return c.json({ error: 'Email service not configured' }, 500);
    }

    for (const email of emailList) {
      const normalizedEmail = email.toLowerCase().trim();
      const waitlistId = `waitlist:${normalizedEmail}`;
      
      const waitlistUser = await kv.get(waitlistId);
      
      if (!waitlistUser) {
        results.push({ email, success: false, error: 'Not found in waitlist' });
        continue;
      }

      // Detect language based on name/surname
      const detectLanguage = (name: string, surname: string): 'sq' | 'mk' | 'en' => {
        const fullName = `${name} ${surname}`.toLowerCase();
        
        // Albanian name patterns and common names
        const albanianPatterns = ['besa', 'arben', 'enkeleda', 'besim', 'alban', 'driton', 'erjon', 'flamur', 'gent'];
        const albanianEndings = ['aj', 'ush', 'ues'];
        
        // Macedonian name patterns and common names
        const macedonianPatterns = ['aleksandar', 'dimitrije', 'nikola', 'stefan', 'marija', 'elena', 'jovana', 'darko'];
        const macedonianEndings = ['ski', 'ovski', 'evski', 'ov', 'ova', 'ev', 'eva', 'ić', 'ič'];
        
        // Check for Albanian patterns
        for (const pattern of albanianPatterns) {
          if (fullName.includes(pattern)) return 'sq';
        }
        for (const ending of albanianEndings) {
          if (surname.toLowerCase().endsWith(ending)) return 'sq';
        }
        
        // Check for Macedonian patterns
        for (const pattern of macedonianPatterns) {
          if (fullName.includes(pattern)) return 'mk';
        }
        for (const ending of macedonianEndings) {
          if (surname.toLowerCase().endsWith(ending)) return 'mk';
        }
        
        // Default to English
        return 'en';
      };

      const language = detectLanguage(waitlistUser.name, waitlistUser.surname);
      console.log(`🌐 Detected language for ${waitlistUser.name} ${waitlistUser.surname}: ${language === 'sq' ? 'Albanian' : language === 'mk' ? 'Macedonian' : 'English'}`);
      
      // Translations
      const translations = {
        sq: {
          subject: '🎉 Mirë se vini në WellNest Pilates - Sesioni juaj falas ju pret!',
          welcome: 'Mirë se vini në WellNest Pilates!',
          greeting: 'Përshëndetje',
          intro: 'Jemi të entuziazmuar që t\'ju mirëpresim në familjen WellNest Pilates! 🧘‍♀️',
          offerText: 'Si dhuratë mirëseardhje të veçantë, ju ofrojmë:',
          offerTitle: '🎁 Ofertë ekskluzive:',
          offerDesc: 'Blini një paketë me 8 klasë dhe merrni <strong>klasën e parë FALAS!</strong>',
          redeemTitle: 'Kështu e shfrytëzoni:',
          redeemSteps: [
            'Vizitoni studion tonë ose kontaktoni për të rezervuar klasën tuaj të parë',
            'Zgjidhni datën dhe orën e klasës tuaj të parë',
            'Përfundoni blerjen e paketës me 8 klasë',
            'Klasa juaj e parë është falas!'
          ],
          codeLabel: 'Kodi juaj i Shpërblimit:',
          codeNote: 'Paraqisni këtë kod në studio',
          whatYouGetTitle: 'Çfarë do të merrni:',
          benefits: [
            'Paketë mujore me 8 klasë Pilates në grup të vogël',
            'Klasa e parë plotësisht falas',
            'Udhëzim ekspert nga instruktorë të çertifikuar',
            'Grup i vogël për vëmendje të personalizuar'
          ],
          locationTitle: '📍 Vendndodhja e Studios:',
          closing: 'Nuk mund të presim të ju shohim! Nëse keni ndonjë pyetje, mos hezitoni të na kontaktoni.',
          regards: 'Me respekt,',
          team: 'Ekipi i WellNest Pilates'
        },
        mk: {
          subject: '🎉 Добредојдовте во WellNest Pilates - Вашата бесплатна сесија ве чека!',
          welcome: 'Добредојдовте во WellNest Pilates!',
          greeting: 'Здраво',
          intro: 'Воодушевени сме да ве поздравиме во семејството WellNest Pilates! 🧘‍♀️',
          offerText: 'Како посебен подарок за добредојде, ви нудиме:',
          offerTitle: '🎁 Ексклузивна понуда:',
          offerDesc: 'Купете пакет од 8 класи и добијте ја <strong>првата класа БЕСПЛАТНО!</strong>',
          redeemTitle: 'Како да искористите:',
          redeemSteps: [
            'Посетете не или контактирајте не за да ја резервирате вашата прва сесија',
            'Изберете датум и време за вашата прва сесија',
            'Комплетирајте ја купувањето на пакетот од 8 часа',
            'Вашата прва сесија е бесплатна!'
          ],
          codeLabel: 'Вашиот код за искористување:',
          codeNote: 'Презентирајте го овој код во студиото',
          whatYouGetTitle: 'Што добивате:',
          benefits: [
            'Месечен пакет со 8 Pilates класи во мала група',
            'Прва класа целосно бесплатна',
            'Експертски инструкции од сертифицирани инструктори',
            'Мала група за персонализирано внимание'
          ],
          locationTitle: '📍 Локација на студиото:',
          closing: 'Нетрпеливо чекаме да ве видиме! Ако имате прашања, слободно контактирајте не.',
          regards: 'Со почит,',
          team: 'Тимот на WellNest Pilates'
        },
        en: {
          subject: '🎉 Welcome to WellNest Pilates - Your Free Session Awaits!',
          welcome: 'Welcome to WellNest Pilates!',
          greeting: 'Hi',
          intro: 'We\'re thrilled to welcome you to the WellNest Pilates family! 🧘‍♀️',
          offerText: 'As a special welcome gift, we\'re offering you:',
          offerTitle: '🎁 Exclusive Offer:',
          offerDesc: 'Purchase an 8-class package and get your <strong>first session FREE!</strong>',
          redeemTitle: 'Here\'s how to redeem:',
          redeemSteps: [
            'Visit our studio or contact us to book your first session',
            'Select your first session date and time',
            'Complete the 8-class package purchase',
            'Your first session is on us!'
          ],
          codeLabel: 'Your Redemption Code:',
          codeNote: 'Present this code at the studio',
          whatYouGetTitle: 'What you\'ll get:',
          benefits: [
            'Monthly package with 8 Pilates classes in small group',
            'First class completely free',
            'Expert instruction from certified instructors',
            'Small group setting for personalized attention'
          ],
          locationTitle: '📍 Studio Location:',
          closing: 'We can\'t wait to see you on the mat! If you have any questions, feel free to reach out.',
          regards: 'Best regards,',
          team: 'The WellNest Pilates Team'
        }
      };

      const t = translations[language];

      // Create welcome email
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.5; 
              color: #333333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
              font-size: 13px;
            }
            .container { 
              max-width: 600px; 
              margin: 40px auto; 
              background: #ffffff;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #9ca571 0%, #8a9463 100%); 
              color: white; 
              padding: 24px 32px; 
              text-align: center;
            }
            .logo {
              max-width: 200px;
              height: auto;
              margin-bottom: 16px;
            }
            .header h1 {
              margin: 0;
              font-size: 20px;
              font-weight: 600;
            }
            .content { 
              background: #ffffff; 
              padding: 32px;
            }
            .greeting {
              font-size: 14px;
              font-weight: 600;
              margin-bottom: 16px;
              color: #333333;
            }
            .intro {
              margin-bottom: 16px;
              color: #333333;
              font-size: 13px;
            }
            .offer-box {
              background: #f8f8f8;
              border-left: 4px solid #9ca571;
              padding: 12px 16px;
              margin: 20px 0;
              font-size: 13px;
            }
            .offer-box strong {
              color: #333333;
            }
            .section-title {
              font-weight: 600;
              margin: 20px 0 10px 0;
              color: #333333;
              font-size: 13px;
            }
            .code-box { 
              background: #ffffff;
              border: 2px dashed #cccccc; 
              padding: 20px; 
              border-radius: 8px; 
              text-align: center; 
              margin: 20px 0;
            }
            .code-label {
              margin: 0 0 8px 0;
              font-size: 12px;
              color: #666666;
            }
            .code { 
              font-size: 24px; 
              font-weight: 700; 
              color: #9ca571; 
              letter-spacing: 3px;
              font-family: 'Courier New', monospace;
            }
            .code-note {
              margin: 8px 0 0 0;
              font-size: 11px;
              color: #666666;
            }
            .location-box {
              background: #f8f8f8;
              border-left: 4px solid #d4a574;
              padding: 12px 16px;
              margin: 20px 0;
              font-size: 13px;
            }
            ul { 
              padding-left: 20px; 
              margin: 10px 0;
            }
            li { 
              margin: 6px 0; 
              color: #333333;
              font-size: 13px;
            }
            p {
              font-size: 13px;
              margin: 12px 0;
            }
            .footer {
              background: #f8f8f8;
              padding: 20px 32px;
              text-align: left;
              border-top: 1px solid #e8e8e8;
            }
            .footer-title {
              color: #d4a574;
              font-weight: 600;
              margin-bottom: 6px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://raw.githubusercontent.com/yourusername/yourrepo/main/wellnest-logo.png" alt="WellNest Pilates" class="logo" />
              <h1>🎉 ${t.welcome}</h1>
            </div>
            
            <div class="content">
              <p class="greeting">${t.greeting} ${waitlistUser.name},</p>
              
              <p class="intro">${t.intro}</p>
              
              <p>${t.offerText}</p>
              
              <div class="offer-box">
                <strong>${t.offerTitle}</strong> ${t.offerDesc}
              </div>

              <p class="section-title">${t.redeemTitle}</p>
              <ul>
                ${t.redeemSteps.map(step => `<li>${step}</li>`).join('')}
              </ul>

              <div class="code-box">
                <p class="code-label">${t.codeLabel}</p>
                <div class="code">${waitlistUser.redemptionCode}</div>
                <p class="code-note">${t.codeNote}</p>
              </div>

              <p class="section-title">${t.whatYouGetTitle}</p>
              <ul>
                ${t.benefits.map(benefit => `<li>${benefit}</li>`).join('')}
              </ul>

              <div class="location-box">
                <p class="footer-title">${t.locationTitle}</p>
                Gjuro Gjakovikj 59, Kumanovo 1300
              </div>

              <p style="margin-top: 24px;">${t.closing}</p>
              
              <p style="margin-top: 20px;">${t.regards}<br><strong>${t.team}</strong></p>
            </div>
            
            <div class="footer">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                <strong style="color: #333333;">WellNest Pilates</strong><br>
                Gjuro Gjakovikj 59, Kumanovo 1300<br>
                <a href="mailto:info@wellnestpilates.com" style="color: #9ca571; text-decoration: none;">info@wellnestpilates.com</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email via Resend
      try {
        console.log(`📧 Attempting to send email to ${normalizedEmail}...`);
        console.log(`📧 Using API key: ${resendApiKey ? 'PRESENT (length: ' + resendApiKey.length + ')' : 'MISSING'}`);
        
        const emailPayload = {
          from: process.env.FROM_EMAIL || 'Wellnest Pilates <info@wellnestpilates.com>',
          to: [normalizedEmail],
          subject: t.subject,
          html: emailHtml,
        };
        
        console.log('📧 Email payload:', JSON.stringify({ 
          from: emailPayload.from, 
          to: emailPayload.to, 
          subject: emailPayload.subject,
          htmlLength: emailHtml.length 
        }));

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailPayload),
        });

        console.log(`📧 Resend API response status: ${emailResponse.status} ${emailResponse.statusText}`);

        if (emailResponse.ok) {
          const responseData = await emailResponse.json();
          console.log(`✅ Resend API success response:`, responseData);
          
          // Update waitlist user status
          waitlistUser.status = 'invited';
          waitlistUser.invitedAt = new Date().toISOString();
          waitlistUser.inviteEmailSent = true;
          await kv.set(waitlistId, waitlistUser);

          results.push({ email, success: true, redemptionCode: waitlistUser.redemptionCode });
          console.log(`✅ Sent invite email to ${normalizedEmail}`);
        } else {
          const errorData = await emailResponse.text();
          console.error(`❌ Resend API error response:`, errorData);
          results.push({ email, success: false, error: `Resend API error (${emailResponse.status}): ${errorData}` });
          console.error(`❌ Failed to send email to ${normalizedEmail}:`, errorData);
        }
      } catch (emailError) {
        console.error(`❌ Email exception for ${normalizedEmail}:`, emailError);
        results.push({ email, success: false, error: emailError.message });
        console.error(`❌ Email error for ${normalizedEmail}:`, emailError);
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
  } catch (error) {
    console.error('Error sending invite emails:', error);
    return c.json({ error: 'Failed to send invite emails', details: error.message }, 500);
  }
});

// Verify redemption code and get waitlist user details - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/waitlist/verify/:code", async (c) => {
  try {
    const code = c.req.param('code');

    if (!code) {
      return c.json({ error: 'No code provided' }, 400);
    }

    const supabase = getSupabase();

    // Find waitlist user by redemption code in Supabase
    const { data: waitlistUser, error } = await supabase
      .from('waitlist_members')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !waitlistUser) {
      return c.json({ error: 'Invalid redemption code' }, 404);
    }

    if (waitlistUser.status === 'redeemed') {
      return c.json({ error: 'Code already redeemed' }, 400);
    }

    return c.json({
      success: true,
      user: {
        name: waitlistUser.name,
        surname: waitlistUser.surname,
        email: waitlistUser.email,
        mobile: waitlistUser.mobile,
        redemptionCode: waitlistUser.code
      }
    });
  } catch (error) {
    console.error('Error verifying redemption code:', error);
    return c.json({ error: 'Failed to verify code', details: (error as Error).message }, 500);
  }
});

// Redeem waitlist offer (purchase 8-pack with free first session) - MIGRATED TO SUPABASE
app.post("/make-server-b87b0c07/waitlist/redeem", async (c) => {
  try {
    const { code, dateKey, timeSlot, instructor = 'Besa' } = await c.req.json();

    if (!code || !dateKey || !timeSlot) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();
    const expiryDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();

    // Find and verify waitlist user in Supabase
    const { data: waitlistUser, error: wlError } = await supabase
      .from('waitlist_members')
      .select('*')
      .eq('code', code)
      .single();

    if (wlError || !waitlistUser) {
      return c.json({ error: 'Invalid redemption code' }, 404);
    }

    if (waitlistUser.status === 'redeemed') {
      return c.json({ error: 'Code already redeemed' }, 400);
    }

    const { name, surname, email, mobile } = waitlistUser;
    const normalizedEmail = email.toLowerCase().trim();

    // Create or update user in Supabase (not KV)
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!existingUser) {
      const { error: userCreateError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          name,
          surname,
          mobile,
          activation_status: 'activated',
          payment_status: 'paid',
          created_at: now,
          updated_at: now,
          blocked: false
        });

      if (userCreateError) {
        console.error('Error creating user:', userCreateError);
        return c.json({ error: 'Failed to create user', details: userCreateError.message }, 500);
      }
      console.log(`User created from waitlist: ${normalizedEmail}`);
    }

    // Create 8-class package in Supabase (not KV)
    const { data: insertedPackage, error: packageError } = await supabase
      .from('user_packages')
      .insert({
        user_email: normalizedEmail,
        package_type: 'package8',
        total_sessions: 8,
        base_sessions: 8,
        bonus_classes: 0,
        remaining_sessions: 7, // First session used
        sessions_booked: [],
        sessions_attended: [],
        package_status: 'active',
        activation_status: 'activated',
        payment_status: 'paid',
        purchase_date: now,
        activation_date: now,
        expiry_date: expiryDate,
        name,
        surname,
        mobile,
        email: normalizedEmail,
        language: 'en',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (packageError || !insertedPackage) {
      console.error('Error creating package:', packageError);
      return c.json({ error: 'Failed to create package', details: packageError?.message }, 500);
    }

    const packageId = insertedPackage.id;

    // Create reservation in Supabase (not KV)
    const dateString = formatDateString(dateKey);
    const endTime = calculateEndTime(timeSlot);

    const { data: insertedReservation, error: resError } = await supabase
      .from('reservations')
      .insert({
        user_email: normalizedEmail,
        package_id: packageId,
        date_key: dateKey,
        time_slot: timeSlot,
        reservation_status: 'confirmed',
        payment_status: 'paid',
        name,
        surname,
        mobile,
        instructor,
        package_type: 'package8',
        service_type: 'group',
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (resError || !insertedReservation) {
      console.error('Error creating reservation:', resError);
      return c.json({ error: 'Failed to create reservation', details: resError?.message }, 500);
    }

    // Update package with first_reservation_id
    await supabase
      .from('user_packages')
      .update({ first_reservation_id: insertedReservation.id })
      .eq('id', packageId);

    // Mark waitlist user as redeemed in Supabase (not KV)
    const { error: updateWlError } = await supabase
      .from('waitlist_members')
      .update({
        status: 'redeemed',
        updated_at: now
      })
      .eq('id', waitlistUser.id);

    if (updateWlError) {
      console.error('Error updating waitlist status:', updateWlError);
    }

    console.log(`✅ Waitlist offer redeemed by ${normalizedEmail} - First session FREE (Supabase)`);

    // Build response in camelCase for frontend
    const packageResponse = {
      id: packageId,
      userId: normalizedEmail,
      packageType: 'package8',
      totalSessions: 8,
      usedSessions: 1,
      remainingSessions: 7,
      purchasedDate: now,
      activatedDate: now,
      expiryDate,
      status: 'active'
    };

    const reservationResponse = {
      id: insertedReservation.id,
      userId: normalizedEmail,
      packageId,
      dateKey,
      date: dateString,
      timeSlot,
      endTime,
      instructor,
      name,
      surname,
      email: normalizedEmail,
      mobile,
      reservationStatus: 'confirmed',
      paymentStatus: 'paid',
      createdAt: now
    };

    return c.json({
      success: true,
      message: 'Welcome package activated! Your first session is FREE.',
      package: packageResponse,
      reservation: reservationResponse,
      user: {
        email: normalizedEmail,
        name,
        surname,
        mobile
      }
    });
  } catch (error) {
    console.error('Error redeeming waitlist offer:', error);
    return c.json({ error: 'Failed to redeem offer', details: (error as Error).message }, 500);
  }
});

// Delete waitlist user (admin only)
// DELETE /admin/waitlist/:email - MIGRATED TO SUPABASE
app.delete("/make-server-b87b0c07/admin/waitlist/:email", async (c) => {
  try {
    // Verify admin session
    const adminAuth = await verifyAdminSession(c);
    if (!adminAuth.valid) {
      return c.json({ error: adminAuth.error }, 401);
    }

    const email = c.req.param('email');
    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    // Check if exists
    const { data: existing } = await supabase
      .from('waitlist_members')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!existing) {
      return c.json({ error: 'User not found in waitlist' }, 404);
    }

    // Delete from waitlist_members
    const { error } = await supabase
      .from('waitlist_members')
      .delete()
      .eq('email', normalizedEmail);

    if (error) {
      console.error('Error deleting waitlist member:', error);
      return c.json({ error: 'Failed to delete waitlist user', details: error.message }, 500);
    }

    console.log(`🗑️ Removed ${normalizedEmail} from waitlist (Supabase)`);

    return c.json({ success: true, message: 'User removed from waitlist' });
  } catch (error) {
    console.error('Error deleting waitlist user:', error);
    return c.json({ error: 'Failed to delete waitlist user', details: error.message }, 500);
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

console.log('🚀 WellNest Pilates Server Starting...');
console.log('📧 Email Configuration:');
const hasResendKey = !!Deno.env.get('RESEND_API_KEY');
console.log(`   - RESEND_API_KEY: ${hasResendKey ? '✅ Configured' : '❌ Missing'}`);
if (hasResendKey) {
  console.log(`   - From address: ${STUDIO_INFO.email}`);
  console.log('   - Emails will be sent to all addresses');
  console.log('   - Note: If domain not verified, verify at resend.com/domains');
}

Deno.serve(app.fetch);