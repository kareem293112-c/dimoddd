import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GameState, FoodId, Bet, User, GameLog, FOODS } from './src/types.js';

const PORT = 3000;
const DB_PATH = path.join(process.cwd(), 'src', 'db', 'game_db.json');

// Memory DB cache
let db: {
  users: Record<string, User>;
  history: FoodId[];
  game_logs: GameLog[];
  systemPool: number;
  platformProfit: number;
} = {
  users: {},
  history: [],
  game_logs: [],
  systemPool: 100000,
  platformProfit: 0
};

// Load database
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const loadedDb = JSON.parse(data);
      db = { ...db, ...loadedDb };
      if (typeof db.systemPool !== 'number') db.systemPool = 100000;
      if (typeof db.platformProfit !== 'number') db.platformProfit = 0;
    } else {
      console.log('Database file not found. Initializing with defaults.');
    }
  } catch (error) {
    console.error('Error loading database:', error);
  }
}

// Save database
function saveDB() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Load DB on startup
loadDB();

// Global Game State
let currentRound = 1993;
let timer = 20; // Starts at 20 for betting
let phase: 'betting' | 'spinning' | 'result' = 'betting';
let activeBets: Bet[] = [];
let winningFood: FoodId | null = null;
let sseClients: { id: number; userId: string; res: any }[] = [];

// Helper to calculate totals
function getTotalsByFood(): Record<FoodId, number> {
  const totals: Record<FoodId, number> = {
    chicken: 0, sushi: 0, salad: 0, burger: 0,
    steak: 0, watermelon: 0, cake: 0, pizza: 0
  };
  activeBets.forEach(bet => {
    totals[bet.foodId] += bet.amount;
  });
  return totals;
}

