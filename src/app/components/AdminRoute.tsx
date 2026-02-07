import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLogin } from './AdminLogin';
import { AdminPanel } from './AdminPanel';

export function AdminRoute() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing admin session
    const token = localStorage.getItem('adminSessionToken');
    const expiry = localStorage.getItem('adminSessionExpiry');

    if (token && expiry && Date.now() < parseInt(expiry)) {
      setSessionToken(token);
      setIsAuthenticated(true);
    } else {
      // Clear expired session
      localStorage.removeItem('adminSessionToken');
      localStorage.removeItem('adminSessionExpiry');
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogin = (token: string) => {
    // Store session with 24-hour expiry (matches backend sliding window)
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
    localStorage.setItem('adminSessionToken', token);
    localStorage.setItem('adminSessionExpiry', expiryTime.toString());
    setSessionToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminSessionToken');
    localStorage.removeItem('adminSessionExpiry');
    setSessionToken(null);
    setIsAuthenticated(false);
    navigate('/');
  };

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f0eb]">
        <div className="text-[#6b5949]">Loading...</div>
      </div>
    );
  }

  // Show login or panel
  return isAuthenticated && sessionToken ? (
    <AdminPanel onLogout={handleLogout} sessionToken={sessionToken} />
  ) : (
    <AdminLogin onLogin={handleLogin} onBack={() => navigate('/')} />
  );
}
