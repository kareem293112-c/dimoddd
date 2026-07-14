import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas'; // ملف الجسد
import BettingPanel from './components/BettingPanel';
import HistorySlider from './components/HistorySlider';
import UsersList from './components/UsersList';
import FooterPanel from './components/FooterPanel';

// قيمة الرهان الافتراضية
const SELECTED_BET_DEFAULT = 10; 

export default function GameController({ currentUser, roomId }) {
    // حالات اللعبة (States)
    const [gameState, setGameState] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected
    const [selectedBet, setSelectedBet] = useState(SELECTED_BET_DEFAULT);
    const [gameLogs, setGameLogs] = useState([]);

    // مراجع الـ Canvas والشبكة لمنع التكرار (Refs)
    const socketRef = useRef(null);
    const lastEventIdRef = useRef(null);

    // دالة لتسجيل التنبيهات والأحداث دون تعليق الشاشة (بديل الـ alert الكارثي)
    const logGameEvent = (message) => {
        setGameLogs(prev => [message, ...prev.slice(0, 19)]); // الاحتفاظ بآخر 20 حدث فقط
        console.log(`[Game Log]: ${message}`);
    };

    // 1. إدارة اتصال الـ WebSocket والمزامنة المستمرة
    useEffect(() => {
        if (!currentUser || !roomId) return;

        // الاتصال بالسيرفر وتمرير التوكن والغرفة في الرابط بأمان
        const wsUrl = `wss://${window.location.host}/game?token=${currentUser.token}&roomId=${roomId}`;
        socketRef.current = new WebSocket(wsUrl);

        setConnectionStatus('connecting');

        socketRef.current.onopen = () => {
            setConnectionStatus('connected');
            logGameEvent("تم الاتصال بسيرفر اللعبة بنجاح.");
        };

        socketRef.current.onmessage = (event) => {
            try {
                const parsedData = JSON.parse(event.data);
                
                if (parsedData && parsedData.type === 'STATE_UPDATE') {
                    const nextState = parsedData.data;
                    
                    // التحقق من سلامة البيانات قبل حقنها في الجسد
                    if (nextState && Array.isArray(nextState.roomPlayers)) {
                        setGameState(nextState);
                    }
                }
            } catch (error) {
                console.error("خطأ في قراءة بيانات السيرفر الحية:", error);
            }
        };

        socketRef.current.onerror = (error) => {
            console.error("خطأ في شبكة الـ WebSocket:", error);
        };

        socketRef.current.onclose = () => {
            setConnectionStatus('disconnected');
            logGameEvent("انقطع الاتصال بالسيرفر. جاري محاولة إعادة الاتصال...");
        };

        // تنظيف الاتصال عند الخروج من الغرفة الصوتية
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [currentUser, roomId]);

    // 2. تتبع الحالات الخاصة ومضاعفات الوقت العشوائية (RNG Effects)
    useEffect(() => {
        if (!gameState) return;

        // منع تكرار المعالجة لنفس الحدث (مهم جداً لسلاسة الـ Canvas)
        if (gameState.eventId && gameState.eventId !== lastEventIdRef.current) {
            lastEventIdRef.current = gameState.eventId;

            if (gameState.phase === 'spinning') {
                logGameEvent(`بدأت العجلة بالدوران! زاوية الهدف: ${gameState.targetAngle}`);
            }

            if (gameState.phase === 'ended') {
                logGameEvent(`انتهت الجولة بفوز الخيار: ${gameState.winner}`);
            }
        }
    }, [gameState]);

    // 3. دالة المشاركة والرهان الآمنة بالكامل (تم حل مشكلة الـ BigInt والـ Headers)
    const handlePlacingABet = async () => {
        if (!gameState || connectionStatus !== 'connected') {
            logGameEvent("لا يمكن إرسال الطلب، تأكد من اتصالك بالشبكة.");
            return;
        }

        if (gameState.phase !== 'betting') {
            logGameEvent("عذراً، انتهى وقت استقبال المشاركات لهذه الجولة.");
            return;
        }

        // البحث عن اللاعب الحالي في المصفوفة بأمان
        const myData = gameState.roomPlayers.find(p => p.id === currentUser.id);
        if (!myData) {
            logGameEvent("لم يتم العثور على بياناتك كلاعب نشط في الغرفة.");
            return;
        }

        // إصلاح مشكلة مقارنة الـ BigInt الكارثية
        const currentBalance = BigInt(myData.balance || 0);
        const requiredBet = BigInt(selectedBet);

        if (currentBalance < requiredBet) {
            logGameEvent("رصيدك غير كافٍ للمشاركة في الجولة الحالية.");
            return;
        }

        try {
            const response = await fetch("/api/v1/game/place-bet", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${currentUser.token}` // توثيق الهوية لضمان الأمان
                },
                body: JSON.stringify({
                    roomId: roomId,
                    amount: requiredBet.toString() // إرسال النص لتفادي مشاكل JSON مع BigInt
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "رفض السيرفر المعاملة");

            logGameEvent(`تمت مشاركتك بمبلغ ${selectedBet} بنجاح!`);

        } catch (error) {
            console.error("فشل إرسال طلب الرهان للباك-إند:", error);
            logGameEvent("حدث خطأ أثناء تسجيل مشاركتك، يرجى المحاولة مجدداً.");
        }
    };

    // حساب إحصائيات سريعة للواجهة باستخدام معالجة BigInt الآمنة
    const getMyCurrentBalance = () => {
        if (!gameState) return "0";
        const me = gameState.roomPlayers.find(p => p.id === currentUser.id);
        return me ? me.balance.toString() : "0";
    };

    return (
        <div className="game-container w-full h-full flex flex-col justify-between overflow-hidden bg-slate-950 text-white p-4">
            
            {/* شريط الحالة والشبكة */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                <span className="text-sm">معرف الغرفة: {roomId}</span>
                <span className={`text-xs px-2 py-1 rounded ${connectionStatus === 'connected' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {connectionStatus === 'connected' ? 'متصل برمجياً' : 'جاري الاتصال...'}
                </span>
            </div>

            {/* الجزء الأساسي: العقل يمرر البيانات للجسد للرسم */}
            <div className="main-layout flex flex-col md:flex-row gap-4 justify-center items-center my-auto">
                
                {/* ملف الجسد (الواجهات والأنيميشن) */}
                <div className="canvas-section flex justify-center items-center relative">
                    <GameCanvas gameState={gameState} logGameEvent={logGameEvent} />
                </div>

                {/* لوحة التحكم والرهانات */}
                <div className="controls-section w-full md:w-80 flex flex-col gap-2">
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                        <p className="text-xs text-slate-400">رصيدك الحالي</p>
                        <p className="text-xl font-bold text-yellow-500">{getMyCurrentBalance()} نقطة</p>
                    </div>

                    <BettingPanel 
                        selectedBet={selectedBet} 
                        setSelectedBet={setSelectedBet} 
                        onPlaceBet={handlePlacingABet}
                        disabled={gameState?.phase !== 'betting'}
                    />
                </div>
            </div>

            {/* الأجزاء الجانبية المساعدة كقوائم وسجل النتائج */}
            <div className="bottom-layout w-full mt-4 flex flex-col gap-2 border-t border-slate-800 pt-2">
                <HistorySlider history={gameState?.history || []} />
                <UsersList players={gameState?.roomPlayers || []} />
                
                {/* استعراض التنبيهات المباشرة للمستخدم في اللعبة بدل الـ alert */}
                <div className="logs-view text-[10px] text-slate-400 max-h-12 overflow-y-auto px-2 bg-slate-900 rounded">
                    {gameLogs.length > 0 ? gameLogs[0] : "في انتظار بدء الجولة..."}
                </div>
            </div>

            <FooterPanel />
        </div>
    );
}
