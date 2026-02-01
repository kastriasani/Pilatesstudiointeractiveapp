import { X, Info } from 'lucide-react';
import { Language, translations } from '../translations';
import { logo } from '../../assets/images';

type MemberActivationModalProps = {
  onClose: () => void;
  language: Language;
};

// DEPRECATED: This modal is no longer needed.
// Activation is now handled by admin directly via the admin panel.
// Users should use the Login button to access their account after admin activation.
export function MemberActivationModal({ onClose, language }: MemberActivationModalProps) {
  const t = translations[language];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e8dfd8]">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="w-8 h-8" />
            <div>
              <h3 className="text-base text-[#3d2f28] font-medium">
                {t.memberActivation?.title || 'Member Access'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f5f0ed] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6b5949]" />
          </button>
        </div>

        {/* Content - Deprecation Notice */}
        <div className="p-6">
          <div className="bg-[#f5f0ed] rounded-lg p-4 mb-4 flex gap-3">
            <Info className="w-5 h-5 text-[#9ca571] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-[#3d2f28] mb-1 font-medium">
                {language === 'sq' ? 'Përdorni Login' : language === 'mk' ? 'Користете Најава' : 'Use Login Instead'}
              </p>
              <p className="text-xs text-[#6b5949] leading-relaxed">
                {language === 'sq'
                  ? 'Aktivizimi tani bëhet automatikisht nga administratori. Pasi të aktivizoheni, klikoni "Kyçu" për të hyrë në llogarinë tuaj.'
                  : language === 'mk'
                  ? 'Активацијата сега се прави автоматски од администраторот. Откако ќе бидете активирани, кликнете "Најава" за да пристапите до вашата сметка.'
                  : 'Activation is now handled automatically by the admin. Once activated, click "Login" to access your account.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-[#9ca571] text-white rounded-lg text-sm font-medium hover:bg-[#8a9461] transition-colors"
          >
            {t.close || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}