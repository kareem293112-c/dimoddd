export type FoodId = 'chicken' | 'sushi' | 'salad' | 'burger' | 'cake' | 'watermelon' | 'pizza' | 'steak';

export interface FoodItem {
  id: FoodId;
  nameAr: string;
  nameEn: string;
  multiplier: number;
  color: string;
  textColor: string;
  angle: number; // calculated for wheel position
  icon: string; // Emoji representing the food
}

export const FOODS: Record<FoodId, FoodItem> = {
  chicken: { id: 'chicken', nameAr: 'فروج', nameEn: 'Chicken', multiplier: 45, color: '#f97316', textColor: '#ffffff', angle: 0, icon: '🍗' },
  sushi: { id: 'sushi', nameAr: 'سوشي', nameEn: 'Sushi', multiplier: 25, color: '#ec4899', textColor: '#ffffff', angle: Math.PI / 4, icon: '🍣' },
  salad: { id: 'salad', nameAr: 'سلطة', nameEn: 'Salad', multiplier: 5, color: '#22c55e', textColor: '#ffffff', angle: Math.PI / 2, icon: '🥗' },
  burger: { id: 'burger', nameAr: 'برجر', nameEn: 'Burger', multiplier: 10, color: '#eab308', textColor: '#1e293b', angle: (3 * Math.PI) / 4, icon: '🍔' },
  steak: { id: 'steak', nameAr: 'ستيك', nameEn: 'Steak', multiplier: 5, color: '#ef4444', textColor: '#ffffff', angle: Math.PI, icon: '🥩' },
  watermelon: { id: 'watermelon', nameAr: 'بطيخ', nameEn: 'Watermelon', multiplier: 5, color: '#10b981', textColor: '#ffffff', angle: (5 * Math.PI) / 4, icon: '🍉' },
  cake: { id: 'cake', nameAr: 'كيك', nameEn: 'Cake', multiplier: 5, color: '#a855f7', textColor: '#ffffff', angle: (6 * Math.PI) / 4, icon: '🍰' },
  pizza: { id: 'pizza', nameAr: 'بيتزا', nameEn: 'Pizza', multiplier: 15, color: '#ea580c', textColor: '#ffffff', angle: (7 * Math.PI) / 4, icon: '🍕' }
};

export interface User {
  id: string;
  name: string;
  balance: number;
  avatar: string;
  isBot?: boolean;
}

export interface Bet {
  id: string;
  userId: string;
  userName: string;
  foodId: FoodId;
  amount: number;
  isBot?: boolean;
}

export interface GameState {
  round: number;
  timer: number; // 0 to 30
  phase: 'betting' | 'spinning' | 'result';
  totalBets: Record<FoodId, number>;
  userBets: Record<FoodId, number>;
  winningFood: FoodId | null;
  history: FoodId[];
  roomPlayers: User[];
  allBetsList: Bet[]; // list of recent bets for animation
}

export interface GameLog {
  round: number;
  winningFood: FoodId;
  totalPool: number;
  totalPayout: number;
  rtp: number;
  timestamp: string;
  playerBets: {
    userId: string;
    userName: string;
    foodId: FoodId;
    amount: number;
    payout: number;
    isBot: boolean;
  }[];
}
