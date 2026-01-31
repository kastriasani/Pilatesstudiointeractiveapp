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
  single: { price: 500, label: 'Single Session', description: '500 DEN per session' },
  package8: { price: 3500, label: '8 Classes Package', description: '438 DEN per session' },
  package10: { price: 4200, label: '10 Classes Package', description: '420 DEN per session' },
  package12: { price: 4800, label: '12 Classes Package', description: '400 DEN per session' },
  individual1: { price: 1600, label: '1-on-1 Single Session', description: 'Private training' },
  individual8: { price: 12000, label: '1-on-1 8 Sessions', description: '1500 DEN per session' },
  individual12: { price: 16800, label: '1-on-1 12 Sessions', description: '1400 DEN per session' },
  duo1: { price: 1200, label: 'DUO Single Session', description: 'For 2 people' },
  duo8: { price: 8800, label: 'DUO 8 Sessions', description: '1100 DEN per session' },
  duo12: { price: 12000, label: 'DUO 12 Sessions', description: '1000 DEN per session' },
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
  
  const { label: packageName } = getPackagePriceInfo(packageType);
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const bonusHtml = bonusClasses > 0 ? `<div style="background-color: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0; border: 2px solid #86efac;"><h3 style="margin: 0 0 12px 0; color: #16a34a; font-size: 18px;">🎁 Bonus Redeemed!</h3><p style="margin: 0; color: #15803d; font-size: 15px; font-weight: bold;">+${bonusClasses} Free Class Added!</p><p style="margin: 8px 0 0 0; color: #166534; font-size: 14px;">Your coupon has been successfully redeemed.</p></div>` : '';

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #3d2f28; font-size: 24px;">${t.bookingConfirmation}</h2>
    
    <p style="margin: 0 0 10px 0; color: #6b5949; font-size: 16px; line-height: 1.6;">
      ${t.thankYou}
    </p>
    
    <p style="margin: 0 0 20px 0; color: #8b7764; font-size: 14px;">
      <strong>${t.bookingDate}:</strong> ${currentDate}
    </p>
    
    ${bonusHtml}
    
    <div style="background-color: #e8f5e9; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <h3 style="margin: 0 0 16px 0; color: #2e7d32; font-size: 18px;">📅 ${t.yourSession}</h3>
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
    const userKey = `user:${normalizedEmail}`;
    let user = await kv.get(userKey);
    
    if (!user) {
      user = {
        id: userKey,
        email: normalizedEmail,
        name,
        surname,
        mobile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        blocked: false
      };
      await kv.set(userKey, user);
      console.log(`User created: ${normalizedEmail}`);
    }

    const packageId = `package:${normalizedEmail}:${Date.now()}`;
    let totalSessions = extractSessionCount(packageType);
    let bonusClasses = 0;
    let redeemedCouponCode = null;

    // Handle coupon redemption - Query redemption_codes table directly
    if (couponCode) {
      const normalizedCoupon = couponCode.trim().toUpperCase();
      console.log(`🔍 Checking coupon for redemption: ${normalizedCoupon}`);
      
    // Query redemption_codes table directly (NOT kv_store!)
      const supabase = getSupabase();
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
          
          const { error: updateError } = await supabase
            .from('redemption_codes')
            .update({
              used: true,
              status: 'redeemed',
              used_at: new Date().toISOString(),
              used_by_email: normalizedEmail,
              package_id: packageId
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

    const activationCode = generateActivationCode();
    const codeKey = `activation_code:${activationCode}`;
    const codeExpiry = new Date();
    codeExpiry.setHours(codeExpiry.getHours() + 24);

    let paymentStatus: PaymentStatus = 'unpaid';
    let paymentId: string | null = null;

    if (paymentToken) {
      const payment = await kv.get(`payment:token:${paymentToken}`);
      if (payment && !payment.tokenUsed && payment.userId === normalizedEmail) {
        paymentStatus = 'paid';
        paymentId = payment.id;
        payment.tokenUsed = true;
        payment.packageId = packageId;
        payment.linkedAt = new Date().toISOString();
        await kv.set(payment.id, payment);
      }
    }

    const pkg = {
      id: packageId,
      userId: normalizedEmail,
      packageType,
      totalSessions,
      remainingSessions: totalSessions,
      baseSessions: extractSessionCount(packageType), // Original sessions without bonus
      bonusClasses, // Bonus classes from coupon
      redeemedCouponCode, // The coupon code that was redeemed
      sessionsBooked: [],
      sessionsAttended: [],
      purchaseDate: new Date().toISOString(),
      activationDate: null,
      expiryDate: null,
      packageStatus: 'pending' as PackageStatus,
      activationStatus: 'pending' as ActivationStatus,
      paymentStatus,
      firstReservationId: null,
      paymentId,
      activationCodeId: codeKey,
      name,
      surname,
      mobile,
      email: normalizedEmail,
      language: language || 'en',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await kv.set(packageId, pkg);

    const activationCodeData = {
      id: codeKey,
      code: activationCode,
      email: normalizedEmail,
      packageId,
      reservationId: null,
      status: 'active',
      expiresAt: codeExpiry.toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString()
    };

    await kv.set(codeKey, activationCodeData);
    console.log(`Package created: ${packageId}, activation code: ${activationCode}`);

    return c.json({
      success: true,
      package: pkg,
      packageId,
      activationCode,
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

    const pkg = await kv.get(packageId);
    if (!pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    if (pkg.firstReservationId !== null) {
      return c.json({ error: "First session already booked for this package" }, 400);
    }

    if (pkg.packageStatus !== 'pending') {
      return c.json({ error: "Package is not in pending state" }, 400);
    }

    const serviceType = extractServiceType(pkg.packageType);
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
    const reservationId = `reservation:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullDate = constructFullDate(dateKey, timeSlot);
    const endTime = calculateEndTime(timeSlot);

    const reservation = {
      id: reservationId,
      userId: pkg.email,
      packageId: pkg.id,
      sessionNumber: 1,
      serviceType,
      dateKey,
      date: dateString,
      fullDate,
      timeSlot,
      endTime,
      instructor,
      name: pkg.name,
      surname: pkg.surname,
      email: pkg.email,
      mobile: pkg.mobile,
      partnerName: partnerName || null,
      partnerSurname: partnerSurname || null,
      reservationStatus: 'pending' as ReservationStatus,
      paymentStatus: pkg.paymentStatus,
      seatsOccupied: serviceType === 'duo' ? 2 : (serviceType === 'individual' ? 4 : 1),
      isPrivateSession: serviceType === 'individual',
      isOverbooked: false,
      isFirstSessionOfPackage: true,
      autoConfirmed: false,
      lateCancellation: false,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activatedAt: null,
      attendedAt: null,
      language: pkg.language
    };

    await kv.set(reservationId, reservation);

    pkg.firstReservationId = reservationId;
    pkg.sessionsBooked = [reservationId];
    pkg.updatedAt = new Date().toISOString();
    await kv.set(packageId, pkg);

    try {
      const user = await kv.get(`user:${pkg.email}`);
      
      if (!user || !user.passwordHash) {
        const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
        const tokenKey = `verification_token:${verificationToken}`;
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        const tokenData = {
          id: tokenKey,
          token: verificationToken,
          email: pkg.email,
          expiresAt: tokenExpiry.toISOString(),
          used: false,
          createdAt: new Date().toISOString()
        };
        await kv.set(tokenKey, tokenData);

        if (user) {
          user.verificationToken = verificationToken;
          user.verified = false;
          user.passwordHash = null;
          user.updatedAt = new Date().toISOString();
          await kv.set(`user:${pkg.email}`, user);
        }

        await sendRegistrationEmail(
          pkg.email,
          pkg.name,
          pkg.surname,
          verificationToken,
          pkg.packageType,
          dateString,
          timeSlot,
          endTime,
          appUrl,
          pkg.language,
          pkg.bonusClasses || 0,
          pkg.redeemedCouponCode || ''
        );
        console.log(`Registration email sent to: ${pkg.email} in language: ${pkg.language}`);
      }
    } catch (emailError) {
      console.error('Error sending registration email:', emailError);
    }

    console.log(`First session booked for package ${packageId}: ${reservationId}`);

    return c.json({
      success: true,
      package: pkg,
      reservation,
      message: pkg.isPreviewMode 
        ? "Booking successful! (Preview mode - registration link shown below)" 
        : "Booking successful! Check your email to complete registration.",
      isPreviewMode: pkg.isPreviewMode || false,
      previewRegistrationLink: pkg.previewRegistrationLink || null
    });

  } catch (error) {
    console.error('Error booking first session:', error);
    return c.json({ error: 'Failed to book first session', details: error.message }, 500);
  }
});

app.get("/make-server-b87b0c07/packages", async (c) => {
  try {
    const userId = c.req.query('userId');
    
    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      const allPackages = await kv.getByPrefix(`package:${normalizedEmail}:`);
      return c.json({ success: true, packages: allPackages });
    } else {
      const allPackages = await kv.getByPrefix('package:');
      return c.json({ success: true, packages: allPackages });
    }
  } catch (error) {
    console.error('Error fetching packages:', error);
    return c.json({ error: 'Failed to fetch packages', details: error.message }, 500);
  }
});

app.get("/make-server-b87b0c07/packages/:id", async (c) => {
  try {
    const packageId = c.req.param('id');
    const pkg = await kv.get(packageId);
    
    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    return c.json({ success: true, package: pkg });
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
      language
    } = body;

    if (!userId || !serviceType || !dateKey || !timeSlot || !instructor) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    if (!name || !surname || !email || !mobile) {
      return c.json({ error: "Missing personal information" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const isPackageSession = !!packageId;
    let pkg = null;
    let sessionNumber = null;

    if (isPackageSession) {
      pkg = await kv.get(packageId);
      if (!pkg) {
        return c.json({ error: "Package not found" }, 404);
      }

      if (pkg.userId !== normalizedEmail) {
        return c.json({ error: "Package does not belong to this user" }, 403);
      }

      if (pkg.packageStatus !== 'active') {
        return c.json({ error: "Package is not active" }, 400);
      }

      if (pkg.remainingSessions <= 0) {
        return c.json({ error: "No remaining sessions in package" }, 400);
      }

      if (pkg.expiryDate && new Date(pkg.expiryDate) < new Date()) {
        return c.json({ error: "Package has expired" }, 400);
      }

      sessionNumber = pkg.sessionsBooked.length + 1;
    }

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
        return c.json({ error: "Partner information required for DUO bookings" }, 400);
      }
    } else {
      if (capacity.available < 1) {
        return c.json({ error: "Slot is full" }, 400);
      }
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

    const dateString = formatDateString(dateKey);
    const reservationId = `reservation:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullDate = constructFullDate(dateKey, timeSlot);
    const endTime = calculateEndTime(timeSlot);

    const reservationStatus: ReservationStatus = isPackageSession ? 'confirmed' : 'pending';
    const autoConfirmed = isPackageSession;

    const reservation = {
      id: reservationId,
      userId: normalizedEmail,
      packageId: packageId || null,
      sessionNumber,
      serviceType,
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
      partnerName: partnerName || null,
      partnerSurname: partnerSurname || null,
      reservationStatus,
      paymentStatus: (pkg?.paymentStatus || 'unpaid') as PaymentStatus,
      seatsOccupied: serviceType === 'duo' ? 2 : (serviceType === 'individual' ? 4 : 1),
      isPrivateSession: serviceType === 'individual',
      isOverbooked: false,
      isFirstSessionOfPackage: false,
      autoConfirmed,
      lateCancellation: false,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activatedAt: autoConfirmed ? new Date().toISOString() : null,
      attendedAt: null,
      language: language || 'en'
    };

    await kv.set(reservationId, reservation);

    if (isPackageSession) {
      pkg.remainingSessions--;
      pkg.sessionsBooked.push(reservationId);
      pkg.updatedAt = new Date().toISOString();
      
      if (pkg.remainingSessions === 0) {
        pkg.packageStatus = 'fully_used';
      }
      
      await kv.set(packageId, pkg);
      console.log(`Subsequent package session booked: ${reservationId} (session ${sessionNumber}/${pkg.totalSessions})`);

      return c.json({
        success: true,
        reservation,
        reservationId,
        requiresActivation: false,
        message: "Session booked successfully!",
        package: pkg
      });

    } else {
      const activationCode = generateActivationCode();
      const codeKey = `activation_code:${activationCode}`;
      const codeExpiry = new Date();
      codeExpiry.setHours(codeExpiry.getHours() + 24);

      const activationCodeData = {
        id: codeKey,
        code: activationCode,
        email: normalizedEmail,
        packageId: null,
        reservationId,
        status: 'active',
        expiresAt: codeExpiry.toISOString(),
        usedAt: null,
        createdAt: new Date().toISOString()
      };

      await kv.set(codeKey, activationCodeData);

      const userKey = `user:${normalizedEmail}`;
      let user = await kv.get(userKey);
      
      if (!user) {
        user = {
          id: userKey,
          email: normalizedEmail,
          name,
          surname,
          mobile,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          blocked: false,
          passwordHash: null,
          verified: false
        };
        await kv.set(userKey, user);
        console.log(`User created for single session booking: ${normalizedEmail}`);
      }

      try {
        await sendActivationEmail(
          normalizedEmail,
          name,
          surname,
          activationCode,
          'single',
          {
            date: dateString,
            timeSlot,
            endTime,
            instructor
          }
        );
      } catch (emailError) {
        console.error('Failed to send activation email:', emailError);
      }

      try {
        if (!user || !user.passwordHash) {
          const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
          const tokenKey = `verification_token:${verificationToken}`;
          const tokenExpiry = new Date();
          tokenExpiry.setHours(tokenExpiry.getHours() + 24);

          const tokenData = {
            id: tokenKey,
            token: verificationToken,
            email: normalizedEmail,
            expiresAt: tokenExpiry.toISOString(),
            used: false,
            createdAt: new Date().toISOString()
          };
          await kv.set(tokenKey, tokenData);

          if (user) {
            user.verificationToken = verificationToken;
            user.verified = false;
            user.passwordHash = null;
            user.updatedAt = new Date().toISOString();
            await kv.set(userKey, user);
          }

          const appUrl = c.req.header('origin') || c.req.header('referer') || 'https://app.wellnest-pilates.com';
          
          await sendRegistrationEmail(
            normalizedEmail,
            name,
            surname,
            verificationToken,
            'single',
            dateString,
            timeSlot,
            endTime,
            appUrl,
            language,
            0, // Single sessions don't have coupons
            '' // No redemption code for single sessions
          );
        }
      } catch (emailError) {
        console.error('Error sending registration email:', emailError);
      }

      console.log(`Single session reserved: ${reservationId}, activation code: ${activationCode}`);

      return c.json({
        success: true,
        reservation,
        reservationId,
        requiresActivation: true,
        activationCode,
        message: "Reservation created! Check your email for activation code and registration link."
      });
    }

  } catch (error) {
    console.error('Error creating reservation:', error);
    return c.json({ error: 'Failed to create reservation', details: error.message }, 500);
  }
});

app.get("/make-server-b87b0c07/reservations", async (c) => {
  try {
    const userId = c.req.query('userId');
    const dateKey = c.req.query('dateKey');
    const status = c.req.query('status');
    const paymentStatus = c.req.query('paymentStatus');

    let reservations = await kv.getByPrefix('reservation:');

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      reservations = reservations.filter((r: any) => r.userId === normalizedEmail);
    }

    if (dateKey) {
      reservations = reservations.filter((r: any) => r.dateKey === dateKey);
    }

    if (status) {
      reservations = reservations.filter((r: any) => r.reservationStatus === status);
    }

    if (paymentStatus) {
      reservations = reservations.filter((r: any) => r.paymentStatus === paymentStatus);
    }

    return c.json({ success: true, reservations });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return c.json({ error: 'Failed to fetch reservations', details: error.message }, 500);
  }
});

app.get("/make-server-b87b0c07/reservations/:id", async (c) => {
  try {
    const reservationId = c.req.param('id');
    const reservation = await kv.get(reservationId);
    
    if (!reservation) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    return c.json({ success: true, reservation });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    return c.json({ error: 'Failed to fetch reservation', details: error.message }, 500);
  }
});

app.patch("/make-server-b87b0c07/reservations/:id/status", async (c) => {
  try {
    const reservationId = c.req.param('id');
    const body = await c.req.json();
    const { reservationStatus, paymentStatus, cancelReason } = body;

    const reservation = await kv.get(reservationId);
    if (!reservation) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    if (reservationStatus) {
      reservation.reservationStatus = reservationStatus;
      
      if (reservationStatus === 'confirmed' && !reservation.activatedAt) {
        reservation.activatedAt = new Date().toISOString();
      }
      
      if (reservationStatus === 'attended') {
        reservation.attendedAt = new Date().toISOString();
        
        if (reservation.packageId) {
          const pkg = await kv.get(reservation.packageId);
          if (pkg && !pkg.sessionsAttended.includes(reservationId)) {
            pkg.sessionsAttended.push(reservationId);
            await kv.set(reservation.packageId, pkg);
          }
        }
      }
      
      if (reservationStatus === 'cancelled') {
        reservation.cancelledAt = new Date().toISOString();
        reservation.cancelReason = cancelReason || 'User cancelled';
        
        const sessionTime = new Date(reservation.fullDate);
        const now = new Date();
        const hoursUntilSession = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (hoursUntilSession < 24) {
          reservation.lateCancellation = true;
        }
      }
    }

    if (paymentStatus) {
      reservation.paymentStatus = paymentStatus;
      
      if (reservation.packageId) {
        const pkg = await kv.get(reservation.packageId);
        if (pkg) {
          pkg.paymentStatus = paymentStatus;
          await kv.set(reservation.packageId, pkg);
        }
      }
    }

    reservation.updatedAt = new Date().toISOString();
    await kv.set(reservationId, reservation);

    console.log(`Reservation ${reservationId} status updated`);

    return c.json({
      success: true,
      reservation,
      message: 'Reservation updated successfully'
    });

  } catch (error) {
    console.error('Error updating reservation:', error);
    return c.json({ error: 'Failed to update reservation', details: error.message }, 500);
  }
});

app.delete("/make-server-b87b0c07/reservations/:id", async (c) => {
  try {
    const reservationId = c.req.param('id');
    const reservation = await kv.get(reservationId);
    
    if (!reservation) {
      return c.json({ error: 'Reservation not found' }, 404);
    }

    if (reservation.packageId) {
      const pkg = await kv.get(reservation.packageId);
      if (pkg) {
        pkg.sessionsBooked = pkg.sessionsBooked.filter((id: string) => id !== reservationId);
        pkg.sessionsAttended = pkg.sessionsAttended.filter((id: string) => id !== reservationId);
        
        if (pkg.firstReservationId === reservationId) {
          pkg.firstReservationId = null;
          pkg.packageStatus = 'pending';
        }
        
        pkg.remainingSessions = pkg.totalSessions - pkg.sessionsBooked.length;
        pkg.updatedAt = new Date().toISOString();
        await kv.set(reservation.packageId, pkg);
      }
    }

    await kv.del(reservationId);
    console.log(`Reservation deleted: ${reservationId}`);

    return c.json({
      success: true,
      message: 'Reservation deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting reservation:', error);
    return c.json({ error: 'Failed to delete reservation', details: error.message }, 500);
  }
});

// ============ ACTIVATION ENDPOINTS ============

app.post("/make-server-b87b0c07/activate", async (c) => {
  try {
    const body = await c.req.json();
    const { email, activationCode } = body;

    if (!email || !activationCode) {
      return c.json({ error: "Email and activation code are required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const codeKey = `activation_code:${activationCode}`;
    const activationData = await kv.get(codeKey);

    if (!activationData) {
      return c.json({ error: "Invalid activation code" }, 400);
    }

    if (activationData.email !== normalizedEmail) {
      return c.json({ error: "Activation code does not match email" }, 400);
    }

    if (activationData.status !== 'active') {
      return c.json({ error: "Activation code has already been used" }, 400);
    }

    if (new Date(activationData.expiresAt) < new Date()) {
      return c.json({ error: "Activation code has expired" }, 400);
    }

    const packageId = activationData.packageId;
    const reservationId = activationData.reservationId;
    let activatedItem = null;
    let itemType = '';

    if (packageId) {
      const pkg = await kv.get(packageId);
      if (!pkg) {
        return c.json({ error: "Package not found" }, 404);
      }

      pkg.activationDate = new Date().toISOString();
      pkg.expiryDate = calculateExpiry(pkg.activationDate);
      pkg.packageStatus = 'active';
      pkg.activationStatus = 'activated';
      pkg.updatedAt = new Date().toISOString();
      await kv.set(packageId, pkg);

      if (pkg.firstReservationId) {
        const firstReservation = await kv.get(pkg.firstReservationId);
        if (firstReservation) {
          firstReservation.reservationStatus = 'confirmed';
          firstReservation.activatedAt = new Date().toISOString();
          firstReservation.updatedAt = new Date().toISOString();
          await kv.set(pkg.firstReservationId, firstReservation);
        }
      }

      activatedItem = pkg;
      itemType = 'package';
      console.log(`Package activated: ${packageId}`);

    } else if (reservationId) {
      const reservation = await kv.get(reservationId);
      if (!reservation) {
        return c.json({ error: "Reservation not found" }, 404);
      }

      reservation.reservationStatus = 'confirmed';
      reservation.activatedAt = new Date().toISOString();
      reservation.updatedAt = new Date().toISOString();
      await kv.set(reservationId, reservation);

      activatedItem = reservation;
      itemType = 'reservation';
      console.log(`Reservation activated: ${reservationId}`);
    }

    activationData.status = 'used';
    activationData.usedAt = new Date().toISOString();
    await kv.set(codeKey, activationData);

    return c.json({
      success: true,
      message: `${itemType === 'package' ? 'Package' : 'Reservation'} activated successfully!`,
      itemType,
      item: activatedItem
    });

  } catch (error) {
    console.error('Error activating:', error);
    return c.json({ error: 'Activation failed', details: error.message }, 500);
  }
});

// ============ ADMIN ENDPOINTS ============

// Get all users with aggregated package and payment data - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/admin/users", async (c) => {
  try {
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
app.patch("/make-server-b87b0c07/admin/users/:email/payment", async (c) => {
  try {
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
    
    // Update all packages for this user
    const allPackages = await kv.getByPrefix('package:');
    const userPackages = allPackages.filter((pkg: any) => pkg.userId === normalizedEmail);

    for (const pkg of userPackages) {
      pkg.paymentStatus = paymentStatus;
      pkg.updatedAt = new Date().toISOString();
      await kv.set(pkg.id, pkg);
    }

    // Update all reservations for this user
    const allReservations = await kv.getByPrefix('reservation:');
    const userReservations = allReservations.filter((res: any) => res.userId === normalizedEmail);

    for (const res of userReservations) {
      res.paymentStatus = paymentStatus;
      res.updatedAt = new Date().toISOString();
      await kv.set(res.id, res);
    }

    console.log(`Payment status updated to '${paymentStatus}' for user: ${normalizedEmail}`);

    return c.json({
      success: true,
      message: `Payment status updated to '${paymentStatus}'`,
      packagesUpdated: userPackages.length,
      reservationsUpdated: userReservations.length,
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    return c.json({ error: 'Failed to update payment status', details: error.message }, 500);
  }
});

// Resend activation code email for a user
app.post("/make-server-b87b0c07/admin/resend-activation-code", async (c) => {
  try {
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

app.get("/make-server-b87b0c07/bookings", async (c) => {
  try {
    const userId = c.req.query('userId');
    const dateKey = c.req.query('dateKey');

    let reservations = await kv.getByPrefix('reservation:');

    if (userId) {
      const normalizedEmail = normalizeEmail(userId);
      reservations = reservations.filter((r: any) => r.userId === normalizedEmail);
    }

    if (dateKey) {
      reservations = reservations.filter((r: any) => r.dateKey === dateKey);
    }

    return c.json({ success: true, bookings: reservations });
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
            activationCodeId: null,
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

app.get("/make-server-b87b0c07/admin/calendar", async (c) => {
  try {
    const dateKey = c.req.query('dateKey');
    
    if (!dateKey) {
      return c.json({ error: "dateKey parameter required" }, 400);
    }

    const allReservations = await kv.getByPrefix('reservation:');
    const dateReservations = allReservations.filter((r: any) => r.dateKey === dateKey);
    
    const calendarData = await Promise.all(TIME_SLOTS.map(async (timeSlot) => {
      const slotReservations = dateReservations.filter((r: any) => 
        r.timeSlot === timeSlot &&
        (r.reservationStatus === 'confirmed' || r.reservationStatus === 'attended')
      );
      
      const capacity = await calculateSlotCapacity(dateKey, timeSlot);
      
      return {
        timeSlot,
        endTime: calculateEndTime(timeSlot),
        capacity: capacity.available,
        maxCapacity: 4,
        isBlocked: capacity.isBlocked,
        isPrivate: capacity.isPrivate,
        reservations: slotReservations,
        count: slotReservations.length
      };
    }));

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
    const userKey = `user:${normalizedEmail}`;
    const user = await kv.get(userKey);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.passwordHash) {
      return c.json({ error: "Password already set. Please log in instead." }, 400);
    }

    const passwordHash = await hashPassword(password);

    user.passwordHash = passwordHash;
    user.verified = true;
    user.verificationToken = null;
    user.updatedAt = new Date().toISOString();
    await kv.set(userKey, user);

    tokenData.used = true;
    tokenData.usedAt = new Date().toISOString();
    await kv.set(tokenKey, tokenData);

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

    console.log(`Password set for user: ${normalizedEmail}`);

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
    return c.json({ error: 'Failed to set up password', details: error.message }, 500);
  }
});

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
    const userKey = `user:${normalizedEmail}`;
    const existingUser = await kv.get(userKey);
    
    if (existingUser && existingUser.passwordHash) {
      return c.json({ 
        error: 'An account with this email already exists. Please use the login form instead.',
        errorType: 'USER_EXISTS'
      }, 400);
    }
    
    const passwordHash = await hashPassword(password);
    
    const user = {
      id: userKey,
      email: normalizedEmail,
      name: name || '',
      surname: surname || '',
      mobile: mobile || '',
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocked: false,
      verified: true
    };
    
    await kv.set(userKey, user);
    console.log(`User account created: ${normalizedEmail}`);
    
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
    return c.json({ error: 'Registration failed', details: error.message }, 500);
  }
});

app.post("/make-server-b87b0c07/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const userKey = `user:${normalizedEmail}`;
    const user = await kv.get(userKey);

    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    if (user.blocked) {
      return c.json({ error: "This account has been blocked. Please contact support." }, 403);
    }

    if (!user.passwordHash) {
      return c.json({ error: "Please complete your registration first. Check your email for the registration link." }, 401);
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return c.json({ error: "Invalid email or password" }, 401);
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
    return c.json({ error: 'Login failed', details: error.message }, 500);
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
    return c.json({ error: 'Logout failed', details: error.message }, 500);
  }
});

// ============ USER ENDPOINTS ============

app.get("/make-server-b87b0c07/user/packages", async (c) => {
  try {
    const sessionToken = c.req.header('X-Session-Token');

    if (!sessionToken) {
      return c.json({ error: "No session token provided" }, 401);
    }

    const sessionKey = `session:${sessionToken}`;
    const session = await kv.get(sessionKey);

    if (!session || new Date(session.expiresAt) < new Date()) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }

    const allPackages = await kv.getByPrefix(`package:${session.email}:`);
    const allReservations = await kv.getByPrefix('reservation:');
    const userReservations = allReservations.filter((r: any) => r.userId === session.email);

    return c.json({
      success: true,
      packages: allPackages,
      reservations: userReservations
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
app.post("/make-server-b87b0c07/waitlist", async (c) => {
  try {
    const { name, surname, mobile, email } = await c.req.json();
    
    if (!name || !surname || !mobile || !email) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const waitlistId = `waitlist:${normalizedEmail}`;
    
    // Check if already in waitlist
    const existing = await kv.get(waitlistId);
    if (existing) {
      return c.json({ error: 'Already in waitlist' }, 400);
    }

    // Generate unique redemption code
    const redemptionCode = `WL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    const waitlistUser = {
      id: waitlistId,
      name,
      surname,
      mobile,
      email: normalizedEmail,
      redemptionCode,
      status: 'pending', // pending, invited, redeemed
      addedAt: new Date().toISOString(),
      invitedAt: null,
      redeemedAt: null,
      inviteEmailSent: false
    };

    await kv.set(waitlistId, waitlistUser);
    console.log(`✅ Added user to waitlist: ${normalizedEmail}`);

    return c.json({ success: true, waitlistUser });
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    return c.json({ error: 'Failed to add to waitlist', details: error.message }, 500);
  }
});

// Get all waitlist users (admin only) - MIGRATED TO SUPABASE
app.get("/make-server-b87b0c07/admin/waitlist", async (c) => {
  try {
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

// Verify redemption code and get waitlist user details
app.get("/make-server-b87b0c07/waitlist/verify/:code", async (c) => {
  try {
    const code = c.req.param('code');
    
    if (!code) {
      return c.json({ error: 'No code provided' }, 400);
    }

    // Find waitlist user by redemption code
    const allWaitlistUsers = await kv.getByPrefix('waitlist:');
    const waitlistUser = allWaitlistUsers.find(u => u.redemptionCode === code);

    if (!waitlistUser) {
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
        redemptionCode: waitlistUser.redemptionCode
      }
    });
  } catch (error) {
    console.error('Error verifying redemption code:', error);
    return c.json({ error: 'Failed to verify code', details: error.message }, 500);
  }
});

// Redeem waitlist offer (purchase 8-pack with free first session)
app.post("/make-server-b87b0c07/waitlist/redeem", async (c) => {
  try {
    const { code, dateKey, timeSlot, instructor = 'Besa' } = await c.req.json();

    if (!code || !dateKey || !timeSlot) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Find and verify waitlist user
    const allWaitlistUsers = await kv.getByPrefix('waitlist:');
    const waitlistUser = allWaitlistUsers.find(u => u.redemptionCode === code);

    if (!waitlistUser) {
      return c.json({ error: 'Invalid redemption code' }, 404);
    }

    if (waitlistUser.status === 'redeemed') {
      return c.json({ error: 'Code already redeemed' }, 400);
    }

    const { name, surname, email, mobile } = waitlistUser;
    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `user:${normalizedEmail}`;

    // Create or update user account
    let user = await kv.get(userKey);
    
    if (!user) {
      user = {
        id: userKey,
        email: normalizedEmail,
        name,
        surname,
        mobile,
        role: 'user',
        status: 'active',
        hasPassword: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isWaitlistUser: true,
        waitlistRedemptionCode: code
      };
      await kv.set(userKey, user);
    }

    // Create 8-class package
    const packageId = `package:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const package8 = {
      id: packageId,
      userId: normalizedEmail,
      packageType: 'package8',
      totalSessions: 8,
      usedSessions: 0,
      remainingSessions: 8,
      purchasedDate: new Date().toISOString(),
      activatedDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
      isWaitlistPackage: true,
      waitlistRedemptionCode: code,
      status: 'active'
    };
    await kv.set(packageId, package8);

    // Book first session (FREE)
    const dateString = formatDateString(dateKey);
    const reservationId = `reservation:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullDate = constructFullDate(dateKey, timeSlot);
    const endTime = calculateEndTime(timeSlot);

    const reservation = {
      id: reservationId,
      userId: normalizedEmail,
      packageId,
      sessionNumber: 1,
      serviceType: 'package8' as ServiceType,
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
      paymentStatus: 'paid' as PaymentStatus, // First session is FREE
      seatsOccupied: 1,
      isPrivateSession: false,
      isOverbooked: false,
      isFirstSessionOfPackage: true,
      isFreeWaitlistSession: true,
      waitlistRedemptionCode: code,
      autoConfirmed: true,
      lateCancellation: false,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      attendedAt: null,
      language: 'en'
    };

    await kv.set(reservationId, reservation);

    // Update package to reflect first session booked
    package8.usedSessions = 1;
    package8.remainingSessions = 7;
    await kv.set(packageId, package8);

    // Mark waitlist user as redeemed
    waitlistUser.status = 'redeemed';
    waitlistUser.redeemedAt = new Date().toISOString();
    waitlistUser.packageId = packageId;
    await kv.set(waitlistUser.id, waitlistUser);

    console.log(`✅ Waitlist offer redeemed by ${normalizedEmail} - First session FREE`);

    return c.json({
      success: true,
      message: 'Welcome package activated! Your first session is FREE.',
      package: package8,
      reservation,
      user: {
        email: normalizedEmail,
        name,
        surname,
        mobile
      }
    });
  } catch (error) {
    console.error('Error redeeming waitlist offer:', error);
    return c.json({ error: 'Failed to redeem offer', details: error.message }, 500);
  }
});

// Delete waitlist user (admin only)
app.delete("/make-server-b87b0c07/admin/waitlist/:email", async (c) => {
  try {
    const email = c.req.param('email');
    const normalizedEmail = email.toLowerCase().trim();
    const waitlistId = `waitlist:${normalizedEmail}`;

    const waitlistUser = await kv.get(waitlistId);
    
    if (!waitlistUser) {
      return c.json({ error: 'User not found in waitlist' }, 404);
    }

    await kv.del(waitlistId);
    console.log(`🗑️ Removed ${normalizedEmail} from waitlist`);

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