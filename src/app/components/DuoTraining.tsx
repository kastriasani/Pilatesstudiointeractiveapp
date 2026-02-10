import { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CheckCircle, X } from 'lucide-react';
import { Language, translations } from '@/app/translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { logo } from '../../assets/images';

type DuoTrainingProps = {
  onBack: () => void;
  language: Language;
  onLogoClick: () => void;
};

type FormData = {
  name: string;
  surname: string;
  mobile: string;
  email: string;
  payInStudio: boolean;
};

export function DuoTraining({ onBack, language, onLogoClick }: DuoTrainingProps) {
  const t = translations[language];
  const [expandedPackage, setExpandedPackage] = useState<'1class' | '8classes' | '12classes' | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    surname: '',
    mobile: '',
    email: '',
    payInStudio: true,
  });

  const packages = [
    {
      type: '1class' as const,
      sessions: 1,
      label: t.individual1Class,
      description: t.duo1ClassDesc || 'One duo class',
      price: 2100,
      perClass: 2100,
      savings: 0,
      isRecommended: false,
    },
    {
      type: '8classes' as const,
      sessions: 8,
      label: t.individual8Classes,
      description: t.individual8ClassDesc,
      price: 13400,
      perClass: 1675,
      savings: 3400,
      isRecommended: true,
    },
    {
      type: '12classes' as const,
      sessions: 12,
      label: t.individual12Classes,
      description: t.individual12ClassDesc,
      price: 18400,
      perClass: 1533,
      savings: 6800,
      isRecommended: false,
    },
  ];

  const handlePackageClick = (packageType: '1class' | '8classes' | '12classes') => {
    if (expandedPackage === packageType) {
      setExpandedPackage(null);
    } else {
      setExpandedPackage(packageType);
    }
  };

  const handleSubmit = async (packageType: '1class' | '8classes' | '12classes') => {
    if (!formData.name || !formData.surname || !formData.mobile || !formData.email) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const packageTypeMap: Record<string, string> = {
        '1class': 'duo1',
        '8classes': 'duo8',
        '12classes': 'duo12',
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/packages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId: formData.email,
            packageType: packageTypeMap[packageType],
            name: formData.name,
            surname: formData.surname,
            mobile: formData.mobile,
            email: formData.email,
            language,
          }),
        }
      );

      const data = await response.json();

      if (data.success || data.packageId) {
        // Show success popup
        setShowSuccessPopup(true);
        setExpandedPackage(null);
        
        // Reset form
        setFormData({
          name: '',
          surname: '',
          mobile: '',
          email: '',
          payInStudio: true,
        });

        // Auto-close popup after 3 seconds
        setTimeout(() => {
          setShowSuccessPopup(false);
        }, 3000);
      } else {
        alert('Booking failed. Please try again.');
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-4 pt-12 relative bg-gradient-to-br from-[#faf9f7] via-[#f5f3f0] to-[#f0ede8]">
      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-5">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-7 max-w-sm w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 animate-scale-in">
            <div className="flex justify-between items-start mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="text-[#8b7764] hover:text-[#6b5949] transition-all hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-xl font-semibold text-[#3d2f28] mb-2 tracking-tight">{t.bookingConfirmed || 'Booking Confirmed!'}</h2>
            <p className="text-sm text-[#6b5949] mb-5 leading-relaxed">
              {t.bookingConfirmedDesc || 'Your booking has been successfully registered. You can log in to your account to manage your bookings.'}
            </p>
            <button
              onClick={() => setShowSuccessPopup(false)}
              className="w-full bg-gradient-to-r from-[#9ca571] to-[#8a9463] text-white py-3.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-[#9ca571]/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {t.close || 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="p-2.5 hover:bg-white/80 backdrop-blur-sm rounded-xl transition-all hover:shadow-md hover:scale-105 mr-3 border border-transparent hover:border-[#9ca571]/20"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[#3d2f28] tracking-tight">{t.duoTitle}</h1>
          <p className="text-[11px] text-[#8b7764] mt-1 font-medium tracking-wide">{t.choosePackage}</p>
        </div>
      </div>

      {/* Package Cards */}
      <div className="space-y-5 mb-6">
        {packages.map((pkg) => (
          <div
            key={pkg.type}
            className={`w-full rounded-3xl transition-all backdrop-blur-sm ${
              pkg.isRecommended 
                ? 'bg-gradient-to-br from-white via-white to-[#f8f9f4] border-2 border-[#b5a582]/40 shadow-[0_8px_30px_rgb(181,165,130,0.15)] hover:shadow-[0_12px_40px_rgb(181,165,130,0.25)]' 
                : 'bg-white/90 border border-[#e8e6e3] shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
            } hover:scale-[1.01] duration-300`}
          >
            {/* Package Header - Clickable */}
            <button
              onClick={() => handlePackageClick(pkg.type)}
              className="w-full p-5 text-left"
            >
              {/* Recommended Badge */}
              {pkg.isRecommended && (
                <div className="bg-gradient-to-r from-[#b5a582] to-[#a89876] text-white text-[10px] px-3 py-1.5 rounded-full inline-block mb-4 font-semibold uppercase tracking-wider shadow-md shadow-[#b5a582]/30">
                  {t.recommended}
                </div>
              )}

              {/* Sessions */}
              <div className={pkg.isRecommended ? 'mb-4' : 'mb-4 mt-7'}>
                <div className="text-[28px] font-bold text-[#3d2f28] mb-1.5 tracking-tight">{pkg.label}</div>
                <p className="text-sm text-[#9ca571] font-semibold tracking-wide">{pkg.description}</p>
              </div>

              {/* Pricing */}
              <div className="mb-3">
                <div className="text-[32px] font-bold text-[#3d2f28] tracking-tight">
                  {pkg.price} <span className="text-base font-semibold text-[#6b5949]">DEN</span>
                </div>
              </div>

              {/* Package Description */}
              {pkg.type !== '1class' && (
                <div className="mb-4">
                  <p className="text-xs text-[#8b7764] leading-relaxed">
                    {pkg.type === '8classes' && (t.duo8Detail || '8 training packages for two people (twice a week). For 35 days.')}
                    {pkg.type === '12classes' && (t.duo12Detail || '12 training packages for two people (three times a week). For 35 days.')}
                  </p>
                </div>
              )}

              {/* Key Purchase Context */}
              <div className="mb-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.classDuration || '50 min'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.validityPeriod || 'Valid 35 days'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#6b5949]">
                  <div className="w-1 h-1 bg-[#9ca571] rounded-full"></div>
                  <span>{t.privateStudio || 'Private studio included'}</span>
                </div>
              </div>

              {/* Toggle Button */}
              <div className={`flex items-center justify-center gap-2 text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-md ${
                pkg.isRecommended 
                  ? 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] hover:shadow-lg hover:shadow-[#9ca571]/30 hover:scale-[1.02]' 
                  : 'bg-gradient-to-r from-[#9ca571] to-[#8a9463] hover:shadow-lg hover:shadow-[#9ca571]/30 hover:scale-[1.02]'
              } active:scale-[0.98]`}>
                <span>{expandedPackage === pkg.type ? t.hideDetails || 'Hide Details' : t.selectPackage}</span>
                {expandedPackage === pkg.type ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {/* Expandable Form Section */}
            {expandedPackage === pkg.type && (
              <div className="px-5 pb-5 space-y-3.5 border-t border-[#e8e6e3]/50 pt-5 animate-slide-down bg-gradient-to-b from-transparent to-[#faf9f7]/30">
                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.name}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t.namePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.surname}</label>
                  <input
                    type="text"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    placeholder={t.surnamePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.mobile}</label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder={t.mobilePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#6b5949] mb-1.5 tracking-wide">{t.email}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder={t.emailPlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] text-sm text-[#3d2f28] placeholder:text-[#8b7764]/60 focus:outline-none focus:ring-2 focus:ring-[#9ca571]/50 focus:bg-white transition-all shadow-inner border border-[#e8e6e3]/50"
                  />
                </div>

                <div className="flex items-center gap-3 bg-gradient-to-br from-[#f5f0ed] to-[#f0ebe6] rounded-xl p-3.5 border border-[#e8e6e3]/50 shadow-inner">
                  <input
                    type="checkbox"
                    id={`payInStudio-${pkg.type}`}
                    checked={formData.payInStudio}
                    disabled
                    className="w-4.5 h-4.5 accent-[#9ca571] rounded opacity-100"
                  />
                  <label htmlFor={`payInStudio-${pkg.type}`} className="text-xs text-[#6b5949] font-semibold flex-1">
                    {t.payInStudio}
                  </label>
                </div>

                <button
                  onClick={() => handleSubmit(pkg.type)}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#6b5949] to-[#5a4838] text-white py-3.5 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[#6b5949]/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSubmitting ? (t.processing || 'Processing...') : (t.confirmBooking || 'Confirm Booking')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Benefits Section */}
      <div className="bg-gradient-to-br from-white via-white to-[#f8f9f4] rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] mb-6 border border-[#e8e6e3]/50">
        <h2 className="text-sm font-semibold text-[#3d2f28] mb-4 tracking-tight">{t.whatIsDuo}</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit1}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit2}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit3}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#9ca571] to-[#8a9463] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs text-[#6b5949] leading-relaxed font-medium">{t.duoBenefit4}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-white to-[#f8f9f4] shadow-md flex items-center justify-center border border-[#e8e6e3]/50 cursor-pointer hover:scale-105 transition-transform">
          <img 
            src={logo} 
            alt="Logo" 
            className="w-8 h-8" 
            onClick={onLogoClick}
          />
        </div>
        <p className="text-[10px] text-[#8b7764] font-medium tracking-wide">{t.location}</p>
        <p className="text-[10px] text-[#8b7764] mt-1 opacity-70 tracking-wide">{t.copyright}</p>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slide-down {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 1000px;
          }
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }

        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}