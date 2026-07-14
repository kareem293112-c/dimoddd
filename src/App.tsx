import React, { useEffect, useState, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas.tsx';
import { BettingPanel } from './components/BettingPanel.tsx';
import { HistorySidebar } from './components/HistorySidebar.tsx';
import { HeaderPanel } from './components/HeaderPanel.tsx';
import { FooterPanel } from './components/FooterPanel.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GameState, FoodId, FOODS, User, Bet } from './types.js';
import { ShieldCheck, Trophy, Shield } from 'lucide-react';

export default function App() {
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [selectedFoodId, setSelectedFoodId] = useState<FoodId>('chicken');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionStartBalance, setSessionStartBalance] = useState<number | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger brief alert toasts
  const triggerError = (msg: string) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setErrorMessage(msg);
    errorTimeoutRef.current = setTimeout(() => setErrorMessage(null), 3000);
  };

  const triggerSuccess = (msg: string) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setSuccessMessage(msg);
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3500);
  };

  // Connect to server real-time SSE stream on mount
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      setConnectionStatus('connecting');
      sse = new EventSource('/api/stream?userId=user_me');

      sse.onopen = () => {
        setConnectionStatus('connected');
      };
   sse.onmessage = (event) => {
    try {
      const state: GameState = JSON.parse(event.data);
      setGameState(state);

      // Track starting balance for Session Profit calculation
      const me = (state?.roomPlayers && Array.isArray(state.roomPlayers)) ? state.roomPlayers.find((p: any) => p && p.id === 'user_me') : null;

      if (me && sessionStartBalance === null) {
        setSessionStartBalance(me.balance);
      }
    } catch (e) {
      console.error('Error parsing SSE state', e);
    }
  };

  sse.onerror = (err) => {
    setConnectionStatus('disconnected');
    sse?.close();
    reconnectTimeout = setTimeout(() => {
      connectSSE();
    }, 3000);
  };
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [sessionStartBalance]);

  // Win Declaration Toast check
  const lastRoundRef = useRef<number>(-1);
  useEffect(() => {
    if (gameState && gameState.phase === 'result' && gameState.winningFood && gameState.round !== lastRoundRef.current) {
      lastRoundRef.current = gameState.round;
      
         const winningItem = FOODS ? FOODS[gameState?.winningFood] : null;
    const me = (gameState && gameState.roomPlayers && Array.isArray(gameState.roomPlayers)) 
      ? gameState.roomPlayers.find((p: any) => p && p.id === 'user_me') 
      : null;

    const myBetAmount = gameState?.userBets?.[gameState?.winningFood] || 0;
      if (myBetAmount > 0) {
        const winProfit = myBetAmount * (winningItem?.multiplier || 0);
        if (winningItem) {
          triggerSuccess(`🎉 تهانينا! لقد فزت بـ $${winProfit} كوينز على خيار ${winningItem.nameAr}!`);
        }
      } else {
        if (winningItem) {
          triggerSuccess(`🎰 انتهى الدوران! الخيار الفائز هو ${winningItem.icon} ${winningItem.nameAr} (x${winningItem.multiplier})`);
        }
      }
    }
  }, [gameState]);

  // Handle placing a bet via API transaction
  const handlePlaceBet = async (foodId: FoodId) => {
    if (!gameState) return;

    if (gameState.phase !== 'betting') {
      triggerError('المراهنات مغلقة حالياً، انتظر الجولة القادمة!');
      return;
    }

    if (gameState.timer <= 1) {
      triggerError('انتهى وقت المراهنة لهذه الجولة!');
      return;
    }

    const me = gameState.roomPlayers.find(p => p.id === 'user_me');
    if (!me) {
      triggerError('خطأ: لم يتم التعرف على ملفك الشخصي.');
      return;
    }

    if (me.balance < selectedAmount) {
      triggerError('رصيدك غير كافٍ لإجراء هذا الرهان! اضغط (+) للشحن.');
      return;
    }

    // Optimistic state updates
    setGameState(prev => {
      if (!prev) return null;
      const updatedTotalBets = { ...prev.totalBets };
      updatedTotalBets[foodId] = (updatedTotalBets[foodId] || 0) + selectedAmount;

      const updatedUserBets = { ...prev.userBets };
      updatedUserBets[foodId] = (updatedUserBets[foodId] || 0) + selectedAmount;

      const updatedRoomPlayers = prev.roomPlayers.map(p => {
        if (p.id === 'user_me') {
          return { ...p, balance: p.balance - selectedAmount };
        }
        return p;
      });

      return {
        ...prev,
        totalBets: updatedTotalBets,
        userBets: updatedUserBets,
        roomPlayers: updatedRoomPlayers
      };
    });

    try {
      const res = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_me',
          foodId: foodId,
          amount: selectedAmount
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل وضع الرهان');
      }
    } catch (e: any) {
      triggerError(e.message || 'خطأ في الاتصال بالخادم.');
      // Revert optimistic update by fetching state again or letting SSE handle it
    }
  };

  // Add free testing balance
  const handleAddBalance = async () => {
    try {
      const res = await fetch('/api/add-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Helper variables
const currentUser = (gameState?.roomPlayers && Array.isArray(gameState.roomPlayers)) ? gameState.roomPlayers.find((p: any) => p && p.id === 'user_me') : null;
const currentBet = (gameState?.userBets && typeof selectedElement !== 'undefined') ? gameState.userBets[selectedElement] : 0;
const currentBalance = currentUser ? currentUser.balance : 0;

        triggerSuccess('⚡ تم شحن محفظتك بـ 5,000 كوينز مجانية للتجربة!');
      }
    } catch (e) {
      triggerError('فشل شحن الرصيد التجريبي');
    }
  };

  // Helper variables
  const currentUser = gameState?.roomPlayers.find(p => p.id === 'user_me') || null;
  const topPlayer = gameState?.roomPlayers.find(p => p.id === 'bot_1') || null;
  
  const currentBalance = currentUser?.balance || 0;
  const dailyProfit = sessionStartBalance !== null ? currentBalance - sessionStartBalance : 0;

  const foodKeys = Object.keys(FOODS) as FoodId[];

  return (
    <div className="w-full h-[100dvh] bg-[#070312] flex flex-col items-center justify-center md:py-6 text-slate-100 font-sans overflow-hidden" dir="ltr">
      
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,rgba(98,32,184,0.18),rgba(0,0,0,0))] pointer-events-none" />

      {/* Admin Toggle */}
      <button 
        onClick={() => setShowAdmin(true)}
        className="absolute top-4 left-4 z-40 p-2 bg-[#1a0f35] border border-fuchsia-500/30 rounded-full text-fuchsia-400 hover:text-fuchsia-300 hover:bg-[#23153e] transition-colors"
        title="Admin Dashboard"
      >
        <Shield size={20} />
      </button>

      {showAdmin && <AdminDashboard onClose={() => setShowAdmin(false)} />}

      {/* Main Container - Accommodating simulated Voice Chat and Bottom Sheet layout */}
      <div className="relative w-full h-full md:max-w-md bg-[#0a0518] md:rounded-3xl shadow-3xl md:border border-[#23153e] overflow-hidden flex flex-col">
        
        {/* Connection status notification */}
        {connectionStatus !== 'connected' && (
          <div className={`absolute top-11 left-0 right-0 z-40 py-1 text-center text-[10px] font-bold ${connectionStatus === 'connecting' ? 'bg-amber-500/90 text-slate-950 animate-pulse' : 'bg-rose-600/95 text-white'}`}>
            {connectionStatus === 'connecting' ? 'جاري الاتصال بغرفة الألعاب...' : 'انقطع الاتصال بالسيرفر! جاري المحاولة...'}
          </div>
        )}

        {/* Dynamic toasts */}
        {errorMessage && (
          <div className="absolute top-14 left-4 right-4 z-50 bg-rose-600/95 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xl flex items-center justify-between border border-rose-400 animate-slide-in" dir="rtl">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="absolute top-14 left-4 right-4 z-50 bg-emerald-600/95 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xl flex items-center justify-between border border-emerald-400 animate-slide-in" dir="rtl">
            <span>{successMessage}</span>
          </div>
        )}

        {/* PREMIUM GAME PANEL CONTAINER */}
        <div className="flex-1 bg-gradient-to-b from-[#110624] to-[#04010a] border-t-4 border-[#d97706]/80 flex flex-col relative min-h-0">

          {/* 2a. TOP HEADER BAR */}
          <HeaderPanel
            round={gameState?.round || 1993}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled(!soundEnabled)}
          />

          {/* 2b. MAIN PLAYING AREA (Center-Wheel, Right-Chips, History) */}
          <div className="relative flex flex-col p-2 gap-2 bg-[#100624]/30 flex-1 min-h-0">
            
            {/* Central 2.5D Animated wheel */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
              <div className="absolute inset-0 flex items-center justify-center">
                <GameCanvas
                  phase={gameState?.phase || 'betting'}
                  timer={gameState?.timer !== undefined ? gameState.timer : 30}
                  totalBets={gameState?.totalBets || {}}
                  userBets={gameState?.userBets || {}}
                  winningFood={gameState?.winningFood || null}
                  onPlaceBet={handlePlaceBet}
                  allBetsList={gameState?.allBetsList || []}
                  selectedFoodId={selectedFoodId}
                  onSelectFood={(id) => {
                    setSelectedFoodId(id);
                    handlePlaceBet(id);
                  }}
                  soundEnabled={soundEnabled}
                />
              </div>
            </div>
            
            {/* Betting Panel & History Sidebar below wheel, shrinkable */}
            <div className="w-full flex-shrink-0 flex flex-col gap-2">
              <HistorySidebar history={gameState?.history || []} />

              <BettingPanel
                selectedAmount={selectedAmount}
                onSelectAmount={(amt) => setSelectedAmount(amt)}
                selectedFoodId={selectedFoodId}
                onPlaceBet={handlePlaceBet}
                phase={gameState?.phase || 'betting'}
                timer={gameState?.timer !== undefined ? gameState.timer : 30}
              />
            </div>

          </div>

          {/* 2d. PROFILE & WALLET FOOTER */}
                 <FooterPanel 
          currentBalance={currentBalance}
          topPlayer={topPlayer}
          dailyProfit={dailyProfit}
        />
      </div>
    </div>
  );
}
