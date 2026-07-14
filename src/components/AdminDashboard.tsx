import React, { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCcw, Coins, Users, Activity, Wallet, Plus, X, Trophy } from 'lucide-react';

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [injectAmount, setInjectAmount] = useState('10000');
  const [injecting, setInjecting] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch admin stats', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleInject = async () => {
    const amount = parseInt(injectAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    
    setInjecting(true);
    try {
      const res = await fetch('/api/admin/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        fetchStats();
      }
    } catch (e) {
      console.error('Failed to inject coins', e);
    }
    setInjecting(false);
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#070312]/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#13092b] border border-fuchsia-500/30 rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="bg-gradient-to-r from-fuchsia-900/50 to-[#13092b] p-4 flex items-center justify-between border-b border-fuchsia-500/20">
          <div className="flex items-center gap-2 text-fuchsia-400">
            <ShieldAlert size={20} />
            <h2 className="font-bold text-lg">Admin Control Panel</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Live Server Stats</h3>
            <button 
              onClick={fetchStats}
              disabled={loading}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* System Pool */}
            <div className="bg-[#1a0f35] rounded-xl p-3 border border-emerald-500/20 flex flex-col gap-1 relative overflow-hidden">
              <div className="absolute -right-2 -bottom-2 opacity-5 text-emerald-400">
                <Coins size={64} />
              </div>
              <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Wallet size={12} /> System Pool
              </span>
              <span className="text-xl font-bold text-white font-mono">
                {stats ? stats.systemPool.toLocaleString() : '---'}
              </span>
            </div>

            {/* Platform Profit */}
            <div className="bg-[#1a0f35] rounded-xl p-3 border border-amber-500/20 flex flex-col gap-1 relative overflow-hidden">
              <div className="absolute -right-2 -bottom-2 opacity-5 text-amber-400">
                <Trophy size={64} />
              </div>
              <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Activity size={12} /> Platform Profit
              </span>
              <span className="text-xl font-bold text-white font-mono">
                {stats ? stats.platformProfit.toLocaleString() : '---'}
              </span>
            </div>

            {/* Total Users */}
            <div className="bg-[#1a0f35] rounded-xl p-3 border border-indigo-500/20 flex flex-col gap-1">
              <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Users size={12} /> Active Users
              </span>
              <span className="text-xl font-bold text-white font-mono">
                {stats ? stats.totalUsers : '---'}
              </span>
            </div>

            {/* Total Rounds */}
            <div className="bg-[#1a0f35] rounded-xl p-3 border border-rose-500/20 flex flex-col gap-1">
              <span className="text-xs text-rose-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <RefreshCcw size={12} /> Total Rounds
              </span>
              <span className="text-xl font-bold text-white font-mono">
                {stats ? stats.totalRounds : '---'}
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Inject Seed Funds</h3>
            <div className="flex gap-2">
              <input
                type="number"
                value={injectAmount}
                onChange={(e) => setInjectAmount(e.target.value)}
                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-fuchsia-500/50"
                placeholder="Amount..."
              />
              <button
                onClick={handleInject}
                disabled={injecting}
                className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <Plus size={16} />
                Inject
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Directly adds coins to the System Pool to ensure liquidity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
