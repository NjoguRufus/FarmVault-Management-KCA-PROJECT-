import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect when authenticated (handles both initial load and after login)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    setLoading(false);

    // Role-based default landing route after login
    const employeeRole = (user as any).employeeRole as string | undefined;

    // Company admin → company dashboard
    if (user.role === 'company-admin' || user.role === ('company_admin' as any)) {
      navigate('/dashboard', { replace: true });
      return;
    }

    // Developer → admin area
    if (user.role === 'developer') {
      navigate('/admin', { replace: true });
      return;
    }

    // Manager (platform role or employeeRole) → manager dashboard
    if (
      user.role === 'manager' ||
      employeeRole === 'manager' ||
      employeeRole === 'operations-manager'
    ) {
      navigate('/manager', { replace: true });
      return;
    }

    // Broker → broker dashboard
    if (user.role === 'broker' || employeeRole === 'sales-broker' || employeeRole === 'broker') {
      navigate('/broker', { replace: true });
      return;
    }

    // Driver → driver dashboard
    if (employeeRole === 'logistics-driver' || employeeRole === 'driver') {
      navigate('/driver', { replace: true });
      return;
    }

    // Fallback: previously intended route or projects list
    navigate(from || '/projects', { replace: true });
  }, [isAuthenticated, user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Navigation will happen via useEffect when isAuthenticated becomes true
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Farm Background Image with Overlay - Responsive */}
      <div className="absolute inset-0">
        {/* Mobile background (default) */}
        <div 
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-backgroundmobile.jpg')`,
          }}
        />
        {/* Desktop background */}
        <div 
          className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-background-desktop.jpg')`,
          }}
        />
        {/* Optional overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10"></div>
      </div>

      {/* Login Form Card */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo and Branding */}
          <div className="text-center space-y-3 mb-8">
            <div className="flex justify-center">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-32 w-auto md:h-40 lg:h-48 object-contain drop-shadow-lg"
              />
            </div>
            <div>
              <p className="text-sm md:text-base text-white/90 mt-1 drop-shadow-md">
                <span className="hidden md:inline">A smart farm operations & decision system for modern agriculture</span>
                <span className="md:hidden">A smart farm operations for modern agriculture</span>
              </p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-[#F5F1EB] rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 border border-white/20">
            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#2D4A3E]" />
                  <label className="text-sm font-medium text-[#2D4A3E]">Email</label>
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-[#2D4A3E] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/20 focus:border-[#2D4A3E]"
                  placeholder="Email"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#2D4A3E]" />
                  <label className="text-sm font-medium text-[#2D4A3E]">Password</label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-12 text-sm text-[#2D4A3E] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/20 focus:border-[#2D4A3E]"
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2D4A3E] hover:text-[#2D4A3E]/70 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#8B6F47] hover:bg-[#7A5F3A] text-white font-medium px-4 py-3.5 text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}

