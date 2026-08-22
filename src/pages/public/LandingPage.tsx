import React, { useState } from 'react';
import { 
  Building2, Users, CalendarCheck, CreditCard, ShieldCheck, 
  Sparkles, ArrowRight, CheckCircle2, Star, Zap, 
  Smartphone, BarChart3, ChevronRight, Calculator,
  Lock, Award, Play, MessageSquare, HeartHandshake, HelpCircle
} from 'lucide-react';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onNavigateToApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToApp,
}) => {
  const [employeeCount, setEmployeeCount] = useState<number>(45);
  const [annualBilling, setAnnualBilling] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'attendance' | 'workforce' | 'payroll' | 'mobile'>('attendance');
  const [showDemoVideo, setShowDemoVideo] = useState<boolean>(false);
  const [contactSubmitted, setContactSubmitted] = useState<boolean>(false);

  // Calculations for ROI calculator
  const hoursSavedPerMonth = Math.round(employeeCount * 1.8);
  const monthlySavingsUSD = Math.round(hoursSavedPerMonth * 42);

  const features = [
    {
      icon: Users,
      title: 'Workforce Lifecycle 360',
      description: 'Centralize employee profiles, departments, organizational hierarchy, salary structures, and emergency contacts in isolated multi-tenant workspaces.',
      color: 'from-blue-500 to-indigo-500',
    },
    {
      icon: CalendarCheck,
      title: 'Administrative Attendance Engine',
      description: 'Comprehensive monthly attendance matrices, shift management, and regularization workflows — architected for Phase 6 mobile face-authentication.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: CreditCard,
      title: 'Automated Payroll & Payslips',
      description: 'Compute gross salary, statutory deductions (PF, Tax TDS, ESI), allowances, and instant printable digital payslips tailored to attendance logs.',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: Zap,
      title: 'Smart Leave & Approvals',
      description: 'Custom leave policies (Annual, Sick, Casual, Parental) with multi-tier approval workflows and real-time remaining balance ledgers.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: BarChart3,
      title: 'Recruitment ATS & Performance OKRs',
      description: 'Kanban candidate pipeline, applicant scorecards, quarterly goal setting, and 360-degree performance appraisal reviews.',
      color: 'from-rose-500 to-red-500',
    },
    {
      icon: ShieldCheck,
      title: 'Enterprise Audit & Security',
      description: 'Tamper-evident audit logs, role-based access control (RBAC), and isolated tenant partitioning for SOC-2 and GDPR compliance.',
      color: 'from-cyan-500 to-blue-500',
    },
  ];

  const testimonials = [
    {
      quote: "HRSM transformed our entire HR operations. Moving from spreadsheets to this multi-tenant system saved our team 60+ hours per month, and the attendance matrix is flawlessly built.",
      author: "Elena Rostova",
      role: "VP of People Operations",
      company: "Apex Global Tech",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      rating: 5,
    },
    {
      quote: "The cleanest HRMS architecture on the market. Having employee data, department hierarchies, leave approvals, and payroll seamlessly synced gives our leadership real-time clarity.",
      author: "Dr. David Vance",
      role: "Chief Operating Officer",
      company: "Nexus Health Biotech",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
      rating: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Top Floating Announcement Bar */}
      <div className="bg-gradient-to-r from-brand-600/90 via-indigo-600/90 to-purple-600/90 text-white py-2 px-4 text-center text-xs font-medium border-b border-brand-400/20">
        <span className="inline-flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
          <span>Next-Gen Multi-Tenant Enterprise HRMS Platform • Phase 6 Mobile Face-Auth Architecture Ready</span>
        </span>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={onNavigateToApp}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white flex items-center space-x-1.5">
                <span>HRSM</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  Cloud
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Enterprise Human Resource Management</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-brand-300 transition-colors">Features</a>
            <a href="#preview" className="hover:text-brand-300 transition-colors">Platform Preview</a>
            <a href="#calculator" className="hover:text-brand-300 transition-colors">ROI Calculator</a>
            <a href="#pricing" className="hover:text-brand-300 transition-colors">Pricing</a>
            <a href="#about" className="hover:text-brand-300 transition-colors">About</a>
            <a href="#contact" className="hover:text-brand-300 transition-colors">Contact</a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onNavigateToLogin}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-all"
            >
              Sign In
            </button>
            <button
              onClick={onNavigateToRegister}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/25 transition-all flex items-center space-x-1.5"
            >
              <span>Register Company</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-24 overflow-hidden">
        {/* Subtle glowing radial background */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-brand-600/20 via-purple-600/20 to-transparent blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-brand-500/30 text-brand-300 text-xs font-medium mb-6 shadow-inner">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>Built for Modern Enterprises & High-Growth Companies</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.15]">
            The Complete Multi-Tenant <span className="gradient-text">Human Resource Management</span> System
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Unify workforce lifecycle, administrative attendance matrices, automated payroll runs, smart leaves, and talent recruitment inside one isolated, ultra-secure company workspace.
          </p>

          {/* Hero CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onNavigateToRegister}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-500 via-indigo-600 to-purple-600 hover:from-brand-600 hover:via-indigo-700 hover:to-purple-700 shadow-xl shadow-brand-500/25 transition-all flex items-center justify-center space-x-2"
            >
              <span>Get Started - Register Company</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onNavigateToApp}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 shadow-md transition-all flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4 text-brand-400 fill-brand-400" />
              <span>Explore Live Interactive Workspace</span>
            </button>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Multi-Tenant Data Isolation</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Phase 6 Mobile Face-Auth Schema Ready</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>SOC-2 & GDPR Architecture</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Zero-Setup Instant Provisioning</span>
            </div>
          </div>

          {/* Interactive Workspace Preview Hero Card */}
          <div id="preview" className="mt-14 relative mx-auto max-w-5xl rounded-2xl p-2.5 bg-gradient-to-b from-slate-700/50 to-slate-900/80 border border-slate-700/80 shadow-2xl">
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              {/* Fake window titlebar */}
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono text-slate-400 ml-2">apex-tech.hrms.io/dashboard</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono font-semibold">
                    Live Multi-Tenant Workspace
                  </span>
                </div>
              </div>

              {/* Preview Content */}
              <div className="p-6 text-left bg-slate-900/95 space-y-6">
                {/* Tabs */}
                <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-800">
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'attendance'
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Attendance Matrix & Shifts
                  </button>
                  <button
                    onClick={() => setActiveTab('workforce')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'workforce'
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Employee Lifecycle 360
                  </button>
                  <button
                    onClick={() => setActiveTab('payroll')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'payroll'
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Payroll & Digital Payslips
                  </button>
                  <button
                    onClick={() => setActiveTab('mobile')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'mobile'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                        : 'bg-slate-800/80 text-purple-300 hover:text-white border border-purple-500/30'
                    }`}
                  >
                    ⚡ Phase 6 Mobile Face-Auth Blueprint
                  </button>
                </div>

                {/* Tab 1: Attendance */}
                {activeTab === 'attendance' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[11px] text-slate-400">Present Today</div>
                        <div className="text-xl font-bold text-emerald-400 mt-0.5">88.5% (7 / 8)</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[11px] text-slate-400">Late Arrivals</div>
                        <div className="text-xl font-bold text-amber-400 mt-0.5">2 Employees</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[11px] text-slate-400">On Approved Leave</div>
                        <div className="text-xl font-bold text-blue-400 mt-0.5">1 Employee</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[11px] text-slate-400">Audit Status</div>
                        <div className="text-xl font-bold text-purple-400 mt-0.5">Verified 100%</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                      <div className="font-semibold text-slate-200 mb-2 flex items-center justify-between">
                        <span>Interactive Monthly Attendance Matrix Preview</span>
                        <span className="text-[10px] text-slate-400">August 2026</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                              <th className="py-2">Employee</th>
                              <th className="py-2">Dept</th>
                              <th className="py-2 text-center">Aug 17</th>
                              <th className="py-2 text-center">Aug 18</th>
                              <th className="py-2 text-center">Aug 19</th>
                              <th className="py-2 text-center">Aug 20 (Today)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                            <tr>
                              <td className="py-2 font-sans font-medium text-white">Marcus Chen</td>
                              <td className="py-2 text-slate-400">ENG</td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                            </tr>
                            <tr>
                              <td className="py-2 font-sans font-medium text-white">Elena Rostova</td>
                              <td className="py-2 text-slate-400">ENG</td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">L</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                            </tr>
                            <tr>
                              <td className="py-2 font-sans font-medium text-white">Liam O'Connor</td>
                              <td className="py-2 text-slate-400">SALES</td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">P</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">LV</span></td>
                              <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">LV</span></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Workforce */}
                {activeTab === 'workforce' && (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Active Employee Directory (8 Team Members)</span>
                      <span className="text-brand-400 font-medium">4 Departments</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
                        <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80" alt="Marcus" className="w-10 h-10 rounded-xl object-cover" />
                        <div>
                          <div className="text-xs font-bold text-white">Marcus Chen</div>
                          <div className="text-[11px] text-slate-400">Principal Software Architect • ENG</div>
                          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">● Full-Time Active</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
                        <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80" alt="Aaliyah" className="w-10 h-10 rounded-xl object-cover" />
                        <div>
                          <div className="text-xs font-bold text-white">Aaliyah Patel</div>
                          <div className="text-[11px] text-slate-400">Lead Product Designer • PROD</div>
                          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">● Full-Time Active</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Payroll */}
                {activeTab === 'payroll' && (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">July 2026 Payroll Run Summary</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Status: PAID</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Total Gross Salary</div>
                        <div className="text-base font-bold text-white mt-0.5">$74,900.00</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Statutory Deductions</div>
                        <div className="text-base font-bold text-rose-400 mt-0.5">-$17,200.00</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Total Net Disbursed</div>
                        <div className="text-base font-bold text-emerald-400 mt-0.5">$57,700.00</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: Phase 6 Mobile Architecture */}
                {activeTab === 'mobile' && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 border border-purple-500/30 space-y-3">
                    <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs">
                      <Smartphone className="w-4 h-4" />
                      <span>Phase 6 Mobile Face-Auth Schema Architecture (Exclusively Designed)</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      The core database schema embeds all future mobile payload models (<code className="font-mono text-purple-300">faceAuthVerified</code>, <code className="font-mono text-purple-300">deviceId</code>, <code className="font-mono text-purple-300">clockInTime</code>, <code className="font-mono text-purple-300">locationLat/Lng</code>). 
                      When Android/iOS employee apps are launched, they communicate directly with existing endpoints without breaking changes!
                    </p>
                    <div className="p-3 rounded-lg bg-slate-900 font-mono text-[11px] text-purple-300/90 border border-purple-500/20 overflow-x-auto">
                      POST /api/v1/attendance/mobile-verify → &#123; employeeId, faceEmbeddingHash, deviceId, coords, timestamp &#125;
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-20 bg-slate-900/60 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Everything You Need</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              Comprehensive HRMS Modules in a Single Unified Hub
            </h2>
            <p className="mt-4 text-slate-300 text-sm sm:text-base">
              From company registration and role-based permissions to monthly attendance matrices and automated payroll runs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hover:-translate-y-1 group"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${feat.color} flex items-center justify-center text-white shadow-lg mb-5`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-brand-300 transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interactive ROI Calculator Section */}
      <section id="calculator" className="py-20 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-950/40 border border-slate-800 shadow-2xl">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-400 bg-brand-500/10 px-3 py-1 rounded-full border border-brand-500/20 mb-3">
                <Calculator className="w-3.5 h-3.5" />
                <span>Interactive ROI Calculator</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Calculate Time & Cost Savings for Your Team
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-2">
                See how much manual administrative HR work you eliminate by switching to HRSM.
              </p>
            </div>

            {/* Slider */}
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-slate-300">Company Headcount:</span>
                <span className="text-lg font-bold text-brand-400 font-mono">{employeeCount} Employees</span>
              </div>
              <input
                type="range"
                min="5"
                max="500"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(Number(e.target.value))}
                className="w-full accent-brand-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>5 employees</span>
                <span>100</span>
                <span>250</span>
                <span>500+ employees</span>
              </div>
            </div>

            {/* Output Metric Cards */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <div className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/60 text-center">
                <div className="text-xs text-slate-400 font-medium">Estimated Monthly Hours Saved</div>
                <div className="text-3xl font-extrabold text-white mt-1 font-mono">{hoursSavedPerMonth} hrs / mo</div>
                <p className="text-[11px] text-slate-400 mt-1">Eliminating manual spreadsheets & attendance reconciliations</p>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-tr from-brand-600/20 to-emerald-600/20 border border-brand-500/30 text-center">
                <div className="text-xs text-brand-300 font-medium">Estimated Monthly Value Saved</div>
                <div className="text-3xl font-extrabold text-emerald-400 mt-1 font-mono">${monthlySavingsUSD.toLocaleString()} / mo</div>
                <p className="text-[11px] text-slate-300 mt-1">Based on standard HR & administrative labor metrics</p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={onNavigateToRegister}
                className="px-6 py-3 rounded-xl text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/25"
              >
                Claim Your Efficiency - Start Free Company Trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-slate-900/50 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Transparent Plans</span>
            <h2 className="text-3xl font-extrabold text-white mt-2">Simple, Predictable Multi-Tenant Pricing</h2>
            <p className="mt-3 text-slate-300 text-sm">
              All plans include isolated workspace databases, audit logs, and complete HR modules.
            </p>

            {/* Toggle */}
            <div className="mt-6 inline-flex items-center space-x-3 p-1 rounded-xl bg-slate-800 border border-slate-700">
              <button
                onClick={() => setAnnualBilling(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  !annualBilling ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setAnnualBilling(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
                  annualBilling ? 'bg-brand-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Annual Billing</span>
                <span className="text-[10px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">20% OFF</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Starter */}
            <div className="p-7 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between">
              <div>
                <div className="text-sm font-bold text-slate-200">Starter</div>
                <p className="text-xs text-slate-400 mt-1">For growing teams up to 25 employees</p>
                <div className="mt-4 flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-white">${annualBilling ? '79' : '99'}</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Up to 25 Employee Profiles</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Monthly Attendance Matrix</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Leave Requests & Approvals</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Automated Payroll Run</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Audit Logs & Export</span></div>
                </div>
              </div>
              <button
                onClick={onNavigateToRegister}
                className="mt-8 w-full py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Select Starter
              </button>
            </div>

            {/* Growth */}
            <div className="p-7 rounded-2xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-900 border-2 border-brand-500 relative shadow-2xl flex flex-col justify-between">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-[10px] font-extrabold text-white uppercase tracking-wider shadow">
                Most Popular
              </div>
              <div>
                <div className="text-sm font-bold text-brand-300">Growth Plan</div>
                <p className="text-xs text-slate-400 mt-1">For organizations up to 150 employees</p>
                <div className="mt-4 flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-white">${annualBilling ? '199' : '249'}</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Up to 150 Employee Profiles</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Department & Designation Hierarchies</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Recruitment Pipeline & ATS Kanban</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Performance OKRs & Review Cycles</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Asset & Document Vault Management</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Phase 6 Mobile Face-Auth Schema Included</span></div>
                </div>
              </div>
              <button
                onClick={onNavigateToRegister}
                className="mt-8 w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 transition-all shadow-lg shadow-brand-500/25"
              >
                Start Growth Trial
              </button>
            </div>

            {/* Enterprise */}
            <div className="p-7 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between">
              <div>
                <div className="text-sm font-bold text-slate-200">Enterprise</div>
                <p className="text-xs text-slate-400 mt-1">Unlimited scale, dedicated multi-tenant DB</p>
                <div className="mt-4 flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-white">${annualBilling ? '499' : '599'}</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Unlimited Employees & Workspaces</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Dedicated PostgreSQL Tenant Partition</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Custom Statutory Tax & Currency Logic</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Direct Biometric & Mobile API Integration</span></div>
                  <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>24/7 Dedicated Solutions Engineer</span></div>
                </div>
              </div>
              <button
                onClick={onNavigateToRegister}
                className="mt-8 w-full py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Deploy Enterprise
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Customer Stories</span>
            <h2 className="text-3xl font-extrabold text-white mt-2">Trusted by Fast-Moving Organizations</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {testimonials.map((t, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-1 text-amber-400 mb-4">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 italic leading-relaxed">
                    "{t.quote}"
                  </p>
                </div>
                <div className="mt-6 flex items-center space-x-3 pt-4 border-t border-slate-800">
                  <img src={t.avatar} alt={t.author} className="w-10 h-10 rounded-xl object-cover" />
                  <div>
                    <div className="text-xs font-bold text-white">{t.author}</div>
                    <div className="text-[11px] text-slate-400">{t.role} • {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About & Trust Section */}
      <section id="about" className="py-20 bg-slate-900/60 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">About Our Vision</span>
              <h2 className="text-3xl font-extrabold text-white mt-2">
                Engineered for Reliability, Multi-Tenancy & Future Biometrics
              </h2>
              <p className="mt-4 text-sm text-slate-300 leading-relaxed">
                HRSM was designed from day one with architectural clarity. Instead of bloated legacy software, we provide a clean, modular platform where every company operates in its own securely isolated workspace.
              </p>
              <div className="mt-6 space-y-3 text-xs text-slate-300">
                <div className="flex items-start space-x-3">
                  <Lock className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Zero Data Leakage:</span> Strictly partitioned multi-tenant database records scoped by company ID on all queries.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Smartphone className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Phase 6 Mobile Face-Auth Architecture:</span> Ready for biometric face verification and geofenced attendance when employee mobile apps are activated.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Award className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Full Regulatory Compliance:</span> Comprehensive immutable audit logs, statutory salary breakdown, and digital payslips.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 space-y-6">
              <h3 className="text-base font-bold text-white">Architecture Highlights</h3>
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="font-semibold text-brand-300">Modular Domain Layer</div>
                  <p className="text-slate-400 mt-0.5">Separate modules for Employees, Attendance, Payroll, Leaves, Recruitment, and Security.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="font-semibold text-purple-300">Biometric Extensibility</div>
                  <p className="text-slate-400 mt-0.5">Database schema pre-configured for facial embeddings hash, GPS geolocation, and hardware device IDs.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="font-semibold text-emerald-300">High Availability</div>
                  <p className="text-slate-400 mt-0.5">Ultra-fast reactive UI, state management, and real-time calculation engines.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Demo Request */}
      <section id="contact" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-10 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
            <div className="text-center max-w-xl mx-auto mb-8">
              <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Get in Touch</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                Schedule a Guided Enterprise Walkthrough
              </h2>
              <p className="text-xs text-slate-400 mt-2">
                Have questions or need a custom deployment plan? Our solutions engineering team is here to assist.
              </p>
            </div>

            {contactSubmitted ? (
              <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-emerald-300">Thank you! Your request has been received.</h3>
                <p className="text-xs text-slate-300 mt-1">Our HR technology specialist will contact you within 2 business hours.</p>
              </div>
            ) : (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactSubmitted(true);
                }} 
                className="space-y-4 max-w-lg mx-auto text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Sarah Jenkins"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Work Email</label>
                    <input
                      required
                      type="email"
                      placeholder="sarah@company.com"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Company Name</label>
                    <input
                      required
                      type="text"
                      placeholder="Acme Innovations"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Company Size</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500">
                      <option>1-10 employees</option>
                      <option>11-50 employees</option>
                      <option>51-200 employees</option>
                      <option>201-500 employees</option>
                      <option>500+ employees</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Message / Key Requirements</label>
                  <textarea
                    rows={3}
                    placeholder="Tell us about your current HR workflows or specific questions..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 transition-all shadow-md shadow-brand-500/25"
                >
                  Send Inquiry & Request Demo
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-400 gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-200">HRSM Cloud Platform</div>
              <div>© 2026 HRSM Technologies Inc. All rights reserved.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#features" className="hover:text-slate-200 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-slate-200 transition-colors">Pricing</a>
            <a href="#about" className="hover:text-slate-200 transition-colors">Architecture</a>
            <button onClick={onNavigateToLogin} className="hover:text-slate-200 transition-colors">Login</button>
            <button onClick={onNavigateToRegister} className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">Register Company</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
