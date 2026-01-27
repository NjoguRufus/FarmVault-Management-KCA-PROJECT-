import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Leaf, ShieldCheck, BarChart3 } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-background to-background flex items-center justify-center px-4">
      <div className="max-w-5xl w-full grid gap-10 md:grid-cols-[1.3fr,1fr] items-center">
        {/* Left - Marketing copy */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/40 border border-emerald-500/40 px-3 py-1 text-xs text-emerald-100">
            <Leaf className="h-3 w-3" />
            Smart farm management for serious growers
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-emerald-50">
            Turn your fields into a
            <span className="text-fv-gold ml-2">live dashboard</span>.
          </h1>

          <p className="text-sm md:text-base text-emerald-100/80 leading-relaxed max-w-xl">
            FarmVault brings all your projects, operations, expenses, teams and harvest data into
            one clean dashboard. Built for agribusinesses that need real-time visibility, not
            spreadsheets.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/login"
              className="fv-btn fv-btn--primary inline-flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              Go to dashboard
            </Link>
            <a
              href="#features"
              className="fv-btn fv-btn--secondary inline-flex items-center gap-2"
            >
              Learn more
            </a>
          </div>

          <div id="features" className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs">
            <div className="fv-card bg-emerald-950/40 border-emerald-800/60">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-3 w-3 text-fv-gold" />
                <span className="font-medium text-emerald-50">Project tracking</span>
              </div>
              <p className="text-emerald-100/80">
                Follow every crop from planning to harvest with clear budgets and timelines.
              </p>
            </div>
            <div className="fv-card bg-emerald-950/40 border-emerald-800/60">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-3 w-3 text-fv-success" />
                <span className="font-medium text-emerald-50">Costs under control</span>
              </div>
              <p className="text-emerald-100/80">
                Capture expenses, inventory and supplier data in seconds, not hours.
              </p>
            </div>
            <div className="fv-card bg-emerald-950/40 border-emerald-800/60">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="font-medium text-emerald-50">Yield & sales insight</span>
              </div>
              <p className="text-emerald-100/80">
                See how harvests convert into sales and profit across seasons.
              </p>
            </div>
          </div>
        </div>

        {/* Right - Card with logo */}
        <div className="hidden md:block">
          <div className="fv-card bg-card/90 backdrop-blur-xl border border-emerald-800/70 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-16 w-auto rounded-lg object-contain"
              />
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Built on Firebase and React, FarmVault keeps your agribusiness data secure,
                real-time, and accessible from anywhere.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
