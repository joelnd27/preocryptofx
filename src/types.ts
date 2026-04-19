export type AccountType = 'DEMO' | 'REAL';
export type ChartType = 'LINE' | 'CANDLE' | 'HOLLOW' | 'AREA';
export type Timeframe = '1S' | '1M' | '15M' | '1H' | '4H' | '1D' | '1W';

export interface User {
  id: string;
  username: string;
  email: string;
  phone?: string;
  role: 'user' | 'marketer' | 'admin';
  demoBalance: number;
  realBalance: number;
  activeAccount: AccountType;
  verificationStatus: 'not_verified' | 'pending' | 'verified';
  verificationSubmittedAt?: number;
  verificationDocuments?: {
    idFront?: string;
    idBack?: string;
    kra?: string;
    drivingLicense?: string;
  };
  profit: number;
  dailyProfit: number;
  lastProfitResetDate?: string;
  trades: Trade[];
  transactions: Transaction[];
  bots: {
    scalping: boolean;
    trend: boolean;
    ai: boolean;
    custom: boolean;
  };
  customBotConfig?: {
    name: string;
    strategy: string;
    risk: string;
    currency: string;
    expiresAt: number;
  };
  botStats?: Record<string, { profit: number, trades: number }>;
  botLogs?: string[];
  createdAt: number;
}

export interface Trade {
  id: string;
  coin: string;
  amount: number;
  type: 'BUY' | 'SELL';
  price: number;
  status: 'OPEN' | 'CLOSED';
  profit: number;
  targetProfit?: number;
  timestamp: number;
  accountType: AccountType;
  duration?: number; // Duration in seconds
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'rejected';
  timestamp: number;
  accountType: AccountType;
  method?: string;
}

export interface CryptoPrice {
  symbol: string;
  name: string;
  price: number;
  change: number;
}

export const INITIAL_DEMO_BALANCE = 10000;
export const INITIAL_REAL_BALANCE = 0;
export const USD_TO_KES = 130;
export const WITHDRAWAL_EXCHANGE_RATE = 1;
export const MIN_DEPOSIT_USD = 17;
export const MIN_WITHDRAWAL_USD = 34;
export const MIN_STAKE_USD = 3;
export const MIN_BALANCE_AFTER_LOSS = 3;
export const MIN_BOT_STOP_BALANCE = 10;
export const MIN_MANUAL_STOP_BALANCE = 3;

export const CRYPTO_LIST = [
  { symbol: 'BTC', name: 'Bitcoin', basePrice: 65000 },
  { symbol: 'ETH', name: 'Ethereum', basePrice: 3500 },
  { symbol: 'USDT', name: 'Tether', basePrice: 1 },
  { symbol: 'BNB', name: 'BNB', basePrice: 580 },
  { symbol: 'SOL', name: 'Solana', basePrice: 145 },
  { symbol: 'XRP', name: 'XRP', basePrice: 0.62 },
  { symbol: 'ADA', name: 'Cardano', basePrice: 0.45 },
  { symbol: 'DOGE', name: 'Dogecoin', basePrice: 0.16 },
  { symbol: 'LTC', name: 'Litecoin', basePrice: 85 },
  { symbol: 'TRX', name: 'TRON', basePrice: 0.12 },
  { symbol: 'MATIC', name: 'Polygon', basePrice: 0.72 },
  { symbol: 'DOT', name: 'Polkadot', basePrice: 7.20 },
  { symbol: 'AVAX', name: 'Avalanche', basePrice: 38 },
  { symbol: 'SHIB', name: 'Shiba Inu', basePrice: 0.000027 },
  { symbol: 'LINK', name: 'Chainlink', basePrice: 18 },
  { symbol: 'ATOM', name: 'Cosmos', basePrice: 9.50 },
  { symbol: 'XMR', name: 'Monero', basePrice: 130 },
  { symbol: 'BCH', name: 'Bitcoin Cash', basePrice: 480 },
  { symbol: 'ETC', name: 'Ethereum Classic', basePrice: 32 },
  { symbol: 'FIL', name: 'Filecoin', basePrice: 9 },
];
