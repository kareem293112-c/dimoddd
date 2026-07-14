import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const app = express();
const httpServer = createHttpServer(app);

// 1. إعداد الـ CORS لضمان قبول الاتصالات من النطاق الصحيح https://wif.onrender.com بدون حظر
const allowedOrigins = [
  'https://wif.onrender.com',
  'https://sada-alarab.onrender.com',
  'https://onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://ais-dev-qts7zckbddelnrwnra7g7o-150385904306.europe-west2.run.app',
  'https://ais-pre-qts7zckbddelnrwnra7g7o-150385904306.europe-west2.run.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(null, true); 
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-userid'],
  credentials: true
}));

app.use(express.json());

// 2. تهيئة ذكية وآمنة لقاعدة بيانات الفايربيز تدعم السيرفر على Render والتطوير المحلي
let dbInstance: admin.firestore.Firestore | null = null;

function getDb(): admin.firestore.Firestore | null {
  if (dbInstance) return dbInstance;

  const projectId = "gen-lang-client-0348881645";
  const databaseId = "ai-studio-sadaalarabvoiceb-5f452604-580f-4265-ab18-da9c404b3698";

  // الفحص الأول: قراءة المفتاح من ملف الأسرار على ريندر إن وجد
  const keyPath = '/etc/secrets/firebase-key.json';
  if (fs.existsSync(keyPath)) {
    try {
      const keyContent = fs.readFileSync(keyPath, 'utf8');
      if (keyContent && keyContent.trim()) {
        const serviceAccount = JSON.parse(keyContent.trim());
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId
          });
        }
        const firestoreInstance = admin.firestore();
        firestoreInstance.settings({ databaseId });
        dbInstance = firestoreInstance;
        console.log("🔥 [FIREBASE] تم الاتصال بقاعدة البيانات عبر ملف حساب الخدمة بنجاح");
        return dbInstance;
      }
    } catch (err: any) {
      console.error("❌ [FIREBASE ERROR] فشلت التهيئة عبر الملف المرفوع:", err.message);
    }
  }

  // الفحص الثاني: قراءة المفتاح من متغير البيئة النصي
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar && serviceAccountVar.trim()) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar.trim());
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId
        });
      }
      const firestoreInstance = admin.firestore();
      firestoreInstance.settings({ databaseId });
      dbInstance = firestoreInstance;
      console.log("🔥 [FIREBASE] تم الاتصال بقاعدة البيانات عبر متغير البيئة بنجاح");
      return dbInstance;
    } catch (err: any) {
      console.error("❌ [FIREBASE ERROR] فشلت التهيئة عبر متغير البيئة:", err.message);
    }
  }

  // وضع التطوير/الاحتياطي لمنع الانهيار
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: projectId
      });
    }
    const firestoreInstance = admin.firestore();
    firestoreInstance.settings({ databaseId });
    dbInstance = firestoreInstance;
    console.log("⚠️ [FIREBASE] تم التشغيل بدون ملف مفاتيح مع قاعدة البيانات المحددة");
    return dbInstance;
  } catch (err: any) {
    console.error("❌ [FIREBASE ERROR] فشل التشغيل الاحتياطي:", err.message);
    return null;
  }
}

// تشغيل الفحص الأولي لقاعدة البيانات عند بدء السيرفر
try {
  getDb();
} catch (e) {}

// 3. متغيرات نظام المحفظة والخيارات الـ 8 المحددة لعجلة الحظ
let systemPool = 500000;
let platformProfit = 0;

interface Bet {
  userId: string;
  optionId: string;
  amount: number;
}

interface RoundHistory {
  roundId: string;
  winningOption: string;
  multiplier: number;
  timestamp: string;
}

let gameRound = {
  id: Date.now().toString(),
  phase: 'betting' as 'betting' | 'spinning' | 'result',
  countdown: 30, // العداد التنازلي المالي يبدأ من 30 ثانية
  winningOption: null as string | null,
  activeBets: [] as Bet[],
};

let roundHistory: RoundHistory[] = [];

