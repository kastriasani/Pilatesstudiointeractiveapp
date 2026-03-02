import { useState } from 'react';
import { Loader } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type DevToolsProps = {
  onClose: () => void;
};

export function DevTools({ onClose }: DevToolsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const generateMockData = async () => {
    setIsGenerating(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/dev/generate-mock-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Get response text first
      const responseText = await response.text();

      if (!response.ok) {
        console.error('❌ Failed to generate data:', response.status, responseText);
        setMessage(`❌ Error ${response.status}: ${responseText.substring(0, 100)}`);
        return;
      }

      // Try to parse JSON
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.log('Response was:', responseText);
        setMessage(`❌ Parse error: ${responseText.substring(0, 100)}`);
        return;
      }

      if (data.success && data.stats) {
        setMessage(`✅ Successfully generated ${data.stats.users || 0} users and ${data.stats.bookings || 0} bookings!\n📅 Date Range: ${data.stats.dateRange || 'N/A'} (${data.stats.weekdays || 0} weekdays)`);
      } else {
        setMessage(`❌ Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const checkUsers = async () => {
    setIsChecking(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/debug/check-users`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(`❌ Error ${response.status}: ${data.error || 'Unknown error'}`);
        return;
      }

      if (data.success) {
        if (data.hasUsers) {
          const userList = data.users.map((u: any) => 
            `• ${u.name} ${u.surname || ''} (${u.email}) ${u.hasPassword ? '✓' : '⚠️ no password'}`
          ).join('\\n');
          setMessage(`✅ YES - ${data.userCount} user${data.userCount !== 1 ? 's' : ''} registered:\\n${userList}`);
        } else {
          setMessage('❌ NO - No users registered in the database');
        }
      } else {
        setMessage(`❌ Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsChecking(false);
    }
  };

  const clearAllData = async () => {
    if (!confirm('⚠️ This will delete ALL users and bookings. Are you sure?')) {
      return;
    }

    setIsClearing(true);
    setMessage('');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/dev/clear-all-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Get response text first
      const responseText = await response.text();

      if (!response.ok) {
        console.error('❌ Failed to clear data:', response.status, responseText);
        setMessage(`❌ Error ${response.status}: ${responseText.substring(0, 100)}`);
        return;
      }

      // Try to parse JSON
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.log('Response was:', responseText);
        setMessage(`❌ Parse error: ${responseText.substring(0, 100)}`);
        return;
      }

      if (data.success && data.cleared) {
        const { cleared } = data;
        const totalCleared = cleared.total || 0;
        const details = [
          cleared.reservations && `${cleared.reservations} reservations`,
          cleared.packages && `${cleared.packages} packages`,
          cleared.activationCodes && `${cleared.activationCodes} codes`,
          cleared.orphanedPackages && `${cleared.orphanedPackages} orphaned`,
          cleared.bookings && `${cleared.bookings} legacy bookings`,
          cleared.members && `${cleared.members} legacy members`
        ].filter(Boolean).join(', ');
        
        setMessage(`✅ Successfully cleared ${totalCleared} items!\n${details}`);
      } else {
        setMessage(`❌ Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-[#3d2f28] mb-4">Developer Tools</h2>
        
        <div className="space-y-4">
          <div className="bg-[#f5f0ed] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[#3d2f28] mb-2">Check Users</h3>
            <p className="text-xs text-[#8b7764] mb-3">
              Check if there are any users currently registered in the database.
            </p>
            <button
              onClick={checkUsers}
              disabled={isChecking}
              className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isChecking ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                'Check if Users Exist'
              )}
            </button>
          </div>

          <div className="bg-[#f5f0ed] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[#3d2f28] mb-2">Generate Mock Data</h3>
            <p className="text-xs text-[#8b7764] mb-3">
              Creates 100 mock users with realistic names and 200-400 bookings between January 23rd and February 28th, 2026 (weekdays only).
            </p>
            <button
              onClick={generateMockData}
              disabled={isGenerating}
              className="w-full bg-[#9ca571] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#8a9463] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Mock Data'
              )}
            </button>
          </div>

          <div className="bg-[#f5f0ed] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[#3d2f28] mb-2">Clear All Data</h3>
            <p className="text-xs text-[#8b7764] mb-3">
              Deletes all reservations, packages, activation codes, and legacy bookings from the database.
            </p>
            <button
              onClick={clearAllData}
              disabled={isClearing}
              className="w-full bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isClearing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                'Clear All Data'
              )}
            </button>
          </div>

          {message && (
            <div className="bg-white border border-[#e8dfd8] rounded-lg p-3">
              <p className="text-sm text-[#3d2f28] whitespace-pre-line">{message}</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-[#e8dfd8] text-[#3d2f28] py-2.5 rounded-xl text-sm font-medium hover:bg-[#d8cfc8] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