// Broadcast game state to all connected clients
function broadcastState() {
  const totals = getTotalsByFood();
  
  sseClients.forEach(client => {
    // Calculate user specific bets
    const userBets: Record<FoodId, number> = {
      chicken: 0, sushi: 0, salad: 0, burger: 0,
      steak: 0, watermelon: 0, cake: 0, pizza: 0
    };
    activeBets.forEach(bet => {
      if (bet.userId === client.userId) {
        userBets[bet.foodId] += bet.amount;
      }
    });

    const payload = {
      round: currentRound,
      timer: timer,
      phase: phase,
      totalBets: totals,
      userBets: userBets, // Sent dynamically for this specific client
      winningFood: winningFood,
      history: db.history.slice(-15), // last 15 outcomes
      roomPlayers: Object.values(db.users),
      allBetsList: activeBets.slice(-20) // recent 20 bets to show flying chips
    };
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

// AI Game Brain: Determine winning slot based on System Pool rules
function calculateWinningSlot(): FoodId {
  const totals = getTotalsByFood();
  
  const allSlots: { foodId: FoodId; payout: number; affordable: boolean }[] = [];
  const affordableSlots: FoodId[] = [];

  const foodKeys = Object.keys(FOODS) as FoodId[];
  foodKeys.forEach(foodId => {
    const betAmount = totals[foodId] || 0;
    const multiplier = FOODS[foodId].multiplier;
    const payout = betAmount * multiplier;
    
    // Strict rule: check if systemPool can afford this payout
    const affordable = payout <= db.systemPool;
    allSlots.push({ foodId, payout, affordable });
    
    if (affordable) {
      affordableSlots.push(foodId);
    }
  });

  // Strict Validation: Forbid any winning symbol that exceeds the system pool
  if (affordableSlots.length > 0) {
    // RNG chooses randomly from strictly affordable options
    return affordableSlots[Math.floor(Math.random() * affordableSlots.length)];
  }

  // Edge Case: If absolutely no slot is affordable, pick the one with the lowest payout to minimize losses
  allSlots.sort((a, b) => a.payout - b.payout);
  return allSlots[0].foodId;
}

// Settle active bets, update wallets, save logs
function settleRound() {
  if (!winningFood) return;

  const totals = getTotalsByFood();
  const totalPool = Object.values(totals).reduce((sum, val) => sum + val, 0);
  let totalPayout = 0;

  const playerBetsSummary: any[] = [];

  // Update user balances based on the outcome
  activeBets.forEach(bet => {
    const isWinner = bet.foodId === winningFood;
    const multiplier = FOODS[winningFood!].multiplier;
    const payout = isWinner ? bet.amount * multiplier : 0;

    if (payout > 0) {
      if (db.users[bet.userId]) {
        db.users[bet.userId].balance += payout;
      }
      totalPayout += payout;
    }

    playerBetsSummary.push({
      userId: bet.userId,
      userName: bet.userName,
      foodId: bet.foodId,
      amount: bet.amount,
      payout: payout,
      isBot: !!bet.isBot
    });
  });

  // Deduct payout from system pool
  db.systemPool -= totalPayout;

  // Save history
  db.history.push(winningFood);
  if (db.history.length > 50) {
    db.history.shift();
  }

  // Create audit log
  const rtp = totalPool > 0 ? (totalPayout / totalPool) * 100 : 0;
  const newLog: GameLog = {
    round: currentRound,
    winningFood: winningFood,
    totalPool: totalPool,
    totalPayout: totalPayout,
    rtp: parseFloat(rtp.toFixed(2)),
    timestamp: new Date().toISOString(),
    playerBets: playerBetsSummary
  };

  db.game_logs.push(newLog);
  if (db.game_logs.length > 100) {
    db.game_logs.shift();
  }

  // Refresh bot balances slightly if they go low so they can keep playing
  Object.keys(db.users).forEach(id => {
    const user = db.users[id];
    if (user.isBot && user.balance < 5000) {
      user.balance += 50000; // recharge bot
    }
  });

  saveDB();
}

// Bot betting simulator: runs periodically during betting phase
function triggerBotBets() {
  // Get bot users
  const botUsers = Object.values(db.users).filter(u => u.isBot);
  if (botUsers.length === 0) return;

  // Decide how many bots bet in this tick
  const numBets = Math.floor(Math.random() * 3); // 0, 1, or 2 bets
  const chips = [10, 100, 1000, 10000];
  const foods = Object.keys(FOODS) as FoodId[];

  for (let i = 0; i < numBets; i++) {
    const bot = botUsers[Math.floor(Math.random() * botUsers.length)];
    const foodId = foods[Math.floor(Math.random() * foods.length)];
    // Choose chip size based on bot's remaining balance
    const availableChips = chips.filter(c => c <= bot.balance);
    if (availableChips.length === 0) continue;
    
    // Pick a chip size (high chips have lower probability for bots to make it look realistic)
    let chipIndex = 0;
    const r = Math.random();
    if (r > 0.9 && availableChips.includes(10000)) chipIndex = availableChips.indexOf(10000);
    else if (r > 0.6 && availableChips.includes(1000)) chipIndex = availableChips.indexOf(1000);
    else if (r > 0.3 && availableChips.includes(100)) chipIndex = availableChips.indexOf(100);
    
    const amount = availableChips[chipIndex];

    // Deduct bot balance
    bot.balance -= amount;
    
    // Process pool & profit allocation
    const profitCut = amount * 0.1;
    const poolCut = amount - profitCut;
    db.platformProfit += profitCut;
    db.systemPool += poolCut;
    
    // Add bet
    activeBets.push({
      id: `bot_bet_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: bot.id,
      userName: bot.name,
      foodId: foodId,
      amount: amount,
      isBot: true
    });
  }
}

// Primary Game Loop
setInterval(() => {
  if (timer > 0) {
    timer--;
  }

  if (phase === 'betting') {
    // Generate synthetic bot bets if betting phase is active
    if (timer > 1 && Math.random() > 0.3) {
      triggerBotBets();
    }
    
    if (timer === 0) {
      // Transition to spinning phase: calculate outcome and lock bets
      phase = 'spinning';
      timer = 6;
      winningFood = calculateWinningSlot();
      settleRound();
    }
  } else if (phase === 'spinning') {
    if (timer === 0) {
      phase = 'result';
      timer = 4;
    }
  } else if (phase === 'result') {
    if (timer === 0) {
      // Reset for next round
      phase = 'betting';
      timer = 20;
      currentRound++;
      activeBets = [];
      winningFood = null;
    }
  }

  broadcastState();
}, 1000);

async function startServer() {
  const app = express();
  app.use(express.json());

  // API endpoints
  
  // Stream game state in real time via SSE
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = (req.query.userId as string) || 'user_me';

    // Send initial configuration and state
    const totals = getTotalsByFood();
    const userBets: Record<FoodId, number> = {
      chicken: 0, sushi: 0, salad: 0, burger: 0,
      steak: 0, watermelon: 0, cake: 0, pizza: 0
    };
    activeBets.forEach(bet => {
      if (bet.userId === userId) {
        userBets[bet.foodId] += bet.amount;
      }
    });

    const payload = {
      round: currentRound,
      timer: timer,
      phase: phase,
      totalBets: totals,
      userBets: userBets, // Sent dynamically for this specific client
      winningFood: winningFood,
      history: db.history.slice(-15),
      roomPlayers: Object.values(db.users),
      allBetsList: activeBets.slice(-20)
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

    const clientId = Date.now();
    const client = { id: clientId, userId, res };
    sseClients.push(client);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
  });

  // Place a bet
  app.post('/api/bet', (req, res) => {
    const { userId, foodId, amount } = req.body;

    if (phase !== 'betting') {
      return res.status(400).json({ error: 'المراهنات مغلقة حالياً، انتظر الجولة القادمة.' });
    }

    if (timer <= 1) {
      return res.status(400).json({ error: 'انتهى وقت المراهنة!' });
    }

    const user = db.users[userId];
    if (!user) {
      return res.status(404).json({ error: 'لم يتم العثور على المستخدم.' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ error: 'رصيدك غير كافٍ لإجراء هذا الرهان!' });
    }

    // Process transaction securely
    user.balance -= amount;
    
    // Allocate to system pool and platform profit
    const profitCut = amount * 0.1;
    const poolCut = amount - profitCut;
    db.platformProfit += profitCut;
    db.systemPool += poolCut;
    
    const newBet: Bet = {
      id: `bet_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: user.id,
      userName: user.name,
      foodId: foodId as FoodId,
      amount: amount
    };

    activeBets.push(newBet);
    saveDB();
    broadcastState();

    res.json({ success: true, balance: user.balance });
  });

  // Top up / Add balance (great for testing)
  app.post('/api/add-balance', (req, res) => {
    const { userId, amount } = req.body;
    const user = db.users[userId];
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    user.balance += amount || 5000;
    saveDB();
    broadcastState();

    res.json({ success: true, balance: user.balance });
  });

  // Admin inject coins to system pool
  app.post('/api/admin/inject', (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    db.systemPool += amount;
    saveDB();
    res.json({ success: true, systemPool: db.systemPool });
  });

  // Get game audit logs & stats
  app.get('/api/logs', (req, res) => {
    res.json({
      logs: db.game_logs.slice(-20).reverse(), // last 20 game records
      totalRounds: db.game_logs.length,
      history: db.history
    });
  });

  // Get admin dashboard stats
  app.get('/api/admin/dashboard', (req, res) => {
    // Basic security: In a real app, require admin auth token here.
    res.json({
      success: true,
      systemPool: db.systemPool,
      platformProfit: db.platformProfit,
      totalUsers: Object.keys(db.users).length,
      totalRounds: db.game_logs.length
    });
  });

  // Serve static UI or mount Vite
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Food Wheel Server listening on http://localhost:${PORT}`);
  });
}

startServer();
