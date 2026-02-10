import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { BookingData } from '@/contexts/BookingContext';
import { Language, translations } from '../translations';
import { logo } from '../../assets/images';

type SuccessScreenProps = {
  bookingData: BookingData;
  onViewOther: () => void;
  onViewPackages: () => void;
  onBack: () => void;
  language: Language;
};

export function SuccessScreen({ bookingData, onViewOther, onViewPackages, onBack, language }: SuccessScreenProps) {
  const t = translations[language];

  return (
    <div className="h-full overflow-y-auto px-4 py-4 pt-12 flex flex-col items-center justify-center">
      {/* Back Button */}
      <div className="w-full flex justify-start mb-4">
        <button
          onClick={onBack}
          className="hover:bg-[#e8dfd8] rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#6b5949]" />
        </button>
      </div>

      {/* Success Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-[#e8dfd8] rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-[#6b5949]" strokeWidth={2.5} />
        </div>
      </div>

      {/* Success Message */}
      <h1 className="text-xl text-[#3d2f28] text-center mb-3">
        {t.reservationConfirmed}
      </h1>

      <p className="text-sm text-[#6b5949] text-center mb-8 px-4">
        {t.successMessage}
      </p>

      {/* Next Steps */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm w-full">
        <h2 className="text-sm text-[#3d2f28] mb-3">{t.nextSteps}</h2>
        <div className="space-y-2">
          <div className="flex gap-2">
            <span className="text-[#6b5949]">1.</span>
            <p className="text-xs text-[#6b5949] flex-1">{t.step1}</p>
          </div>
          <div className="flex gap-2">
            <span className="text-[#6b5949]">2.</span>
            <p className="text-xs text-[#6b5949] flex-1">{t.step2}</p>
          </div>
          <div className="flex gap-2">
            <span className="text-[#6b5949]">3.</span>
            <p className="text-xs text-[#6b5949] flex-1">{t.step3}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 w-full">
        <button
          onClick={onViewOther}
          className="w-full bg-[#9ca571] text-white py-3 rounded-lg text-sm hover:bg-[#8a9463] transition-colors"
        >
          {t.viewOther}
        </button>
        <button
          onClick={onViewPackages}
          className="w-full bg-white text-[#6b5949] py-3 rounded-lg text-sm hover:bg-[#f5f0ed] transition-colors border border-[#e8dfd8]"
        >
          {t.viewPackages}
        </button>
      </div>

      {/* Logo */}
      <div className="text-center mt-8 mb-4">
        <img src={logo} alt="Logo" className="w-12 h-12 mx-auto mb-2" />
        <p className="text-xs text-[#8b7764]">{t.location}</p>
        <p className="text-xs text-[#8b7764] mt-1">{t.copyright}</p>
      </div>
    </div>
  );
}