import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  RefreshCw,
  FileText,
  Calendar,
  XCircle,
  HelpCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '../../services/api';
import { openRazorpayCheckout } from '../../utils/razorpay';
import { useToast } from '../../context/ToastContext';
import type { SubscriptionStatusOverview, InvoiceRecord } from '../../types';

export const BillingSubscriptionPage: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [statusOverview, setStatusOverview] = useState<SubscriptionStatusOverview | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const loadBillingData = useCallback(async () => {
    try {
      setLoading(true);
      const [status, invList] = await Promise.all([
        api.getSubscriptionStatus().catch(() => null),
        api.getSubscriptionInvoices().catch(() => []),
      ]);
      setStatusOverview(status);
      setInvoices(invList || []);
    } catch (err: any) {
      toast.showToast({
        type: 'error',
        title: 'Billing Load Error',
        message: err?.message || 'Failed to retrieve subscription and billing details.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  const handleSelectOrUpgradePlan = async (planCode: 'STARTER' | 'GROWTH' | 'BUSINESS') => {
    try {
      setProcessingPlan(planCode);
      const checkoutData = await api.initiateSubscriptionCheckout(planCode);

      // Open Razorpay Standard Checkout
      const paymentResponse = await openRazorpayCheckout({
        key: checkoutData.keyId,
        subscription_id: checkoutData.subscriptionId,
        order_id: checkoutData.orderId,
        amount: checkoutData.amount,
        currency: checkoutData.currency || 'INR',
        name: 'OrbitHR HRMS',
        description: `${checkoutData.planName} Monthly Subscription`,
        prefill: {
          name: checkoutData.companyName,
          email: checkoutData.companyEmail,
        },
        notes: {
          planCode: checkoutData.planCode,
        },
        theme: {
          color: '#4f46e5',
        },
      });

      // Verify payment on server
      toast.showToast({
        type: 'info',
        title: 'Verifying Payment',
        message: 'Validating cryptographic payment signature with Razorpay…',
      });

      const verification = await api.verifySubscriptionPayment({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        planCode,
      });

      toast.showToast({
        type: 'success',
        title: 'Subscription Activated',
        message: verification?.message || 'Your subscription is now active!',
      });

      await loadBillingData();
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        toast.showToast({
          type: 'info',
          title: 'Checkout Cancelled',
          message: 'Payment checkout was closed.',
        });
      } else {
        toast.showToast({
          type: 'error',
          title: 'Subscription Failed',
          message: err?.message || 'Could not complete subscription checkout.',
        });
      }
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleSetupAutopay = async () => {
    try {
      const planCode = (currentPlanCode as 'STARTER' | 'GROWTH' | 'BUSINESS') || 'STARTER';
      setProcessingPlan(planCode);
      const remainingDays = statusOverview?.daysRemaining || 14;
      const checkoutData = await api.initiateSubscriptionCheckout(planCode, {
        withTrial: true,
        trialDays: remainingDays,
      });

      const paymentResponse = await openRazorpayCheckout({
        key: checkoutData.keyId,
        subscription_id: checkoutData.subscriptionId,
        order_id: checkoutData.orderId,
        amount: checkoutData.amount,
        currency: checkoutData.currency || 'INR',
        name: 'OrbitHR HRMS',
        description: `${checkoutData.planName} - 14-Day Free Trial (UPI Autopay)`,
        prefill: {
          name: checkoutData.companyName,
          email: checkoutData.companyEmail,
        },
        notes: {
          planCode: checkoutData.planCode,
          isTrialAutopay: 'true',
        },
        theme: {
          color: '#4f46e5',
        },
      });

      toast.showToast({
        type: 'info',
        title: 'Verifying Mandate',
        message: 'Validating UPI Autopay mandate with Razorpay…',
      });

      const verification = await api.verifySubscriptionPayment({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_subscription_id: paymentResponse.razorpay_subscription_id || checkoutData.subscriptionId,
        razorpay_order_id: paymentResponse.razorpay_order_id || checkoutData.orderId,
        razorpay_signature: paymentResponse.razorpay_signature,
        planCode,
        isTrialAutopay: true,
        trialDays: remainingDays,
      });

      toast.showToast({
        type: 'success',
        title: 'UPI Autopay Active',
        message: verification?.message || 'Recurring UPI Autopay successfully authorized!',
      });

      await loadBillingData();
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) {
        toast.showToast({
          type: 'error',
          title: 'Autopay Setup Failed',
          message: err?.message || 'Could not complete UPI Autopay mandate.',
        });
      }
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setIsCancelling(true);
      await api.cancelSubscription(cancelReason);
      toast.showToast({
        type: 'success',
        title: 'Cancellation Scheduled',
        message: 'Your subscription will remain active until the end of the billing period.',
      });
      setCancelModalOpen(false);
      await loadBillingData();
    } catch (err: any) {
      toast.showToast({
        type: 'error',
        title: 'Cancellation Error',
        message: err?.message || 'Failed to cancel subscription.',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleResumeSubscription = async () => {
    try {
      await api.resumeSubscription();
      toast.showToast({
        type: 'success',
        title: 'Subscription Resumed',
        message: 'Your subscription renewal has been reactivated.',
      });
      await loadBillingData();
    } catch (err: any) {
      toast.showToast({
        type: 'error',
        title: 'Resume Failed',
        message: err?.message || 'Failed to resume subscription.',
      });
    }
  };

  if (loading && !statusOverview) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 rounded-full border-3 border-brand-500 border-t-transparent animate-spin" />
          <p className="mt-3 text-xs text-slate-400">Loading billing & subscription status…</p>
        </div>
      </div>
    );
  }

  const currentPlanCode = statusOverview?.plan?.code || 'GROWTH';
  const currentStatus = statusOverview?.status || 'TRIAL';

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-brand-400" />
            Billing & Subscription Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your OrbitHR plan, recurring Razorpay billing, and invoice history.
          </p>
        </div>

        <button
          onClick={loadBillingData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {/* Warning Banners for Inactive / Past Due / Grace Period */}
      {statusOverview?.isInGracePeriod && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h4 className="font-semibold text-amber-300">Payment Past Due (In Grace Period)</h4>
            <p className="text-amber-200/80 mt-0.5">
              Your recurring subscription charge could not be processed. You are currently in a grace period. Please renew below to prevent service interruption.
            </p>
          </div>
        </div>
      )}

      {(currentStatus === 'EXPIRED' || currentStatus === 'HALTED') && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h4 className="font-semibold text-rose-300">Subscription Inactive</h4>
            <p className="text-rose-200/80 mt-0.5">
              Your subscription has expired. Standard HRMS workspace features are restricted until renewed. All company data remains securely preserved.
            </p>
          </div>
        </div>
      )}

      {/* Current Subscription Card */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Plan</span>
            <div className="flex items-center gap-2 mt-1">
              <h3 className="text-2xl font-bold text-white">{statusOverview?.plan?.name || 'Growth'}</h3>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  currentStatus === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : currentStatus === 'TRIAL'
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {currentStatus}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{statusOverview?.plan?.description}</p>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Billing</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              ₹{statusOverview?.plan?.monthlyPrice?.toLocaleString('en-IN') || '799'}
              <span className="text-xs font-normal text-slate-400 font-sans"> / month</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Automated recurring billing via Razorpay</p>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {currentStatus === 'TRIAL' ? 'Trial Expiry' : 'Next Billing / Expiry'}
            </span>
            <div className="text-sm font-semibold text-white mt-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-400" />
              {statusOverview?.currentPeriodEnd
                ? new Date(statusOverview.currentPeriodEnd).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Not scheduled'}
            </div>
            {typeof statusOverview?.daysRemaining === 'number' && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {statusOverview.daysRemaining} days remaining
              </p>
            )}
          </div>

          <div className="flex flex-col justify-center items-start md:items-end gap-2">
            {statusOverview?.cancelAtPeriodEnd ? (
              <div className="space-y-2 text-right">
                <span className="text-xs text-amber-300 font-medium block">
                  Cancels on period end ({statusOverview.currentPeriodEnd ? new Date(statusOverview.currentPeriodEnd).toLocaleDateString('en-IN') : ''})
                </span>
                <button
                  onClick={handleResumeSubscription}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  Resume Renewal
                </button>
              </div>
            ) : currentStatus === 'ACTIVE' ? (
              <button
                onClick={() => setCancelModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/30 transition-colors"
              >
                Cancel Renewal
              </button>
            ) : currentStatus === 'TRIAL' ? (
              <button
                onClick={handleSetupAutopay}
                disabled={Boolean(processingPlan)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{processingPlan ? 'Opening Autopay…' : 'Setup UPI Autopay'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Available Plans Grid */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-400" />
            OrbitHR Subscription Plans
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a plan to activate or switch your subscription. Upgrade or downgrade takes effect immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter Plan */}
          <div
            className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
              currentPlanCode === 'STARTER' && statusOverview?.isActive
                ? 'border-brand-500 bg-slate-900/90 ring-1 ring-brand-500/50'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg">Starter</h3>
                {currentPlanCode === 'STARTER' && statusOverview?.isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    CURRENT PLAN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">Essential workforce management for startups and small teams.</p>
              <div className="mt-4 font-mono font-bold text-2xl text-white">
                ₹299<span className="text-xs font-normal text-slate-400 font-sans"> / month</span>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Up to 25 employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Employee Lifecycle & Directory</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Attendance & Leave Management</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Indian Statutory Payroll (EPF, ESI, TDS)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Employee Self-Service (Web & Android)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Standard Email Support</span>
                </li>
              </ul>
            </div>

            <button
              disabled={currentPlanCode === 'STARTER' && statusOverview?.isActive}
              onClick={() => handleSelectOrUpgradePlan('STARTER')}
              className={`w-full mt-8 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                currentPlanCode === 'STARTER' && statusOverview?.isActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              }`}
            >
              {processingPlan === 'STARTER' ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Opening Checkout…
                </span>
              ) : currentPlanCode === 'STARTER' && statusOverview?.isActive ? (
                'Current Plan'
              ) : (
                <>
                  Switch to Starter <ArrowUpRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Growth Plan (Most Popular) */}
          <div
            className={`rounded-2xl border p-6 flex flex-col justify-between relative transition-all ${
              currentPlanCode === 'GROWTH' && statusOverview?.isActive
                ? 'border-brand-500 bg-slate-900/90 ring-2 ring-brand-500/50'
                : 'border-brand-500/40 bg-slate-900/60 hover:border-brand-500'
            }`}
          >
            <div className="absolute -top-3 right-5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-brand-500 to-indigo-500 text-[10px] font-bold text-white shadow-md">
              MOST POPULAR
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg">Growth</h3>
                {currentPlanCode === 'GROWTH' && statusOverview?.isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    CURRENT PLAN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">Complete workforce administration and automation for expanding teams.</p>
              <div className="mt-4 font-mono font-bold text-2xl text-white">
                ₹799<span className="text-xs font-normal text-slate-400 font-sans"> / month</span>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Up to 100 employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Everything in Starter</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Face-Auth Attendance & Geofencing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Multi-Stage Approval Workflow Engine</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Expense Reimbursements & Claims</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Recruitment & ATS Candidate Pipeline</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Priority Email & Chat Support</span>
                </li>
              </ul>
            </div>

            <button
              disabled={currentPlanCode === 'GROWTH' && statusOverview?.isActive}
              onClick={() => handleSelectOrUpgradePlan('GROWTH')}
              className={`w-full mt-8 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                currentPlanCode === 'GROWTH' && statusOverview?.isActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25'
              }`}
            >
              {processingPlan === 'GROWTH' ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Opening Checkout…
                </span>
              ) : currentPlanCode === 'GROWTH' && statusOverview?.isActive ? (
                'Current Plan'
              ) : (
                <>
                  Select Growth <ArrowUpRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Business Plan */}
          <div
            className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
              currentPlanCode === 'BUSINESS' && statusOverview?.isActive
                ? 'border-brand-500 bg-slate-900/90 ring-1 ring-brand-500/50'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg">Business</h3>
                {currentPlanCode === 'BUSINESS' && statusOverview?.isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    CURRENT PLAN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">Enterprise-grade governance, audit trails, and multi-branch scale.</p>
              <div className="mt-4 font-mono font-bold text-2xl text-white">
                ₹1,199<span className="text-xs font-normal text-slate-400 font-sans"> / month</span>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Unlimited employees</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Everything in Growth</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>SOC-2 Audit Trails & Compliance Engine</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Branch & Cost Center Allocations</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Performance Review & OKR Engine</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Statutory Reminder Background Workers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dedicated Manager & 24/7 SLA</span>
                </li>
              </ul>
            </div>

            <button
              disabled={currentPlanCode === 'BUSINESS' && statusOverview?.isActive}
              onClick={() => handleSelectOrUpgradePlan('BUSINESS')}
              className={`w-full mt-8 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                currentPlanCode === 'BUSINESS' && statusOverview?.isActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              }`}
            >
              {processingPlan === 'BUSINESS' ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Opening Checkout…
                </span>
              ) : currentPlanCode === 'BUSINESS' && statusOverview?.isActive ? (
                'Current Plan'
              ) : (
                <>
                  Switch to Business <ArrowUpRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Payment & Invoice History Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-400" />
              Invoices & Payment Records
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified payment transactions and official tax receipts processed via Razorpay.
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No payment records found. Your first invoice will appear here once payment is verified.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Invoice #</th>
                  <th className="py-3 px-4 font-semibold">Payment ID</th>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Method</th>
                  <th className="py-3 px-4 font-semibold">Amount</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-white">{inv.invoiceNumber}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{inv.razorpayPaymentId || '—'}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {new Date(inv.paidAt || inv.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">{inv.paymentMethod}</td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-white">
                      ₹{inv.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inv.status === 'SUCCESS'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : inv.status === 'FAILED'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancellation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Cancel Recurring Subscription?
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Your subscription will remain active until the end of your current billing period (
              {statusOverview?.currentPeriodEnd ? new Date(statusOverview.currentPeriodEnd).toLocaleDateString('en-IN') : 'current cycle'}
              ). You will not be billed again.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Reason for cancellation (optional):
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Help us improve OrbitHR…"
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                disabled={isCancelling}
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                disabled={isCancelling}
                onClick={handleCancelSubscription}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
              >
                {isCancelling ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

