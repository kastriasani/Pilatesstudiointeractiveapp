import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Language } from '@/app/translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type LanguageContextType = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'wellnest_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage or default to 'SQ'
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && ['SQ', 'MK', 'EN'].includes(stored)) {
        return stored as Language;
      }
    }
    return 'SQ';
  });

  // Wrapper that saves to localStorage and optionally to backend
  const setLanguage = useCallback((newLanguage: Language) => {
    setLanguageState(newLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);

    // If user is logged in, also save to backend
    const sessionToken = localStorage.getItem('wellnest_session');
    if (sessionToken) {
      fetch(`https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/user/language`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({ language: newLanguage.toLowerCase() }),
      }).catch(err => console.error('Failed to save language preference:', err));
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export type { Language };