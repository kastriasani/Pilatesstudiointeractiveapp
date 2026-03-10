// Email validation with domain whitelist + valid TLD fallback
// Prevents typos like yahoo.vom, gmial.com, etc.

const WHITELISTED_DOMAINS = new Set([
  // Major providers
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'proton.me', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'gmx.com', 'gmx.net',
  // Regional variants
  'yahoo.co.uk', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'yahoo.es',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es',
  'outlook.com', 'outlook.de', 'outlook.fr', 'outlook.it',
  'live.co.uk', 'live.de', 'live.fr', 'live.nl',
  't-online.de', 'web.de', 'freenet.de', 'arcor.de',
  // Balkan/regional
  'yahoo.mk', 'hotmail.mk', 'outlook.mk',
  'yahoo.al', 'hotmail.al',
  'yahoo.rs', 'hotmail.rs',
  'yahoo.bg', 'hotmail.bg',
  'yahoo.hr', 'hotmail.hr',
  'yahoo.gr', 'hotmail.gr',
]);

const VALID_TLDS = new Set([
  // Generic
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'io', 'co', 'me', 'info', 'biz', 'name', 'pro', 'mobi', 'tel',
  'app', 'dev', 'tech', 'online', 'site', 'store', 'shop', 'cloud',
  // Europe
  'uk', 'de', 'fr', 'it', 'es', 'nl', 'be', 'at', 'ch', 'se', 'no',
  'dk', 'fi', 'pt', 'ie', 'pl', 'cz', 'sk', 'hu', 'ro', 'bg',
  'hr', 'si', 'ba', 'rs', 'me', 'mk', 'al', 'gr', 'tr', 'cy',
  'lt', 'lv', 'ee', 'ua', 'ru', 'by',
  'eu',
  // Americas & others
  'us', 'ca', 'mx', 'br', 'ar', 'cl', 'co',
  'au', 'nz', 'jp', 'kr', 'cn', 'in', 'sg', 'hk', 'tw',
  'za', 'ng', 'ke', 'eg', 'il', 'ae', 'sa',
]);

// Common typos mapped to corrections
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail typos
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  // Yahoo typos
  'yahoo.vom': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.cmo': 'yahoo.com',
  'yahoo.ocm': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'uahoo.com': 'yahoo.com',
  'tahoo.com': 'yahoo.com',
  'yaboo.com': 'yahoo.com',
  // Hotmail typos
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.vom': 'hotmail.com',
  'hotmail.cmo': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmale.com': 'hotmail.com',
  // Outlook typos
  'outloo.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.vom': 'outlook.com',
  'outlook.cmo': 'outlook.com',
  'outloock.com': 'outlook.com',
  // Live typos
  'live.con': 'live.com',
  'live.vom': 'live.com',
  // iCloud typos
  'icloud.con': 'icloud.com',
  'icloud.vom': 'icloud.com',
  'iclould.com': 'icloud.com',
  // Protonmail typos
  'protonmail.con': 'protonmail.com',
  'protonmail.vom': 'protonmail.com',
  // Generic TLD typos (applied to any domain)
};

const TLD_TYPOS: Record<string, string> = {
  'vom': 'com',
  'con': 'com',
  'cmo': 'com',
  'ocm': 'com',
  'coom': 'com',
  'comm': 'com',
  'xom': 'com',
  'dom': 'com',
  'nett': 'net',
  'ner': 'net',
  'orgg': 'org',
  'rog': 'org',
  'ogr': 'org',
};

export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

export function validateEmail(email: string): EmailValidationResult {
  const trimmed = email.trim().toLowerCase();

  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, reason: 'invalid_format' };
  }

  const [, domain] = trimmed.split('@');
  if (!domain) {
    return { valid: false, reason: 'invalid_format' };
  }

  // Layer 1: Whitelisted domains — auto-accept
  if (WHITELISTED_DOMAINS.has(domain)) {
    return { valid: true };
  }

  // Layer 2: Check for known domain typos
  if (DOMAIN_TYPOS[domain]) {
    const corrected = trimmed.replace(`@${domain}`, `@${DOMAIN_TYPOS[domain]}`);
    return { valid: false, reason: 'typo', suggestion: corrected };
  }

  // Layer 3: Check TLD validity
  const tld = domain.split('.').pop();
  if (!tld) {
    return { valid: false, reason: 'invalid_format' };
  }

  // Check for TLD typos
  if (TLD_TYPOS[tld]) {
    const correctedDomain = domain.replace(new RegExp(`\\.${tld}$`), `.${TLD_TYPOS[tld]}`);
    const corrected = trimmed.replace(`@${domain}`, `@${correctedDomain}`);
    return { valid: false, reason: 'typo', suggestion: corrected };
  }

  // Accept if TLD is in the valid list
  if (VALID_TLDS.has(tld)) {
    return { valid: true };
  }

  // Also accept compound TLDs like co.uk, com.mk
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const compoundTld = parts.slice(-2).join('.');
    const lastTld = parts[parts.length - 1];
    if (VALID_TLDS.has(lastTld)) {
      return { valid: true };
    }
  }

  // TLD not recognized
  return { valid: false, reason: 'invalid_domain' };
}
