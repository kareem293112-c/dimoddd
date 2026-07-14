import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import admin from 'firebase-admin';
import fs from 'fs';

// 1. تهيئة تطبيق Express وسيرفر الـ WebSockets
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: [
        'https://wif.onrender.com',
        'https://sada-alarab.onrender.com',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-userid']
}));
app.use(express.json());

// 2. ربط وتهيئة Firebase Admin SDK بأمان مع فحص وجود الملف السري أولاً لضمان عدم حدوث Crash
let db: admin.firestore.Firestore | null = null;
const databaseId = "ai-studio-sadaalarabvoiceb-5f452604-580f-4265-ab18-da9c404b3698";

try {
    const secretPath = '/etc/secrets/firebase-key.json';
    let serviceAccount: any = null;

    if (fs.existsSync(secretPath)) {
        const fileContent = fs.readFileSync(secretPath, 'utf8');
        if (fileContent && fileContent.trim() !== "") {
            serviceAccount = JSON.parse(fileContent);
        }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
    }

    if (serviceAccount) {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id
            });
        }
        const firestoreInstance = admin.firestore();
        firestoreInstance.settings({ databaseId });
        db = firestoreInstance;
        console.log("🔥 تم الاتصال بقاعدة بيانات Firebase بنجاح باستخدام المفتاح السري والمشروع المخصص.");
    } else {
        console.log("⚠️ لم يتم العثور على مفتاح FIREBASE_SERVICE_ACCOUNT أو ملف الأسرار، جاري تشغيل السيرفر بدون قاعدة بيانات حالياً للتجربة والتحقق.");
    }
} catch (error: any) {
    console.error("❌ خطأ في تهيئة الفايربيز، جاري التشغيل بدون قاعدة بيانات لتفادي توقف السيرفر (Crash):", error.message);
}

// 3. متغيرات نظام المحفظة وأرباح المنصة (الباك إند)
let systemPool = 500000; 
let platformProfit = 0;   
let countdown = 30;       
let gameInterval: NodeJS.Timeout;
const foodSlots = ['chicken', 'pizza', 'sushi', 'cake', 'watermelon', 'meat', 'burger', 'salad'];
const multipliers: { [key: string]: number } = {
    chicken: 45, pizza: 15, sushi: 25, cake: 5, watermelon: 5, meat: 5, burger: 10, salad: 5
};

// مصفوفة ديناميكية لحفظ الرهانات النشطة في الجولة الحالية لتوزيع الأرباح بدقة
interface Bet {
    userId: string;
    slot: string;
    amount: number;
}
let activeBets: Bet[] = [];
let roundHistory: any[] = [];

// 4. خوارزمية تدوير العداد وبث النتائج اللحظية عبر الـ WebSockets
const io = new Server(server, {
    cors: { 
        origin: ['https://wif.onrender.com', 'https://sada-alarab.onrender.com', 'http://localhost:3000'], 
        methods: ['GET', 'POST'] 
    }
});

// مصفوفة للاحتفاظ بمتلقي البث المباشر (SSE clients) كخيار احتياطي لمنع خطأ الـ 404
const sseClients = new Set<any>();

function getGameState() {
    return {
        countdown,
        systemPool,
        phase: countdown > 1 ? 'betting' : 'spinning',
        history: roundHistory,
        activeBetsCount: activeBets.length
    };
}

function broadcastState() {
    const state = getGameState();
    // إرسال فوري للمشتركين عبر Socket.io
    io.emit('timer_update', state);

    // إرسال فوري للمشتركين عبر البث المباشر المفتوح (SSE) لتفادي الـ 404 تماماً
    const sseData = JSON.stringify({ type: 'game_state', data: state });
    for (const res of sseClients) {
        try {
            res.write(`data: ${sseData}\n\n`);
        } catch (err) {
            sseClients.delete(res);
        }
    }
}

function startNewRound() {
    countdown = 30;
    activeBets = []; // تفريغ الرهانات استعداداً للجولة الجديدة
    io.emit('round_start', { countdown, systemPool });
    broadcastState();

    gameInterval = setInterval(async () => {
        countdown--;
        broadcastState();

        if (countdown === 1) {
            io.emit('betting_closed'); 
        }

        if (countdown <= 0) {
            clearInterval(gameInterval);
            await processRoundResults();
        }
    }, 1000);
}

