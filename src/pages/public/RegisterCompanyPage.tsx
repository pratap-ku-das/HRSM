import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, User, Shield, CheckCircle2, ArrowRight, ArrowLeft, 
  Sparkles, Check, Globe, Phone, MapPin, Briefcase, Users as UsersIcon,
  Lock, Mail, Award
} from 'lucide-react';
import { BrandCredit } from '../../components/BrandCredit';
import { ProductLogo } from '../../components/ProductLogo';
import { AuthShowcase } from '../../components/AuthShowcase';

interface RegisterCompanyPageProps {
  onNavigateToLogin: () => void;
  onNavigateToLanding: () => void;
  onRegistrationComplete: () => void;
}

export const RegisterCompanyPage: React.FC<RegisterCompanyPageProps> = ({
  onNavigateToLogin,
  onNavigateToLanding,
  onRegistrationComplete,
}) => {
  const { registerCompany } = useAuth();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Step 1: Company details
  const [companyName, setCompanyName] = useState<string>('');
  const [companyEmail, setCompanyEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [industry, setIndustry] = useState<string>('Software & Technology');
  const [size, setSize] = useState<string>('11-50');

  // Step 2: Admin details
  const [adminName, setAdminName] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Step 3: Plan & Workspace details
  const [selectedPlan, setSelectedPlan] = useState<'STARTER' | 'GROWTH' | 'ENTERPRISE'>('GROWTH');
  const [workspaceSlug, setWorkspaceSlug] = useState<string>('');

  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    setWorkspaceSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
  };

  const handleCompleteRegistration = () => {
    setIsSubmitting(true);

    setTimeout(() => {
      registerCompany(
        {
          name: companyName || 'My Enterprise Corp',
          email: companyEmail || adminEmail,
          phone: phone,
          address: address,
          industry: industry,
          size: size,
        },
        {
          fullName: adminName || 'Admin User',
          email: adminEmail,
        },
        selectedPlan
      );

      setIsSubmitting(false);
      onRegistrationComplete();
    }, 1200);
  };

  return (
    <div className="auth-screen min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:ml-[43vw] lg:px-10 font-sans selection:bg-brand-500 selection:text-white relative">
      <AuthShowcase mode="register" />
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-brand-600/15 via-purple-600/15 to-transparent blur-[140px] pointer-events-none rounded-full" />

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center mb-8">
        <button
          onClick={onNavigateToLanding}
          className="inline-flex items-center rounded-2xl bg-white/95 px-5 py-2 shadow-xl shadow-indigo-950/25 hover:opacity-95 transition-opacity"
        >
          <ProductLogo className="h-20 w-64" />
        </button>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white">
          Create Your Company Workspace
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Deploy an isolated, multi-tenant HRMS portal with workforce, attendance, and payroll in 3 easy steps.
        </p>

        {/* Multi-Step Indicator */}
        <div className="mt-8 max-w-md mx-auto grid grid-cols-3 gap-2 text-xs">
          <div className={`p-2.5 rounded-xl border transition-all flex items-center space-x-2 ${
            currentStep >= 1 ? 'bg-brand-500/15 border-brand-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStep > 1 ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {currentStep > 1 ? <Check className="w-3 h-3" /> : '1'}
            </div>
            <span className="font-semibold truncate">Company</span>
          </div>

          <div className={`p-2.5 rounded-xl border transition-all flex items-center space-x-2 ${
            currentStep >= 2 ? 'bg-brand-500/15 border-brand-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStep > 2 ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {currentStep > 2 ? <Check className="w-3 h-3" /> : '2'}
            </div>
            <span className="font-semibold truncate">Admin</span>
          </div>

          <div className={`p-2.5 rounded-xl border transition-all flex items-center space-x-2 ${
            currentStep >= 3 ? 'bg-brand-500/15 border-brand-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-800 text-slate-300">
              3
            </div>
            <span className="font-semibold truncate">Plan & Launch</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="auth-form-card bg-slate-900/90 backdrop-blur-xl py-8 px-6 sm:px-10 border border-slate-800 rounded-3xl shadow-2xl space-y-6">
          {/* STEP 1: Company Profile */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in text-xs">
              <div className="pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Step 1: Company Information</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Tell us about your organization to setup your workspace profile.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Name *</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => handleCompanyNameChange(e.target.value)}
                      placeholder="e.g. Acme Innovations Corp"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Official Email *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="contact@acme.com"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Industry Sector</label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-brand-500"
                    >
                      <option>Software & Technology</option>
                      <option>Healthcare & Biotech</option>
                      <option>Financial Services & FinTech</option>
                      <option>E-Commerce & Retail</option>
                      <option>Manufacturing & Logistics</option>
                      <option>Consulting & Professional Services</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Size (Headcount)</label>
                  <div className="relative">
                    <UsersIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-brand-500"
                    >
                      <option>1-10 employees</option>
                      <option>11-50 employees</option>
                      <option>51-200 employees</option>
                      <option>201-500 employees</option>
                      <option>500+ employees</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Headquarters Address</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="San Francisco, CA, USA"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  disabled={!companyName}
                  className="px-6 py-2.5 bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-md shadow-brand-500/20"
                >
                  <span>Next: Admin Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Super Admin Details */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in text-xs">
              <div className="pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Step 2: Super Admin / HR Executive Setup</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">This person will be granted full administrative authority over this workspace.</p>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Admin Full Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Sarah Jenkins"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Admin Login Email *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="sarah.jenkins@company.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Create Password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Confirm Password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium flex items-center space-x-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={!adminName || !adminEmail}
                  className="px-6 py-2.5 bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-md shadow-brand-500/20"
                >
                  <span>Next: Plan & Subdomain</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Plan & Subdomain */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fade-in text-xs">
              <div className="pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Step 3: Plan & Isolated Subdomain</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Select a tier and verify your dedicated tenant URL.</p>
              </div>

              {/* Workspace Subdomain URL Preview */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">Your Isolated Workspace URL</label>
                <div className="flex items-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
                  <span className="pl-3 text-slate-400 font-mono text-[11px]">https://</span>
                  <input
                    type="text"
                    value={workspaceSlug}
                    onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-company"
                    className="flex-1 bg-transparent px-1 py-2 text-brand-300 font-mono text-xs focus:outline-none"
                  />
                  <span className="pr-3 text-slate-400 font-mono text-[11px]">.hrms.io</span>
                </div>
              </div>

              {/* Plan Choice Cards */}
              <div>
                <label className="block text-slate-300 font-medium mb-2">Select Subscription Plan</label>
                <div className="grid grid-cols-3 gap-3">
                  <div
                    onClick={() => setSelectedPlan('STARTER')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'STARTER'
                        ? 'bg-brand-500/15 border-brand-500 ring-1 ring-brand-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white">Starter</div>
                    <div className="text-brand-300 font-mono font-bold mt-1">$79<span className="text-[10px] text-slate-400 font-normal">/mo</span></div>
                    <div className="text-[10px] text-slate-400 mt-1">Up to 25 staff</div>
                  </div>

                  <div
                    onClick={() => setSelectedPlan('GROWTH')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'GROWTH'
                        ? 'bg-brand-500/15 border-brand-500 ring-1 ring-brand-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white flex items-center justify-between">
                      <span>Growth</span>
                      <span className="text-[9px] bg-brand-500 text-white px-1 rounded font-bold">TOP</span>
                    </div>
                    <div className="text-brand-300 font-mono font-bold mt-1">$199<span className="text-[10px] text-slate-400 font-normal">/mo</span></div>
                    <div className="text-[10px] text-slate-400 mt-1">Up to 150 staff</div>
                  </div>

                  <div
                    onClick={() => setSelectedPlan('ENTERPRISE')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'ENTERPRISE'
                        ? 'bg-brand-500/15 border-brand-500 ring-1 ring-brand-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white">Enterprise</div>
                    <div className="text-brand-300 font-mono font-bold mt-1">$499<span className="text-[10px] text-slate-400 font-normal">/mo</span></div>
                    <div className="text-[10px] text-slate-400 mt-1">Unlimited staff</div>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auto-Provisioned Defaults on Launch:</span>
                </div>
                <div>• Pre-configured standard departments (Executive, Engineering, HR)</div>
                <div>• Pre-seeded statutory leave policies (Annual, Sick, Casual)</div>
                <div>• Initialized attendance calendar & audit log stream</div>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium flex items-center space-x-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleCompleteRegistration}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-brand-500 via-indigo-600 to-purple-600 hover:from-brand-600 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold flex items-center space-x-2 shadow-lg shadow-brand-500/25"
                >
                  {isSubmitting ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Provisioning Workspace...</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Provision & Launch Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bottom Login link */}
          <div className="text-center pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-400">
              Already registered?{' '}
              <button
                onClick={onNavigateToLogin}
                className="text-brand-400 hover:text-brand-300 font-semibold"
              >
                Sign In to existing workspace
              </button>
            </p>
            <BrandCredit className="mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
};
