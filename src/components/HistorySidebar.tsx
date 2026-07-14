import React from 'react';
import { FoodId, FOODS } from '../types.js';

interface HistorySidebarProps {
  history: FoodId[];
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ history }) => {
  // Take last 7 results, reverse to show newest first
  const displayHistory = [...history].slice(-7).reverse();

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 w-full bg-slate-950/50 rounded-xl border border-slate-900 shadow-md">
      {/* Title */}
      <div className="bg-rose-600 text-white font-bold text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap select-none">
        السجل
      </div>

      {/* List */}
      <div className="flex flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden" dir="rtl">
        {displayHistory.map((foodId, idx) => {
          const food = FOODS[foodId];
          const isNewest = idx === 0;

          if (!food) return null;

          return (
            <div
              key={`${foodId}-${idx}`}
              className={`relative flex items-center justify-center min-w-[28px] h-7 rounded-full border-2 shrink-0 ${
                isNewest
                  ? 'border-amber-400 bg-amber-950/40 ring-2 ring-amber-500/20 animate-pulse'
                  : 'border-slate-700 bg-slate-900/60'
              } transition-all duration-300 shadow-md`}
              title={`${food.nameAr} - x${food.multiplier}`}
            >
              {/* Food Emoji */}
              <span className="text-sm select-none filter drop-shadow">
                {food.icon}
              </span>

              {/* Multiplier Tooltip badge on top corner */}
              <span className={`absolute -bottom-1 -right-1 text-[5px] font-mono font-black px-0.5 rounded leading-none ${isNewest ? 'bg-amber-400 text-amber-950' : 'bg-slate-700 text-slate-200'}`}>
                x{food.multiplier}
              </span>

              {/* "New" Badge for newest outcome */}
              {isNewest && (
                <div className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 bg-rose-500 text-white font-extrabold text-[4px] px-0.5 py-[1px] rounded-full uppercase scale-90 border border-white/20 select-none">
                  New
                </div>
              )}
            </div>
          );
        })}

        {displayHistory.length === 0 && (
          <div className="text-[8px] text-slate-500 text-center flex-1 py-1">لا يوجد</div>
        )}
      </div>
    </div>
  );
};
