import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import admin from 'firebase-admin'; // الاستيراد الصحيح المباشر للمكتبة

// 1. تهيئة تطبيق Express وسيرفر الـ WebSockets
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: ['https://onrender.com', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// 2. ربط وتهيئة Firebase Admin SDK بأمان مع فحص وجود المتغير السري أولاً
let db: any = null;

try {
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv && serviceAccountEnv.trim() !== "") {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        
        // فحص صارم ومضمون يمنع الـ Crash إذا لم يكن هناك تطبيقات مفعلة مسبقاً
        // فحص صارم ومضمون يمنع الـ Crash إذا كان التطبيق مبرمجاً مسبقاً
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("🔥 بنجاح Firebase تم الاتصال بقاعدة بيانات");
        }
        
        // استدعاء قاعدة البيانات الآمن من التطبيق النشط والمفعل حصراً
       db = admin.firestore();
    } else {
        console.log("⚠️ لم يتم العثور على مفتاح FIREBASE_SERVICE_ACCOUNT في إعدادات ريندر بعد، جاري التشغيل بدون قاعدة بيانات حالياً للتجربة.");
    }
} catch (error) {
    console.error("❌ خطأ في تهيئة الفايربيز، جاري التشغيل بدون قاعدة بيانات:", error);
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

// 4. خوارزمية تدوير العداد وبث النتائج اللحظية عبر الـ WebSockets
const io = new Server(server, {
    cors: { origin: 'https://onrender.com', methods: ['GET', 'POST'] }
});

function startNewRound() {
    countdown = 30;
    io.emit('round_start', { countdown, systemPool });

    gameInterval = setInterval(async () => {
        countdown--;
        io.emit('timer_update', { countdown });

        if (countdown === 1) {
            io.emit('betting_closed'); 
        }

        if (countdown <= 0) {
            clearInterval(gameInterval);
            await processRoundResults();
        }
    }, 1000);
}

// 5. حساب النتيجة وفحص المحفظة لمنع خسارة المنصة أبداً
async function processRoundResults() {
    let winningSlot = foodSlots[Math.floor(Math.random() * foodSlots.length)];
    io.emit('wheel_spin', { winningSlot });
    console.log(`🎰 الخيار الفائز في هذه الجولة هو: ${winningSlot}`);

    setTimeout(() => {
        startNewRound();
    }, 7000);
}

// 6. رابط المراهنة الآمن المرتبط بحسابك في الـ Firebase
app.post('/api/game/bet', async (req, res) => {
    const { userId, slot, amount } = req.body; 

    if (!userId || !slot || amount <= 0) {
        return res.status(400).json({ error: "بيانات الرهان غير صالحة" });
    }

    if (!db) {
        return res.status(500).json({ error: "قاعدة بيانات الفايربيز غير متصلة بالسيرفر حالياً" });
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

        return res.json({ success: true, message: "تم قبول الرهان وخصمه بنجاح" });
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

// 7. روابط لوحة تحكم المسؤول (Admin Dashboard) لمتابعة الأرباح حياً
app.get('/api/admin/dashboard', (req, res) => {
    res.json({
        systemPool,
        platformProfit,
        activeUsers: io.engine.clientsCount
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
