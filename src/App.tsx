import React, { useEffect, useState, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas.tsx';
import { BettingPanel } from './components/BettingPanel.tsx';
import { HistorySidebar } from './components/HistorySidebar.tsx';
import { HeaderPanel } from './components/HeaderPanel.tsx';
import { FooterPanel } from './components/FooterPanel.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GameState, FoodId, FOODS, User, Bet } from './types.js';
import { ShieldCheck, Trophy, Shield } from 'lucide-react';

const BACKEND_URL = typeof window !== 'undefined' && (window.location.hostname.includes('localhost') || window.location.hostname.includes('run.app'))
  ? window.location.origin
  : 'https://onrender.com';

export default function App() {
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [selectedFoodId, setSelectedFoodId] = useState<FoodId>('chicken');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionStartBalance, setSessionStartBalance] = useState<number | null>(null);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // إدارة الاتصال الحي بالسيرفر عبر الـ SSE المحمي من الانهيار
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      setConnectionStatus('connecting');
      sse = new EventSource(`${BACKEND_URL}/api/stream?userId=user_me`);

      sse.onopen = () => {
        setConnectionStatus('connected');
      };

      sse.onmessage = (event) => {
        try {
          const state: GameState = JSON.parse(event.data);
          if (state) {
            const safeState: GameState = {
              ...state,
              roomPlayers: state.roomPlayers || [],
              history: state.history || [],
              userBets: state.userBets || {}
            };
            setGameState(safeState);

            // تتبع بداية الرصيد للمستخدم بشكل آمن
            const me = safeState.roomPlayers?.find((p: any) => p.id === 'user_me');
            if (me && sessionStartBalance === null) {
              setSessionStartBalance(me.balance);
            }
          }
        } catch (e) {
          console.error('Error parsing SSE state:', e);
        }
      };

      sse.onerror = () => {
        setConnectionStatus('disconnected');
        sse?.close();
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      sse?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [sessionStartBalance]);

  // فحص حلقة الدوران والإعلان عن النتيجة والتخامد التنازلي
  const lastRoundRef = useRef<number>(-1);
  useEffect(() => {
    if (!gameState) return;

    const slowingTime = gameState.slowingTime ?? 0;
    const multiplier = gameState.multiplier ?? 1;

    if (gameState.phase === 'result' && gameState.winningFood && gameState.round !== lastRoundRef.current) {
      lastRoundRef.current = gameState.round;

      const myBetAmount = gameState.userBets?.[gameState.winningFood] || 0;
      if (slowingTime === 0) {
        if (myBetAmount > 0) {
          const dailyProfitCalculated = myBetAmount * multiplier;
          triggerSuccess(`انتهت الجولة! لقد فزت بمضاعف x${multiplier} بربح قيمته: ${dailyProfitCalculated}`);
        } else {
          // تم هنا تعديل FOODS للحروف الكبيرة ليتطابق مع الـ Types بنجاح
          triggerSuccess(`انتهت الجولة! الخيار الفائز هو: ${FOODS[gameState.winningFood]?.label || gameState.winningFood}`);
        }
      } else {
        triggerSuccess(`العجلة تتباطأ الآن! الوقت المتبقي: ${slowingTime} ثانية`);
      }
    }
  }, [gameState]);

  // دالة المراهنة والاتصال عبر الـ HTTP POST
  const handlePlaceBet = async () => {
    if (!gameState || connectionStatus !== 'connected') {
      triggerError("شبكة اللعبة غير متصلة حالياً!");
      return;
    }

    if (gameState.phase !== 'betting') {
      triggerError("عذراً، انتهى وقت استقبال الرهانات لهذه الجولة!");
      return;
    }

    const me = gameState.roomPlayers?.find((p: any) => p.id === 'user_me');
    if (!me) {
      triggerError("لم يتم العثور على بيانات اللاعب في الغرفة!");
      return;
    }

    if (Number(me.balance) < selectedAmount) {
      triggerError("رصيدك الحالي غير كافٍ لإجراء هذه المراهنة!");
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/game/bet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          foodId: selectedFoodId,
          amount: selectedAmount
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "فشل تسجيل الرهان");

      triggerSuccess("تم تسجيل خيارك بنجاح في الجولة!");
    } catch (err: any) {
      triggerError(err.message || "حدث خطأ أثناء الاتصال بالسيرفر.");
    }
  };

  // دالة طلب زيادة الرصيد الاختيارية للواجهة
  const handleAddBalance = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/game/add-balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: 'user_me', amount: 1000 })
      });
      if (response.ok) {
        triggerSuccess("تم إضافة 1000 نقطة تجريبية لرصيدك!");
      }
    } catch (err) {
      console.error("فشل طلب الرصيد:", err);
    }
  };

  // حساب المتغيرات المساعدة للواجهة (UI Helper variables) بشكل سليم ومحمي 100%
  const currentMe = gameState?.roomPlayers?.find((p: any) => p.id === "user_me") || null;
  const topPlayer = gameState?.roomPlayers && gameState.roomPlayers.length > 0 ? gameState.roomPlayers : null;
  const currentBalance = currentMe ? Number(currentMe.balance || 0) : 0;
  const dailyProfit = currentMe && sessionStartBalance !== null ? (Number(currentMe.balance) - Number(sessionStartBalance)) : 0;

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden bg-slate-950 text-white p-4" dir="rtl">
      <HeaderPanel 
        connectionStatus={connectionStatus} 
        showAdmin={showAdmin} 
        setShowAdmin={setShowAdmin} 
      />

      {/* شاشة التحكم الخاصة بالآدمين للتعديل على العجلة */}
      {showAdmin && <AdminDashboard />}

      {/* رسائل التنبيه والخطأ الذكية والمنبثقة صامتاً */}
      {errorMessage && (
        <div className="bg-red-600/80 text-white text-xs p-2 rounded text-center my-1 animate-pulse">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-600/80 text-white text-xs p-2 rounded text-center my-1">
          {successMessage}
        </div>
      )}

      {/* قسم عرض اللعبة واللوحة الجانبية */}
      <div className="flex flex-col md:flex-row gap-4 justify-center items-center my-auto">
        <div className="canvas-container relative flex justify-center items-center">
          {/* مكون الجسد والرسم الفيزيائي */}
          <GameCanvas 
            gameState={gameState} 
            soundEnabled={soundEnabled} 
          />
          
          {/* عداد وقت تنازلي مدمج في الواجهة إذا كانت اللعبة بانتظار الرهان */}
          {gameState?.phase === 'betting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">وقت المراهنة</span>
              <span className="text-3xl font-extrabold text-yellow-500 animate-bounce">
                {gameState?.timer !== undefined ? gameState.timer : 15}s
              </span>
            </div>
          )}
        </div>

        {/* لوحة التحكم واختيارات الأطعمة لجميع المشتركين */}
        <BettingPanel 
          selectedAmount={selectedAmount}
          setSelectedAmount={setSelectedAmount}
          selectedFoodId={selectedFoodId}
          setSelectedFoodId={setSelectedFoodId}
          onPlaceBet={handlePlaceBet}
          disabled={gameState?.phase !== 'betting'}
        />
      </div>

      {/* سجل الجولات السابقة والتقارير في النصف السفلي */}
      <div className="w-full mt-4 flex gap-4">
        <HistorySidebar history={gameState?.history || []} />
      </div>

      {/* تذييل الصفحة المالي وقائمة المتصدرين داخل الغرفة الصوتية */}
      <FooterPanel 
        currentUser={currentMe || { id: 'user_me', name: 'أنا', balance: currentBalance, avatar: '' }}
        onAddBalance={handleAddBalance}
        topPlayer={topPlayer}
        dailyProfit={dailyProfit}
      />
    </div>
  );
}
