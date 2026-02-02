import { Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { MainApp } from '@/app/components/MainApp';
import { AdminRoute } from '@/app/components/AdminRoute';
import { UserRoute } from '@/app/components/UserRoute';
import { LoginPage } from '@/app/components/LoginPage';
import { PasswordSetupPage } from '@/app/components/PasswordSetupPage';

// Booking data type definition
export type BookingData = {
  name?: string;
  surname?: string;
  mobile?: string;
  email?: string;
  password?: string;
  date?: string;
  dateKey?: string;
  timeSlot?: string;
  selectedPackage?: string;
  payInStudio?: boolean;
};

// Main application entry point
export default function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/dashboard" element={<UserRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup-password" element={<PasswordSetupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
  );
}