// الخيارات المطابقة تماماً لتصميم العجلة في الفرونت إند مع الأوزان الرياضية
const multiplierOptions = [
  { id: 'chicken', name: '🍗 فرخ', multiplier: 45, weight: 2 },
  { id: 'pizza', name: '🍕 بيتزا', multiplier: 15, weight: 6 },
  { id: 'sushi', name: '🍣 سوشي', multiplier: 25, weight: 4 },
  { id: 'cake', name: '🍰 كيك', multiplier: 5, weight: 20 },
  { id: 'watermelon', name: '🍉 بطيخ', multiplier: 5, weight: 20 },
  { id: 'meat', name: '🥩 ستيك', multiplier: 5, weight: 20 },
  { id: 'burger', name: '🍔 برجر', multiplier: 10, weight: 10 },
  { id: 'salad', name: '🥗 سلطة', multiplier: 5, weight: 20 },
];

const multipliers: { [key: string]: number } = {
  chicken: 45, pizza: 15, sushi: 25, cake: 5, watermelon: 5, meat: 5, burger: 10, salad: 5
};

// 4. البث اللحظي عبر SSE، WebSockets، و Socket.io لضمان تغطية كل بروتوكولات العميل
const sseClients = new Set<any>();
let wss: WebSocketServer | null = null;
let io: SocketIOServer | null = null;

function getGameStatePayload() {
  const currentTotalBets = gameRound.activeBets.reduce((sum, b) => sum + b.amount, 0);
  return {
    roundId: gameRound.id,
    phase: gameRound.phase,
    countdown: gameRound.countdown,
    winningOption: gameRound.winningOption,
    winningSlot: gameRound.winningOption,
    history: roundHistory,
    totalBets: currentTotalBets,
    systemPool,
    platformProfit,
    options: multiplierOptions.map(o => ({ id: o.id, name: o.name, multiplier: o.multiplier }))
  };
}

function broadcastGameState() {
  const statePayload = getGameStatePayload();
  
  // دمج الهيكلين (المغلف والمباشر) في كائن واحد متوافق لتفادي خطأ find()
  const ssePayload = JSON.stringify({
    ...statePayload,
    type: 'game_state',
    data: statePayload
  });

  // بث إلى مشتركي الـ SSE
  for (const res of sseClients) {
    try {
      res.write(`data: ${ssePayload}\n\n`);
    } catch (err) {
      sseClients.delete(res);
    }
  }

  // بث إلى الـ WebSockets العادية
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(ssePayload);
        } catch (err) {
          console.error("WS Broadcast error:", err);
        }
      }
    });
  }

  // بث إلى الـ Socket.io المالي
  if (io) {
    io.emit('game_state', statePayload);
    
    if (gameRound.phase === 'betting') {
      io.emit('timer_update', { countdown: gameRound.countdown });
    } else if (gameRound.phase === 'spinning') {
      io.emit('wheel_spin', { winningSlot: gameRound.winningOption });
    }
  }
}

// 5. توزيع الأرباح الآمن من خلال العمليات التبادلية للفايربيز
async function processPayouts() {
  const winningOption = gameRound.winningOption;
  if (!winningOption) return;

  const currentOpt = multiplierOptions.find(o => o.id === winningOption);
  const multiplier = currentOpt?.multiplier || multipliers[winningOption] || 1;

  const winners = gameRound.activeBets.filter(b => b.optionId === winningOption);
  console.log(`🎰 [RESULT] الخيار الفائز: ${winningOption}. عدد الفائزين: ${winners.length}`);

  const db = getDb();
  if (!db) {
    console.error("⚠️ [PAYOUTS] قاعدة البيانات غير جاهزة لتسوية الأرباح.");
    return;
  }

  for (const bet of winners) {
    try {
      const userRef = db.collection('users').doc(bet.userId);
      const reward = bet.amount * multiplier;

      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          console.error(`User ${bet.userId} not found during payout.`);
          return;
        }

        const currentCoins = userDoc.data()?.coins || 0;
        const newCoins = currentCoins + reward;

        const currentXp = userDoc.data()?.xp || 0;
        const newXp = currentXp + Math.floor(reward * 0.1);

        transaction.update(userRef, {
          coins: newCoins,
          xp: newXp
        });

        console.log(`[PAYOUT] تم شحن حساب ${bet.userId} بـ ${reward} كوينز.`);
      });
    } catch (err: any) {
      console.error(`[PAYOUT ERROR] فشل الدفع للمستخدم ${bet.userId}:`, err.message);
    }
  }
}

