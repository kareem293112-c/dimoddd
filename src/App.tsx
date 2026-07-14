import React, { useEffect, useState, useRef } from 'react';
import { GameState, FOODS, FOOD_IDS } from './types';
import GameCanvas from './components/GameCanvas';
import BettingPanel from './components/BettingPanel';
import HistorySidebar from './components/HistorySidebar';
import HeaderPanel from './components/HeaderPanel';
import FooterPanel from './components/FooterPanel';
import AdminDashboard from './components/AdminDashboard';

// Define the missing constant directly here to fix the build error
const SELECTED_BET_AMOUNT = 100; // يمكنك تغيير هذه القيمة الافتراضية (مثلا 100 أو 500 كوينز) حسب نظام اللعبة لديك

// Custom Trigger Functions directly inside App to avoid missing import errors
const triggerSuccess = (msg: string) => {
  console.log("%c SUCCESS: " + msg, "color: #10b981; font-weight: bold; background: #064e3b; padding: 4px; border-radius: 4px;");
  alert(msg);
};

const triggerError = (msg: string) => {
  console.error("ERROR: " + msg);
  alert(msg);
};

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [selectedElement, setSelectedElement] = useState<FOOD_IDS | null>(null);
  const [sessionStartBalance, setSessionStartBalance] = useState<number | null>(null);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);

  let sse: EventSource | null = null;
  let reconnectTimeout: any = null;

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

        // Track starting balance for Session Profit calculation safely
        const me = (state?.roomPlayers && Array.isArray(state.roomPlayers)) 
          ? state.roomPlayers.find((p: any) => p && p.id === 'user_me') 
          : null;

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
  };

  useEffect(() => {
    connectSSE();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (sse) sse.close();
    };
  }, []);

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
  const handlePlaceBet = async (foodId: FOOD_IDS) => {
    if (!gameState) return;

    if (gameState.phase !== 'betting') {
      triggerError('🚫 لا يمكن وضع الرهان في هذا الوقت!');
      return;
    }

    if (gameState.timer <= 2) {
      triggerError('⚠️ انتهى وقت المراهنة تقريباً!');
      return;
    }

    const me = (gameState?.roomPlayers && Array.isArray(gameState.roomPlayers)) 
      ? gameState.roomPlayers.find((p: any) => p && p.id === 'user_me') 
      : null;

    if (!me || me.balance < SELECTED_BET_AMOUNT) {
      triggerError('❌ رصيدك غير كافٍ لوضع المراهنة!');
      return;
    }

    try {
      await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_me', foodId, amount: SELECTED_BET_AMOUNT })
      });
    } catch (err) {
      triggerError('❌ فشل في إرسال الرهان، يرجى المحاولة مجدداً');
    }
  };

  // Helper variables
  const currentUser = (gameState?.roomPlayers && Array.isArray(gameState.roomPlayers)) 
    ? gameState.roomPlayers.find((p: any) => p && p.id === 'user_me') 
    : null;

  const currentBet = (gameState?.userBets && selectedElement !== null) 
    ? gameState.userBets[selectedElement] || 0 
    : 0;

  const currentBalance = currentUser ? currentUser.balance : 0;
  const topPlayer = (gameState?.roomPlayers && Array.isArray(gameState.roomPlayers) && gameState.roomPlayers.length > 0)
    ? [...gameState.roomPlayers].sort((a, b) => b.balance - a.balance)
    : null;

  const dailyProfit = sessionStartBalance !== null ? currentBalance - sessionStartBalance : 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white relative font-sans overflow-x-hidden">
      {/* Admin Dashboard Toggle Button */}
      <button 
        onClick={() => setShowAdmin(!showAdmin)}
        className="absolute top-4 left-4 z-50 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded-lg shadow-lg text-sm transition-all"
      >
        {showAdmin ? '🎮 العودة للعبة' : '⚙️ لوحة التحكم'}
      </button>

      {showAdmin ? (
        <AdminDashboard onClose={() => setShowAdmin(false)} />
      ) : (
        <div className="w-full flex-1 flex flex-col xl:flex-row relative">
          {/* Main Game & Betting Area (Left/Center) */}
          <div className="flex-1 flex flex-col p-4 xl:pr-2 gap-4">
            {/* Header Panel */}
            <HeaderPanel 
              connectionStatus={connectionStatus}
              round={gameState?.round || 0}
              phase={gameState?.phase || 'connecting'}
              timer={gameState?.timer || 0}
            />

            {/* Game Canvas Area */}
            <GameCanvas gameState={gameState} />

            {/* Betting Panel */}
            <BettingPanel 
              gameState={gameState}
              selectedElement={selectedElement}
              setSelectedElement={setSelectedElement}
              onPlaceBet={handlePlaceBet}
            />
          </div>

          {/* History & Players Sidebar (Right) */}
          <div className="w-full xl:w-80 flex flex-col p-4 xl:pl-2 gap-4">
            <HistorySidebar history={gameState?.history || []} />
          </div>
        </div>
      )}

      {/* Footer System Navigation & Stats */}
      <FooterPanel 
        currentBalance={currentBalance}
        topPlayer={topPlayer}
        dailyProfit={dailyProfit}
      />
    </div>
  );
}
