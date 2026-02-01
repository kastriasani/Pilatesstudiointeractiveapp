import { useState, useEffect } from 'react';
import { Globe, User, Shield } from 'lucide-react';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { translations } from '@/app/translations';
import { TrainingTypeSelection } from './TrainingTypeSelection';
import { BookingScreen } from './BookingScreen';
import { PackageOverview } from './PackageOverview';
import { IndividualTraining } from './IndividualTraining';
import { DuoTraining } from './DuoTraining';
import { ConfirmationScreen } from './ConfirmationScreen';
import { SuccessScreen } from './SuccessScreen';
import { InstructorProfile } from './InstructorProfile';
import { MemberActivationModal } from './MemberActivationModal';
import { LoginRegisterModal } from './LoginRegisterModal';
import { UserDashboard } from './UserDashboard';
import { AdminLogin } from './AdminLogin';
import { AdminPanel } from './AdminPanel';
import { PasswordSetupPage } from './PasswordSetupPage';
import { LoginPage } from './LoginPage';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type Screen =
  | { type: 'trainingType' }
  | { type: 'booking'; trainingType: 'single' | 'package' | 'individual' }
  | { type: 'package' }
  | { type: 'individual' }
  | { type: 'duo' }
  | { type: 'confirmation'; bookingData: any }
  | { type: 'success'; bookingData: any }
  | { type: 'instructorProfile'; instructorName: string }
  | { type: 'userDashboard'; userEmail: string; userName: string; userSurname: string; userPackage: string | null; sessionsRemaining: number }
  | { type: 'adminLogin' }
  | { type: 'adminPanel' };

