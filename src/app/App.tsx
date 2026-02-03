import { Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { BookingProvider } from '@/contexts/BookingContext';
import { Toaster } from '@/app/components/ui/sonner';
import { AdminRoute } from '@/app/components/AdminRoute';
import { UserRoute } from '@/app/components/UserRoute';
import { LoginPage } from '@/app/components/LoginPage';
import { PasswordSetupPage } from '@/app/components/PasswordSetupPage';
import { HomePage } from '@/app/components/HomePage';
import { BookingSinglePage } from '@/app/components/BookingSinglePage';
import { BookingPackagePage } from '@/app/components/BookingPackagePage';
import { BookingIndividualPage } from '@/app/components/BookingIndividualPage';
import { BookingDuoPage } from '@/app/components/BookingDuoPage';
import { BookingConfirmPage } from '@/app/components/BookingConfirmPage';
import { BookingSuccessPage } from '@/app/components/BookingSuccessPage';

// Main application entry point
export default function App() {
  return (
    <LanguageProvider>
      <BookingProvider>
        <Routes>
          {/* Home */}
          <Route path="/" element={<HomePage />} />

          {/* Booking flow */}
          <Route path="/book/single" element={<BookingSinglePage />} />
          <Route path="/book/package" element={<BookingPackagePage />} />
          <Route path="/book/individual" element={<BookingIndividualPage />} />
          <Route path="/book/duo" element={<BookingDuoPage />} />
          <Route path="/book/confirm" element={<BookingConfirmPage />} />
          <Route path="/book/success" element={<BookingSuccessPage />} />

          {/* Auth & Dashboard */}
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/dashboard" element={<UserRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-password" element={<PasswordSetupPage />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BookingProvider>
      <Toaster position="bottom-right" richColors closeButton />
    </LanguageProvider>
  );
}