// 6. تدوير العجلة ونظام الجولات التلقائي المستقر
setInterval(async () => {
  if (gameRound.phase === 'betting') {
    gameRound.countdown--;
    
    if (gameRound.countdown === 1 && io) {
      io.emit('betting_closed');
    }

    if (gameRound.countdown <= 0) {
      gameRound.phase = 'spinning';
      gameRound.countdown = 5; // 5 ثواني دوران العجلة

      // خوارزمية تدوير ذكية وموزونة لاختيار الفائز
      const totalWeight = multiplierOptions.reduce((sum, opt) => sum + opt.weight, 0);
      let randomValue = Math.random() * totalWeight;
      let selectedOption = multiplierOptions[0];

      for (const opt of multiplierOptions) {
        randomValue -= opt.weight;
        if (randomValue <= 0) {
          selectedOption = opt;
          break;
        }
      }

      gameRound.winningOption = selectedOption.id;
      console.log(`🎰 [SPIN] بدأت العجلة في الدوران! الفائز المحدد: ${selectedOption.id}`);
      
      if (io) {
        io.emit('wheel_spin', { winningSlot: selectedOption.id });
      }
      broadcastGameState();
    } else {
      broadcastGameState();
    }
  } else if (gameRound.phase === 'spinning') {
    gameRound.countdown--;
    if (gameRound.countdown <= 0) {
      gameRound.phase = 'result';
      gameRound.countdown = 5; // 5 ثواني عرض النتيجة

      await processPayouts();

      const winningOptObj = multiplierOptions.find(o => o.id === gameRound.winningOption);
      roundHistory.unshift({
        roundId: gameRound.id,
        winningOption: gameRound.winningOption || 'pizza',
        multiplier: winningOptObj?.multiplier || 5,
        timestamp: new Date().toISOString(),
      });

      if (roundHistory.length > 30) {
        roundHistory.pop();
      }

      broadcastGameState();
    } else {
      broadcastGameState();
    }
  } else if (gameRound.phase === 'result') {
    gameRound.countdown--;
    if (gameRound.countdown <= 0) {
      gameRound = {
        id: Date.now().toString(),
        phase: 'betting',
        countdown: 30,
        winningOption: null,
        activeBets: [],
      };
      console.log(`🔄 [ROUND] بداية جولة جديدة برقم: ${gameRound.id}`);
      if (io) {
        io.emit('round_start', { countdown: 30, systemPool });
      }
      broadcastGameState();
    } else {
      broadcastGameState();
    }
  }
}, 1000);