export function MainApp() {
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  
  const [screen, setScreen] = useState<Screen>({ type: 'trainingType' });
  const [showMemberActivation, setShowMemberActivation] = useState(false);
  const [showLoginRegister, setShowLoginRegister] = useState(false);
  const [hasCleared, setHasCleared] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [logoClickTimer, setLogoClickTimer] = useState<NodeJS.Timeout | null>(null);
  const [currentRoute, setCurrentRoute] = useState<string>('');
  const [userSession, setUserSession] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(null);

  // Handle hash-based routing for authentication pages
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setCurrentRoute(hash);
    };

    // Initial check
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const session = localStorage.getItem('wellnest_session');
    const user = localStorage.getItem('wellnest_user');
    
    if (session && user) {
      setUserSession(session);
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  // Scroll to top on every screen change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  // Clear all data on first load
  useEffect(() => {
    const clearData = async () => {
      if (hasCleared) return;
      
      try {
        console.log('🧹 Clearing all existing data...');
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/dev/clear-all-data`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        );

        // Get response text first
        const responseText = await response.text();
        
        // Check if response is ok
        if (!response.ok) {
          console.error('❌ Failed to clear data:', response.status, responseText);
          setHasCleared(true); // Prevent infinite retry
          return;
        }

        // Try to parse JSON
        let data;
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          console.log('Response text was:', responseText);
          setHasCleared(true); // Prevent infinite retry
          return;
        }

        console.log('✅ Data cleared successfully:', data);
        setHasCleared(true);
      } catch (error) {
        console.error('Error clearing data:', error);
        setHasCleared(true); // Prevent infinite retry
      }
    };

    clearData();
  }, [hasCleared]);

  const handleSelectTrainingType = (type: 'single' | 'package' | 'individual' | 'duo') => {
    if (type === 'individual') {
      setScreen({ type: 'individual' });
    } else if (type === 'duo') {
      setScreen({ type: 'duo' });
    } else if (type === 'package') {
      setScreen({ type: 'package' });
    } else {
      setScreen({ type: 'booking', trainingType: type });
    }
  };

  const handleBookingSubmit = (bookingData: any) => {
    setScreen({ type: 'confirmation', bookingData });
  };

  const handleConfirmBooking = (bookingData: any) => {
    // Check if user was auto-logged in (session token in localStorage)
    const session = localStorage.getItem('wellnest_session');
    const userStr = localStorage.getItem('wellnest_user');
    
    if (session && userStr) {
      // User was auto-logged in, go to dashboard
      const user = JSON.parse(userStr);
      setUserSession(session);
      setCurrentUser(user);
      console.log('✅ User auto-logged in after booking, redirecting to dashboard');
      
      setScreen({
        type: 'userDashboard',
        userEmail: user.email,
        userName: user.name,
        userSurname: user.surname
      });
    } else {
      // No session, show success screen
      setScreen({ type: 'success', bookingData });
    }
  };

  const handleInstructorClick = (instructorName: string) => {
    setScreen({ type: 'instructorProfile', instructorName });
  };

  const handleBack = () => {
    setScreen({ type: 'trainingType' });
  };

  const handleSuccessBack = () => {
    setScreen({ type: 'trainingType' });
  };

  const handleMemberActivation = () => {
    setShowMemberActivation(true);
  };

  const handleLoginSuccess = (user: any, needsActivation: boolean) => {
    console.log('🎯 handleLoginSuccess called for user:', user.email);
    setShowLoginRegister(false);
    
    // Store session and user data
    const session = localStorage.getItem('wellnest_session');
    console.log('📦 Session from localStorage:', session ? '✅ Found' : '❌ Not found');
    
    if (session) {
      setUserSession(session);
      setCurrentUser(user);
      console.log('✅ User session and current user set');
    } else {
      console.error('❌ No session found in localStorage!');
    }
    
    setScreen({
      type: 'userDashboard',
      userEmail: user.email,
      userName: user.name,
      userSurname: user.surname,
      userPackage: user.package,
      sessionsRemaining: user.sessionsRemaining
    });
  };

  const handleUserDashboardBack = () => {
    setScreen({ type: 'trainingType' });
  };

  const cycleLanguage = () => {
    const languages: Language[] = ['SQ', 'MK', 'EN'];
    const currentIndex = languages.indexOf(language);
    const nextIndex = (currentIndex + 1) % languages.length;
    setLanguage(languages[nextIndex]);
  };

  const getLanguageLabel = () => {
    const labels = { SQ: 'SQ', MK: 'МК', EN: 'EN' };
    return labels[language];
  };

  const handleLogoClick = () => {
    setLogoClickCount(prevCount => prevCount + 1);

    if (logoClickTimer) {
      clearTimeout(logoClickTimer);
    }

    const newTimer = setTimeout(() => {
      if (logoClickCount >= 5) {
        setScreen({ type: 'adminLogin' });
      }
      setLogoClickCount(0);
    }, 1000);

    setLogoClickTimer(newTimer);
  };

  // Render auth pages first (full screen, no container)
  if (currentRoute.includes('#/setup-password') || currentRoute === '#/login') {
    return (
      <>
        {currentRoute.includes('#/setup-password') && (
          <PasswordSetupPage
            onComplete={(session, user) => {
              setUserSession(session);
              setCurrentUser(user);
              window.location.hash = '';
              setScreen({
                type: 'userDashboard',
                userEmail: user.email,
                userName: user.name,
                userSurname: user.surname,
                userPackage: null,
                sessionsRemaining: 0
              });
            }}
          />
        )}

        {currentRoute === '#/login' && !currentRoute.includes('setup-password') && (
          <LoginPage
            onLogin={(session, user) => {
              setUserSession(session);
              setCurrentUser(user);
              window.location.hash = '';
              setScreen({
                type: 'userDashboard',
                userEmail: user.email,
                userName: user.name,
                userSurname: user.surname,
                userPackage: null,
                sessionsRemaining: 0
              });
            }}
            onBack={() => {
              window.location.hash = '';
              setScreen({ type: 'trainingType' });
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="relative w-full max-w-[440px] h-[956px] mx-auto bg-[#f5f0ed] overflow-hidden shadow-2xl">
      {/* Main Content */}
      {screen.type === 'trainingType' && (
        <TrainingTypeSelection 
          onSelectType={handleSelectTrainingType} 
          language={language}
          onLanguageChange={setLanguage}
          onMemberLoginClick={() => setShowLoginRegister(true)}
          onLogoClick={handleLogoClick}
          onAdminClick={() => setScreen({ type: 'adminLogin' })}
        />
      )}

      {screen.type === 'booking' && (
        <BookingScreen
          trainingType={screen.trainingType}
          onBack={handleBack}
          onSubmit={handleBookingSubmit}
          onInstructorClick={handleInstructorClick}
          language={language}
        />
      )}

      {screen.type === 'package' && (
        <PackageOverview
          onBack={handleBack}
          language={language}
        />
      )}

      {screen.type === 'individual' && (
        <IndividualTraining
          onBack={handleBack}
          language={language}
          onLogoClick={handleLogoClick}
        />
      )}

      {screen.type === 'duo' && (
        <DuoTraining
          onBack={handleBack}
          language={language}
          onLogoClick={handleLogoClick}
        />
      )}

      {screen.type === 'confirmation' && (
        <ConfirmationScreen
          bookingData={screen.bookingData}
          onBack={handleBack}
          onConfirm={handleConfirmBooking}
          onPaymentToggle={(value) => {
            setScreen({
              type: 'confirmation',
              bookingData: { ...screen.bookingData, payInStudio: value }
            });
          }}
          onUpdateBookingData={(data) => {
            setScreen({
              type: 'confirmation',
              bookingData: { ...screen.bookingData, ...data }
            });
          }}
          language={language}
        />
      )}

      {screen.type === 'success' && (
        <SuccessScreen
          bookingData={screen.bookingData}
          onBack={handleSuccessBack}
          language={language}
        />
      )}

      {screen.type === 'instructorProfile' && (
        <InstructorProfile instructorName={screen.instructorName} onBack={handleBack} language={language} />
      )}

      {screen.type === 'userDashboard' && (
        <UserDashboard
          sessionToken={userSession || localStorage.getItem('wellnest_session') || ''}
          userEmail={screen.userEmail}
          onBack={() => {
            // Logout and go back to home
            localStorage.removeItem('wellnest_session');
            localStorage.removeItem('wellnest_user');
            setUserSession(null);
            setCurrentUser(null);
            setScreen({ type: 'trainingType' });
          }}
          language={language}
        />
      )}

      {screen.type === 'adminLogin' && (
        <AdminLogin
          onBack={handleBack}
          onLogin={(sessionToken) => {
            setAdminSessionToken(sessionToken);
            setScreen({ type: 'adminPanel' });
          }}
        />
      )}

      {screen.type === 'adminPanel' && (
        <AdminPanel
          onLogout={() => {
            // Clear admin session
            localStorage.removeItem('adminSessionToken');
            setAdminSessionToken(null);
            handleBack();
          }}
          sessionToken={adminSessionToken || undefined}
        />
      )}

      {/* Member Activation Modal (Deprecated - shows info message) */}
      {showMemberActivation && (
        <MemberActivationModal
          onClose={() => setShowMemberActivation(false)}
          language={language}
        />
      )}

      {/* Login/Register Modal */}
      {showLoginRegister && (
        <LoginRegisterModal
          onClose={() => setShowLoginRegister(false)}
          onLoginSuccess={handleLoginSuccess}
          language={language}
        />
      )}
    </div>
  );
}