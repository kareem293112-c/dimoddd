import React, { useState } from 'react';
import { Volume2, VolumeX, HelpCircle, X, ShieldAlert } from 'lucide-react';

interface HeaderPanelProps {
  round: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const HeaderPanel: React.FC<HeaderPanelProps> = ({
  round,
  soundEnabled,
  onToggleSound,
}) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="w-full flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-slate-900 shadow-md rounded-t-xl select-none">
      {/* Exit Button */}
      <button 
        onClick={() => {
          if (confirm('هل تريد حقاً الخروج من الغرفة؟')) {
            window.location.reload();
          }
        }}
        className="text-slate-400 hover:text-rose-500 cursor-pointer p-1 rounded-full hover:bg-slate-900 transition-colors"
      >
        <X size={16} />
      </button>

      {/* Round Header */}
      <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/80 px-2.5 py-0.5 rounded-full">
        <span className="text-emerald-400 text-[10px] animate-pulse">●</span>
        <span className="text-slate-300 font-bold text-xs">
          اليوم الجولة <span className="text-amber-400 font-mono font-black">{round}</span>
        </span>
      </div>

      {/* Right Icons: Audio, Help */}
      <div className="flex items-center gap-2">
        {/* Toggle Sound */}
        <button
          onClick={onToggleSound}
          className={`p-1 rounded-full transition-colors cursor-pointer ${
            soundEnabled 
              ? 'text-amber-400 hover:bg-amber-950/20' 
              : 'text-slate-500 hover:bg-slate-900'
          }`}
          title={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Help Button */}
        <button
          onClick={() => setShowHelp(true)}
          className="text-slate-400 hover:text-sky-400 cursor-pointer p-1 rounded-full hover:bg-slate-900 transition-colors"
          title="دليل اللعبة"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-slate-200">
            <div className="flex items-center gap-2 text-amber-500 font-bold text-lg mb-3 border-b border-slate-800 pb-2">
              <ShieldAlert size={20} />
              <span>دليل عجلة الحظ للأطعمة</span>
            </div>

            <div className="text-xs space-y-2.5 leading-relaxed text-right" dir="rtl">
              <p>
                مرحباً بك في لعبة **عجلة الحظ للأطعمة**! عجلة تدور وتحمل 8 خيارات طعام لذيذة بنسب ضرب مختلفة:
              </p>
              <ul className="list-disc list-inside space-y-1 pr-2 text-slate-300">
                <li>🍗 فروج: ضرب <span className="text-amber-400 font-bold">x45</span> (نادر جداً)</li>
                <li>🍣 سوشي: ضرب <span className="text-amber-400 font-bold">x25</span> (نادر)</li>
                <li>🍕 بيتزا: ضرب <span className="text-amber-400 font-bold font-mono">x15</span></li>
                <li>🍔 برجر: ضرب <span className="text-amber-400 font-bold font-mono">x10</span></li>
                <li>🥗 سلطة، 🥩 ستيك، 🍰 كيك، 🍉 بطيخ: ضرب <span className="text-amber-400 font-bold font-mono">x5</span></li>
              </ul>
              <p className="border-t border-slate-800/80 pt-2 text-slate-400 text-[11px]">
                **كيفية اللعب**: اختر قيمة رقاقة الرهان من اليمين (10 أو 100 أو 1000 أو 10000)، ثم اضغط على طائفة الطعام في العجلة لوضع رهانك. عندما ينتهي مؤقت الرهان (25 ثانية)، سيبدأ الدوران ويُحدد الخيار الفائز!
              </p>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              حسناً، فهمت اللعبة!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
