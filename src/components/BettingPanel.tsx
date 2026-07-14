import React from 'react';
import { FoodId, FOODS } from '../types.js';

interface BettingPanelProps {
  selectedAmount: number;
  onSelectAmount: (amount: number) => void;
  selectedFoodId: FoodId;
  onPlaceBet: (foodId: FoodId) => void;
  phase: 'betting' | 'spinning' | 'result';
  timer: number;
}

const CHIP_PRESETS = [10, 100, 1000, 10000];

export const BettingPanel: React.FC<BettingPanelProps> = ({
  selectedAmount,
  onSelectAmount,
  selectedFoodId,
  onPlaceBet,
  phase,
  timer,
}) => {
  const isBettingClosed = phase !== 'betting' || timer <= 1;
  const currentFood = FOODS[selectedFoodId];

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      
      {/* Small Square Chips Row */}
      <div className="flex justify-between gap-2 w-full">
        {CHIP_PRESETS.map(amount => {
          const isSelected = selectedAmount === amount;
          
          let colorTheme = {
            from: 'from-emerald-500',
            to: 'to-emerald-700',
            border: 'border-emerald-400',
            glow: 'shadow-emerald-500/50',
          };
          
          if (amount === 100) {
            colorTheme = {
              from: 'from-blue-500',
              to: 'to-blue-700',
              border: 'border-blue-400',
              glow: 'shadow-blue-500/50',
            };
          } else if (amount === 1000) {
            colorTheme = {
              from: 'from-fuchsia-500',
              to: 'to-fuchsia-700',
              border: 'border-fuchsia-400',
              glow: 'shadow-fuchsia-500/50',
            };
          } else if (amount === 10000) {
            colorTheme = {
              from: 'from-amber-500',
              to: 'to-amber-700',
              border: 'border-amber-400',
              glow: 'shadow-amber-500/50',
            };
          }

          return (
            <button
              key={amount}
              onClick={() => onSelectAmount(amount)}
              className={`relative flex-1 flex flex-col items-center justify-center h-[38px] rounded-lg font-sans font-black cursor-pointer transition-all duration-300 transform active:scale-90 border-2 ${
                isSelected
                  ? `bg-gradient-to-br ${colorTheme.from} ${colorTheme.to} scale-105 ${colorTheme.border} ${colorTheme.glow}`
                  : 'bg-slate-950/90 border-[#3b1c6e] hover:bg-slate-900/90 hover:border-[#52259a]'
              } text-white shadow-lg`}
            >
              <div className="absolute inset-0.5 rounded-md border border-white/10 pointer-events-none" />
              <span className="z-10 font-mono text-xs tracking-tighter text-white font-extrabold drop-shadow-md">
                {amount >= 1000 ? `${amount / 1000}K` : amount}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
};
