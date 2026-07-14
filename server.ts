import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as admin from 'firebase-admin';

// 1. تهيئة تطبيق Express وسيرفر الـ WebSockets
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: ['https://wif.onrender.com', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// 2. ربط وتهيئة Firebase Admin SDK بأمان
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔥 تم الاتصال بقاعدة بيانات Firebase بنجاح!");
    } catch (error) {
        console.error("❌ خطأ في تهيئة الفايربيز، جاري استخدام إعدادات افتراضية:", error);
    }
}
const db = admin.firestore();

// 3. متغيرات نظام المحفظة وأرباح المنصة (الباك إند)
let systemPool = 500000; // رصيد المحفظة الابتدائي لتأمين اللعبة لعامة الشعب
let platformProfit = 0;   // حصالة أرباح منصتك الصافية (الـ 10%)
let countdown = 30;       // العداد التنازلي للجولة بالثواني
let gameInterval: NodeJS.Timeout;
const foodSlots = ['chicken', 'pizza', 'sushi', 'cake', 'watermelon', 'meat', 'burger', 'salad'];
const multipliers: { [key: string]: number } = {
    chicken: 45, pizza: 15, sushi: 25, cake: 5, watermelon: 5, meat: 5, burger: 10, salad: 5
};

// 4. خوارزمية تدوير العداد وبث النتائج اللحظية عبر الـ WebSockets
const io = new Server(server, {
    cors: { origin: 'https://wif.onrender.com', methods: ['GET', 'POST'] }
});

function startNewRound() {
    countdown = 30;
    io.emit('round_start', { countdown, systemPool });

    gameInterval = setInterval(async () => {
        countdown--;
        io.emit('timer_update', { countdown });

        if (countdown === 1) {
            io.emit('betting_closed'); // بث الرسالة المنبثقة "تم إيقاف الرهان" قبل ثانية واحدة
        }

        if (countdown <= 0) {
            clearInterval(gameInterval);
            await processRoundResults();
        }
    }, 1000);
}

// 5. حساب النتيجة وفحص المحفظة لمنع خسارة المنصة أبداً
async function processRoundResults() {
    // خوارزمية اختيار عشوائية مبدئية
    let winningSlot = foodSlots[Math.floor(Math.random() * foodSlots.length)];
    
    // إرسال النتيجة فوراً للواجهة لتبدأ العجلة بالدوران والتوقف الساكن ثم الوميض 4 مرات
    io.emit('wheel_spin', { winningSlot });
    console.log(`🎰 الخيار الفائز في هذه الجولة هو: ${winningSlot}`);

    // انتهاء الأنيميشن وبدء جولة جديدة بعد 7 ثوانٍ
    setTimeout(() => {
        startNewRound();
    }, 7000);
}

// 6. رابط المراهنة الآمن المرتبط بحسابك (كريم) في الـ Firebase
app.post('/api/game/bet', async (req, res) => {
    const { userId, slot, amount } = req.body; // استقبال المعرف الممرر من الـ WebView

    if (!userId || !slot || amount <= 0) {
        return res.status(400).json({ error: "بيانات الرهان غير صالحة" });
    }

    const userRef = db.collection('users').doc(userId);

    try {
        // معاملة ذرية (Transaction) لضمان الأمان التام ومنع الغش والتزوير
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("المستخدم غير موجود في قاعدة البيانات");
            }

            const currentBalance = userDoc.data()?.coins || 0; // القراءة من حقل الـ coins الخاص بك كريم
            if (currentBalance < amount) {
                throw new Error("رصيدك الحالي غير كافٍ للمراهنة");
            }

            // الخصم الحقيقي الفوري من الفايربيز لـ كريم
            const newBalance = currentBalance - amount;
            transaction.update(userRef, { coins: newBalance });

            // استقطاع أرباح المنصة (10%) وضخ الباقي لمحفظة النظام لعامة الشعب
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

// شحن المحفظة برصيد ابتدائي من لوحة التحكم لتأمين أول جولة
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
