import React from 'react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background image (keep existing assets) */}
      <div className="absolute inset-0">
        {/* Mobile background */}
        <div
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.25)), url('/farm-backgroundmobile.jpg')`,
          }}
        />
        {/* Desktop background */}
        <div
          className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.1), rgba(230, 245, 233, 0.9)), url('/farm-background-desktop.jpg')`,
          }}
        />
        {/* Soft overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/40 to-white/70" />
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between">
        {/* Hero */}
        <div className="flex-1 flex items-center justify-center px-4 py-8 md:py-12">
          <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8 lg:gap-10 items-center">
            {/* Left: Logo + text + CTAs */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="flex justify-center lg:justify-start">
                <img
                  src="/Logo/FarmVault_Logo dark mode.png"
                  alt="FarmVault logo"
                  className="h-24 w-auto sm:h-28 md:h-32 lg:h-36 object-contain drop-shadow-lg"
                />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#18412F] tracking-tight">
                  FarmVault
                </h1>
                <p className="text-sm sm:text-base text-[#24513B] font-medium">
                  A smart farm operations & decision system for modern agriculture
                </p>
                <p className="text-sm sm:text-base text-[#355E45] max-w-xl mx-auto lg:mx-0">
                  Plan, track, and manage farm projects, crop stages, labour,
                  inventory, expenses, and sales — all in one intelligent platform.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start pt-2">
                <Link
                  to="/setup-company"
                  className="inline-flex items-center justify-center rounded-full bg-[#2F7C3C] hover:bg-[#256433] text-white font-semibold px-10 py-3 text-sm sm:text-base shadow-lg hover:shadow-xl transition-transform transform hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-full bg-white/95 hover:bg-white text-[#24513B] font-semibold px-10 py-3 text-sm sm:text-base shadow-md hover:shadow-lg border border-[#C7DFC5]"
                >
                  Login
                </Link>
              </div>
            </div>

            {/* Right: image collage placeholder (keeps background vibe) */}
            <div className="hidden lg:flex justify-end">
              <div className="relative w-full max-w-md h-80 rounded-3xl bg-white/90 shadow-xl overflow-hidden border border-[#DEEFD9]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#E6F6E9,_transparent_60%),_radial-gradient(circle_at_bottom,_#FFF7E6,_transparent_60%)]" />
                <div className="relative h-full flex flex-col justify-between p-5">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#4A7B4F] uppercase tracking-wide">
                      Real-time field visibility
                    </p>
                    <p className="text-sm text-[#355E45]">
                      Track crop performance, sales and expenses for each season in one clean dashboard.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-[#355E45]">
                    <div className="rounded-2xl bg-white/90 shadow-sm p-3 border border-[#E3F1E4]">
                      <p className="font-semibold mb-1">Smart Farm Planning</p>
                      <p>Create projects by crop and season.</p>
                    </div>
                    <div className="rounded-2xl bg-white/90 shadow-sm p-3 border border-[#E3F1E4]">
                      <p className="font-semibold mb-1">Daily Operations</p>
                      <p>Log work, labour and inputs.</p>
                    </div>
                    <div className="rounded-2xl bg-white/90 shadow-sm p-3 border border-[#E3F1E4]">
                      <p className="font-semibold mb-1">Inventory & Expenses</p>
                      <p>Control stock and market costs.</p>
                    </div>
                    <div className="rounded-2xl bg-white/90 shadow-sm p-3 border border-[#E3F1E4]">
                      <p className="font-semibold mb-1">Data-Driven Insights</p>
                      <p>See margins and profitability.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom feature strip */}
        <div className="relative z-10 px-4 pb-6">
          <div className="max-w-5xl mx-auto bg-white/95 rounded-2xl shadow-md border border-[#D8E8D5] px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-xs sm:text-sm text-[#355E45]">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-8 w-8 rounded-full bg-[#E6F6E9] flex items-center justify-center text-lg">
                  🗺️
                </span>
                <div>
                  <p className="font-semibold">Smart Farm Planning</p>
                  <p className="text-xs sm:text-[0.72rem] text-[#5C7D5F]">
                    Create projects by crop and season.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-8 w-8 rounded-full bg-[#FFF4E0] flex items-center justify-center text-lg">
                  📋
                </span>
                <div>
                  <p className="font-semibold">Daily Operations Tracking</p>
                  <p className="text-xs sm:text-[0.72rem] text-[#5C7D5F]">
                    Log work, labour and field activities.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-8 w-8 rounded-full bg-[#E9F2FF] flex items-center justify-center text-lg">
                  📦
                </span>
                <div>
                  <p className="font-semibold">Inventory & Expense Control</p>
                  <p className="text-xs sm:text-[0.72rem] text-[#5C7D5F]">
                    Track inputs, expenses and restocking.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-8 w-8 rounded-full bg-[#F4E9FF] flex items-center justify-center text-lg">
                  📊
                </span>
                <div>
                  <p className="font-semibold">Data-Driven Insights</p>
                  <p className="text-xs sm:text-[0.72rem] text-[#5C7D5F]">
                    Generate reports and analytics.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