// 5. حساب النتيجة وتوزيع الأرباح بأمان عبر معاملات Firestore المتزامنة
async function processRoundResults() {
    // اختيار الخيار الفائز عشوائياً
    const winningSlot = foodSlots[Math.floor(Math.random() * foodSlots.length)];
    const multiplier = multipliers[winningSlot] || 5;

    io.emit('wheel_spin', { winningSlot });
    console.log(`🎰 الخيار الفائز في هذه الجولة هو: ${winningSlot} (المضاعف: x${multiplier})`);

    // تصفية وتحديد الفائزين الذين راهنوا على الخيار الفائز
    const winners = activeBets.filter(b => b.slot === winningSlot);
    console.log(`🎯 عدد الرهانات الفائزة في هذه الجولة: ${winners.length}`);

    if (db && winners.length > 0) {
        for (const bet of winners) {
            try {
                const userRef = db.collection('users').doc(bet.userId);
                const payoutAmount = bet.amount * multiplier;

                // معاملة ذرية آمنة (Atomic Transaction) لمنع التضارب وحساب الرصيد بدقة
                await db.runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) {
                        console.error(`User ${bet.userId} not found during payout.`);
                        return;
                    }

                    const currentBalance = userDoc.data()?.coins || 0;
                    const newBalance = currentBalance + payoutAmount;

                    // إضافة نقاط خبرة كهدية تشجيعية من النظام (10% من قيمة الربح)
                    const currentXp = userDoc.data()?.xp || 0;
                    const newXp = currentXp + Math.floor(payoutAmount * 0.1);

                    transaction.update(userRef, { 
                        coins: newBalance,
                        xp: newXp
                    });
                    
                    console.log(`💰 [PAYOUT SUCCESS] تم شحن رصيد ${bet.userId} بقيمة ${payoutAmount} كوينز. الرصيد الجديد: ${newBalance}`);
                });
            } catch (err: any) {
                console.error(`❌ فشل معالجة الربح للمستخدم ${bet.userId}:`, err.message);
            }
        }
    }

    // تسجيل الجولة في السجل التاريخي للعبة
    roundHistory.unshift({
        winningSlot,
        multiplier,
        timestamp: new Date().toISOString()
    });
    if (roundHistory.length > 20) roundHistory.pop();

    setTimeout(() => {
        startNewRound();
    }, 7000);
}

// 6. رابط المراهنة الآمن المرتبط بحسابك في الـ Firebase
app.post('/api/game/bet', async (req, res) => {
    const { userId, slot, amount } = req.body; 

    if (!userId || !slot || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "بيانات الرهان غير صالحة" });
    }

    if (countdown <= 1) {
        return res.status(400).json({ error: "عذراً، انتهت فترة الرهان لهذه الجولة ويجري تدوير العجلة حالياً!" });
    }

    if (!db) {
        // نمط التجربة والتحقق الذاتي بدون وجود اتصال بقاعدة البيانات لتفادي الـ Crash
        activeBets.push({ userId, slot, amount });
        broadcastState();
        return res.json({ success: true, message: "تم قبول الرهان بنجاح (وضع التجربة بدون قاعدة بيانات)" });
    }

    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("المستخدم غير موجود في قاعدة البيانات");
            }

            const currentBalance = userDoc.data()?.coins || 0; 
            if (currentBalance < amount) {
                throw new Error("رصيدك الحالي غير كافٍ للمراهنة");
            }

            const newBalance = currentBalance - amount;
            transaction.update(userRef, { coins: newBalance });

            const profitCut = Math.floor(amount * 0.10);
            const poolAddition = amount - profitCut;

            platformProfit += profitCut;
            systemPool += poolAddition;
        });

        // تسجيل الرهان في الذاكرة لتوزيع الأرباح للفائزين عند انتهاء الجولة
        activeBets.push({ userId, slot, amount });
        console.log(`📥 [BET REGISTERED] اللاعب ${userId} راهن بـ ${amount} على ${slot}`);
        
        broadcastState();

        return res.json({ success: true, message: "تم قبول الرهان وخصمه بنجاح" });
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

// 7. تعريف مسارات البث المباشر (SSE) الاحتياطية لتجنب خطأ الـ 404 تماماً في الـ Webview
const handleStream = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    // إرسال الحالة الحالية فور الاتصال
    const state = getGameState();
    res.write(`data: ${JSON.stringify({ type: 'game_state', data: state })}\n\n`);

    req.on('close', () => {
        sseClients.delete(res);
    });
};

// دعم جميع المسارات الممكنة لمنع الـ 404 في اللعبة تماماً بالتوازي
app.get('/api/stream', handleStream);
app.get('/api/game/stream', handleStream);
app.get('/stream', handleStream);

// 8. روابط لوحة تحكم المسؤول (Admin Dashboard) لمتابعة الأرباح حياً
app.get('/api/admin/dashboard', (req, res) => {
    res.json({
        systemPool,
        platformProfit,
        activeUsers: io.engine.clientsCount,
        history: roundHistory,
        activeBets
    });
});

app.post('/api/admin/inject', (req, res) => {
    const { amount } = req.body;
    if (amount && amount > 0) {
        systemPool += amount;
        return res.json({ success: true, systemPool });
    }
    return res.status(400).json({ error: "قيمة الشحن غير صحيحة" });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 سيرفر اللعبة المالي يعمل أونلاين على المنفذ ${PORT}`);
    startNewRound();
});
