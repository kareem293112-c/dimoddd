import React, { useState } from 'react';
import { Plus, Clock, FileText, ChevronRight, Coins, RefreshCw } from 'lucide-react';
import { User, GameLog, FOODS } from '../types.js';

interface FooterPanelProps {
  currentUser: User | null;
  onAddBalance: () => void;
  topPlayer: User | null;
  dailyProfit: number;
}

export const FooterPanel: React.FC<FooterPanelProps> = ({
  currentUser,
  onAddBalance,
  topPlayer,
  dailyProfit,
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.error('Error fetching logs', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLogs = () => {
    setShowLogs(true);
    fetchLogs();
  };

  return (
    <div className="w-full bg-slate-950/95 border-t border-slate-900 px-3 py-2.5 rounded-b-xl flex flex-col gap-2.5 select-none" dir="rtl">
      
      {/* 1. ROOM LEADER & GAME LOGS ROW */}
      <div className="flex items-center justify-between w-full gap-2">
        {/* Top Room Player Info (طارق) */}
        {topPlayer ? (
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-2 py-1 rounded-xl w-[52%]">
            <div className="relative">
              <img
                src={topPlayer.avatar}
                alt={topPlayer.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-amber-500 shadow"
              />
              <span className="absolute -top-1.5 -right-1 text-xs">👑</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-amber-400 font-bold leading-tight">
                {topPlayer.name}
              </span>
              <span className="text-[9px] text-slate-300 font-mono font-medium leading-none flex items-center gap-0.5">
                <Coins size={8} className="text-amber-400" />
                {topPlayer.balance.toLocaleString()}
              </span>
            </div>
            <ChevronRight size={14} className="text-slate-600 mr-auto" />
          </div>
        ) : (
          <div className="w-[52%] h-10 bg-slate-900/40 rounded-xl animate-pulse" />
        )}

        {/* History / Audit Logs Button (تاريخي) */}
        <button
          onClick={handleOpenLogs}
          className="flex items-center justify-center gap-1.5 bg-gradient-to-l from-slate-800 to-slate-900 hover:from-slate-750 hover:to-slate-850 active:scale-95 text-slate-200 font-bold text-xs px-4 py-2 rounded-xl border border-slate-700/60 cursor-pointer shadow-md w-[45%]"
        >
          <Clock size={12} className="text-amber-400" />
          <span>تاريخي</span>
          <ChevronRight size={12} className="text-slate-500 mr-auto" />
        </button>
      </div>

      {/* 2. CURRENT PLAYER (بيتر) & DAILY PROFITS BAR */}
      <div className="flex items-center justify-between w-full border-t border-slate-900/80 pt-2 gap-2">
        
        {/* Current User Balance Widget */}
        {currentUser ? (
          <div className="flex items-center gap-2">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-slate-800"
            />
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-slate-400 leading-tight">
                {currentUser.name}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono font-bold text-amber-400">
                  {currentUser.balance.toLocaleString()}
                </span>
                
                {/* Recharge wallet / Top up */}
                <button
                  onClick={onAddBalance}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-90 text-slate-950 rounded-full p-0.5 cursor-pointer transition-transform"
                  title="شحن مجاني (5,000 رصيد)"
                >
                  <Plus size={10} className="stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-24 h-8 bg-slate-900/40 rounded-xl animate-pulse" />
        )}

        {/* Daily Profit ("أرباح اليوم") */}
        <div className="bg-gradient-to-l from-rose-950/20 to-slate-900/40 border border-slate-800/80 px-3 py-1 rounded-xl flex flex-col items-center">
          <span className="text-[9px] text-slate-400 leading-none">أرباح اليوم</span>
          <span className={`text-xs font-mono font-black mt-0.5 ${dailyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {dailyProfit >= 0 ? `+${dailyProfit}` : dailyProfit}
          </span>
        </div>

      </div>

      {/* 3. LOGS MODAL / SIDE SHEET */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full h-[80vh] flex flex-col p-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div className="flex items-center gap-1.5 text-amber-500 font-bold text-sm">
                <FileText size={16} />
                <span>سجل الجولات وتدقيق الأمان للمحفظة</span>
              </div>
              <button
                onClick={fetchLogs}
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
                title="تحديث"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 select-text scrollbar-thin scrollbar-thumb-slate-800">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 text-xs">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>جاري تحميل سجل المحفظة...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-slate-500 text-center py-10 text-xs">
                  لا توجد جولات مسجلة بعد. ابدأ اللعب لتسجيل المعاملات الأمنية!
                </div>
              ) : (
                logs.map((log, idx) => {
                  const food = FOODS[log.winningFood];
                  return (
                    <div
                      key={`${log.round}-${idx}`}
                      className="bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl flex flex-col gap-1.5"
                    >
                      {/* Round Header */}
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-amber-400 font-mono">الجولة #{log.round}</span>
                        <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>

                      {/* Summary details */}
                      <div className="flex items-center justify-between text-[10px] border-b border-slate-900 pb-1 pt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">الفائز:</span>
                          <span className="text-slate-200">{food?.icon} {food?.nameAr}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <div>
                            <span className="text-slate-500">المجمع:</span>{' '}
                            <span className="text-emerald-400">{log.totalPool}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">المدفوع:</span>{' '}
                            <span className="text-rose-400">{log.totalPayout}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">RTP:</span>{' '}
                            <span className="text-sky-400">{log.rtp}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Individual bets logs */}
                      <div className="space-y-1">
                        <div className="text-[8px] text-amber-500/70 font-semibold mb-0.5">تأكيد أمان المحفظة / الخصم والإضافة:</div>
                        {log.playerBets.map((bet, bIdx) => (
                          <div
                            key={bIdx}
                            className="flex items-center justify-between text-[9px] bg-slate-900/40 px-1.5 py-0.5 rounded"
                          >
                            <span className="text-slate-300">
                              {bet.userName} {bet.isBot && <span className="text-[7px] text-blue-400 bg-blue-950/50 px-0.5 py-0.2 rounded">Bot</span>}
                            </span>
                            <span className="font-mono text-slate-400">
                              رهان {bet.amount} على {FOODS[bet.foodId]?.icon}
                            </span>
                            <span className={`font-mono font-bold ${bet.payout > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {bet.payout > 0 ? `+${bet.payout} (ربح)` : 'خسر'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <button
              onClick={() => setShowLogs(false)}
              className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              إغلاق السجل
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