// 7. استقبال الرهانات الآمن (يدعم الحقلين slot و optionId للتوافق الكامل)
const placeBetHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { userId, slot, optionId, amount } = req.body;
    const targetOption = slot || optionId;

    if (!userId || !targetOption || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: "بيانات الرهان غير صالحة" });
      return;
    }

    if (gameRound.phase !== 'betting') {
      res.status(400).json({ error: "المراهنة مغلقة حالياً للجولة الحالية!" });
      return;
    }

    const validOption = multiplierOptions.find(o => o.id === targetOption);
    if (!validOption) {
      res.status(400).json({ error: "الخيار المختار غير صالح" });
      return;
    }

    const db = getDb();
    if (!db) {
      res.status(500).json({ error: "قاعدة بيانات الفايربيز غير متصلة بالسيرفر حالياً" });
      return;
    }

    const userRef = db.collection('users').doc(userId);
    let finalCoins = 0;

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("المستخدم غير موجود في قاعدة البيانات");
      }

      const currentCoins = userDoc.data()?.coins || 0;
      if (currentCoins < amount) {
        throw new Error("رصيدك الحالي غير كافٍ للمراهنة");
      }

      finalCoins = currentCoins - amount;
      transaction.update(userRef, { coins: finalCoins });

      const profitCut = Math.floor(amount * 0.10);
      const poolAddition = amount - profitCut;

      platformProfit += profitCut;
      systemPool += poolAddition;
    });

    gameRound.activeBets.push({ userId, optionId: targetOption, amount });
    console.log(`💸 [BET REGISTERED] خصم الرهان بنجاح: ${userId} بمقدار ${amount} على ${targetOption}`);

    broadcastGameState();

    res.json({
      success: true,
      message: "تم قبول الرهان وخصمه بنجاح",
      newBalance: finalCoins,
      roundId: gameRound.id
    });
  } catch (err: any) {
    console.error("❌ [BET ERROR]", err.message);
    res.status(400).json({ error: err.message });
  }
};

app.post('/api/placeBet', placeBetHandler);
app.post('/api/game/bet', placeBetHandler);

// 8. دعم بث الـ SSE للمسارين /api/stream و /api/game/stream لضمان عدم حدوث 404
const sseHandler = (req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  const statePayload = getGameStatePayload();
  const ssePayload = JSON.stringify({
    ...statePayload,
    type: 'game_state',
    data: statePayload
  });
  res.write(`data: ${ssePayload}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
};

app.get('/api/stream', sseHandler);
app.get('/api/game/stream', sseHandler);

app.get('/api/game/state', (req, res) => {
  res.json(getGameStatePayload());
});

// 9. لوحة تحكم المسؤول (Admin Dashboard)
app.get('/api/admin/dashboard', (req, res) => {
  res.json({
    systemPool,
    platformProfit,
    activeUsers: io ? io.engine.clientsCount : (wss ? wss.clients.size : 0),
    gameState: gameRound,
    history: roundHistory,
    config: multiplierOptions
  });
});

app.post('/api/admin/inject', (req, res) => {
  const { amount } = req.body;
  if (amount && amount > 0) {
    systemPool += amount;
    broadcastGameState();
    res.json({ success: true, systemPool });
  } else {
    res.status(400).json({ error: "قيمة الشحن غير صحيحة" });
  }
});

app.post('/api/admin/force-spin', (req, res) => {
  const { optionId } = req.body;
  if (gameRound.phase !== 'betting') {
    res.status(400).json({ error: "Cannot force spin when not in betting phase!" });
    return;
  }

  const validOption = multiplierOptions.find(o => o.id === optionId);
  if (!validOption) {
    res.status(400).json({ error: "Invalid force option id" });
    return;
  }

  gameRound.phase = 'spinning';
  gameRound.countdown = 5;
  gameRound.winningOption = optionId;
  console.log(`[ADMIN FORCE] forced winning option to: ${optionId}`);
  broadcastGameState();

  res.json({ success: true, message: `Forced spin result to ${optionId}` });
});

// تفعيل محرك Socket.io
io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('[SOCKET.IO] متصل الآن:', socket.id);
  socket.emit('game_state', getGameStatePayload());

  socket.on('disconnect', () => {
    console.log('[SOCKET.IO] قطع الاتصال:', socket.id);
  });
});

// دعم WebSockets العادية كنسخة احتياطية
wss = new WebSocketServer({ server: httpServer, path: '/ws/game' });
wss.on('connection', (ws) => {
  console.log('[WS] متصل الآن');
  const payload = JSON.stringify({
    ...getGameStatePayload(),
    type: 'game_state',
    data: getGameStatePayload()
  });
  ws.send(payload);

  ws.on('close', () => {
    console.log('[WS] قطع الاتصال');
  });
});

// تهيئة تشغيل خادم تطوير Vite وخدمة الملفات الثابتة في بيئة الإنتاج
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SERVER] يعمل بامتياز الآن على المنفذ المخصص ${PORT}`);
  });
}

startServer();
