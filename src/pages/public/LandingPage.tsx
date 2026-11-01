import React, { useState } from 'react';
import {
  ArrowRight, BarChart3, CalendarCheck, Check, ChevronRight,
  CircleCheck, CreditCard, FileText, Fingerprint, Globe2, Menu, Play,
  Headphones, LockKeyhole, Mail, Receipt, ShieldCheck, Sparkles, Star,
  Target, TrendingUp, Users, X, Zap, Phone, ChevronDown, HelpCircle,
} from 'lucide-react';
import { BrandCredit } from '../../components/BrandCredit';
import { ProductLogo } from '../../components/ProductLogo';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onNavigateToApp: () => void;
}

const faqs = [
  {
    q: 'What is OrbitHR and how does it help my company?',
    a: 'OrbitHR is an all-in-one cloud Human Resource Management System (HRMS) developed by BalajiOne Enterprises. It replaces scattered spreadsheets and disjointed software by unifying onboarding, attendance, Indian statutory payroll, performance, and employee self-service into one intuitive platform.',
  },
  {
    q: 'Does OrbitHR support automated Indian statutory compliance (EPF, ESI, TDS, PT)?',
    a: 'Yes! OrbitHR natively calculates Employee Provident Fund (EPF), Employee State Insurance (ESIC), Tax Deducted at Source (TDS under both old and new tax regimes), and State Professional Tax (PT) automatically during monthly payroll execution.',
  },
  {
    q: 'How does the 14-day free trial and Razorpay autopay work?',
    a: 'When you register your company and select any plan (Starter, Growth, or Business), you authorize an autopay mandate through Razorpay. You enjoy a 14-day free trial without immediate deduction. Your recurring subscription begins only after the 14-day trial period completes.',
  },
  {
    q: 'Can employees clock in from their mobile phones with face authentication?',
    a: 'Yes, OrbitHR offers a mobile experience with facial recognition and geofenced attendance tracking. Employees can securely clock in and clock out on their own devices without needing expensive biometric fingerprint scanners.',
  },
  {
    q: 'Is OrbitHR available for companies in Bhubaneswar, Odisha and across India?',
    a: 'Yes! OrbitHR is the leading BalajiOne HRMS software developed in Bhubaneswar, Odisha. It is tailored for growing Indian enterprises with automated Indian statutory payroll (EPF, ESI, TDS, PT), facial recognition attendance, and dedicated local customer support in Bhubaneswar and nationwide.',
  },
  {
    q: 'How do I contact customer support?',
    a: 'You can contact OrbitHR customer support directly by calling +91 9348532113 or emailing support@balajione.dev. Our support team is based in India and ready to help you set up your company workspace.',
  },
];

const modules = [
  { icon: Users, title: 'People', copy: 'One living employee record from onboarding to exit.', tone: 'violet' },
  { icon: CalendarCheck, title: 'Time', copy: 'Attendance, shifts, leave and holiday planning.', tone: 'cyan' },
  { icon: CreditCard, title: 'Payroll', copy: 'Compliant Indian payroll, deductions and payslips.', tone: 'orange' },
  { icon: Target, title: 'Talent', copy: 'Hiring pipelines, goals, reviews and performance.', tone: 'pink' },
  { icon: Receipt, title: 'Spend', copy: 'Expense approvals, assets and document workflows.', tone: 'green' },
  { icon: ShieldCheck, title: 'Control', copy: 'Permissions, policies and a complete audit trail.', tone: 'blue' },
];

const activity = [
  { initials: 'AP', name: 'Ananya Patel', event: 'Leave approved', time: '2m', color: '#7c3aed' },
  { initials: 'RK', name: 'Rohan Kumar', event: 'Payroll processed', time: '8m', color: '#0891b2' },
  { initials: 'SM', name: 'Sara Mehta', event: 'Onboarding complete', time: '14m', color: '#ea580c' },
];

const testimonials = [
  { quote: 'OrbitHR replaced spreadsheets and scattered approvals with one workflow our entire team understands.', name: 'Meera Iyer', role: 'Head of People, Bengaluru', initials: 'MI' },
  { quote: 'Payroll, attendance, and leave now move together. Our month-end work is calmer and far more visible.', name: 'Arjun Malhotra', role: 'Operations Director, Gurugram', initials: 'AM' },
  { quote: 'Employees adopted the mobile experience immediately. It feels simple without sacrificing HR control.', name: 'Kavya Reddy', role: 'HR Manager, Hyderabad', initials: 'KR' },
  { quote: 'The onboarding flow gives every new teammate a polished first day and gives us a complete audit trail.', name: 'Rohit Shah', role: 'Founder, Ahmedabad', initials: 'RS' },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToApp,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="lp-root">
      <nav className="lp-nav">
        <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ProductLogo className="h-12 w-44" />
          <small>by BalajiOne Enterprises</small>
        </button>

        <div className="lp-links">
          <a href="#platform">Platform</a>
          <a href="#solutions">Solutions</a>
          <a href="#experience">Experience</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>

        <div className="lp-nav-actions">
          <button className="lp-text-btn" onClick={onNavigateToLogin}>Sign in</button>
          <button className="lp-primary lp-small" onClick={onNavigateToRegister}>Start free <ArrowRight size={15} /></button>
        </div>

        <button className="lp-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="lp-mobile-nav">
          <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
          <a href="#solutions" onClick={() => setMobileOpen(false)}>Solutions</a>
          <a href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#faq" onClick={() => setMobileOpen(false)}>FAQ</a>
          <a href="tel:+919348532113" className="flex items-center gap-2 text-purple-700 font-bold" onClick={() => setMobileOpen(false)}>
            <Phone size={14} /> Support: +91 9348532113
          </a>
          <button onClick={onNavigateToLogin}>Sign in</button>
          <button className="lp-primary" onClick={onNavigateToRegister}>Start free</button>
        </div>
      )}

      <main>
        <section className="lp-hero">
          <div className="lp-orb lp-orb-one" />
          <div className="lp-orb lp-orb-two" />
          <div className="lp-hero-copy">
            <div className="lp-eyebrow"><Sparkles size={15} /> The people platform for modern India</div>
            <h1>Work feels better when <em>everything connects.</em></h1>
            <p>One beautifully simple workspace for people, payroll, time, talent, and every moment in between.</p>
            <div className="lp-hero-actions">
              <button className="lp-primary" onClick={onNavigateToRegister}>Build your workspace <ArrowRight size={18} /></button>
              <button className="lp-secondary" onClick={onNavigateToApp}><span><Play size={14} fill="currentColor" /></span> Explore the live product</button>
            </div>
            <div className="lp-proof">
              <div className="lp-faces"><span>AK</span><span>PM</span><span>RS</span><span>+2k</span></div>
              <div><strong>Loved by growing teams</strong><small>No credit card · Setup in minutes</small></div>
            </div>
          </div>

          <div className="lp-scene" aria-label="3D HR dashboard preview">
            <div className="lp-scene-glow" />
            <div className="lp-dashboard">
              <div className="lp-dash-side">
                <div className="lp-mini-logo"><Zap size={16} /></div>
                {[BarChart3, Users, CalendarCheck, CreditCard, FileText].map((Icon, i) => (
                  <span key={i} className={i === 0 ? 'active' : ''}><Icon size={16} /></span>
                ))}
              </div>
              <div className="lp-dash-main">
                <div className="lp-dash-top"><div><small>Good morning, Priya</small><strong>Your team is thriving.</strong></div><div className="lp-avatar">PS</div></div>
                <div className="lp-kpis">
                  <div><span className="violet"><Users size={16} /></span><small>People</small><strong>248</strong><em>+12 this month</em></div>
                  <div><span className="cyan"><Fingerprint size={16} /></span><small>Present today</small><strong>94%</strong><em>Healthy attendance</em></div>
                  <div><span className="orange"><TrendingUp size={16} /></span><small>Engagement</small><strong>8.9</strong><em>Top 10% score</em></div>
                </div>
                <div className="lp-chart-card">
                  <div className="lp-card-title"><div><strong>Workforce pulse</strong><small>Last 6 months</small></div><span>Live</span></div>
                  <div className="lp-chart">
                    {[38, 52, 46, 67, 61, 82, 74, 92, 86, 105, 98, 124].map((h, i) => <i key={i} style={{ height: `${h}px` }} />)}
                  </div>
                </div>
              </div>
            </div>

            <div className="lp-float-card lp-float-pay">
              <span><CreditCard size={17} /></span><div><small>Payroll complete</small><strong>₹48.2L disbursed</strong></div><CircleCheck size={18} />
            </div>
            <div className="lp-float-card lp-float-person">
              <div className="lp-person-avatar">NM</div><div><small>New teammate</small><strong>Neha starts Monday</strong></div>
            </div>
            <div className="lp-float-card lp-float-leave">
              <span><CalendarCheck size={17} /></span><div><small>Leave request</small><strong>Approved instantly</strong></div><CircleCheck size={18} />
            </div>
          </div>
        </section>

        <section className="lp-trust">
          <div className="lp-trust-companies"><span>BUILT FOR AMBITIOUS TEAMS IN BHUBANESWAR &amp; ACROSS INDIA</span><div><b>finbox</b><b>PIXELCRAFT</b><b>northstar</b><b>WAVEFORM</b><b>kernl.</b></div></div>
          <div className="lp-trust-metrics"><div><TrendingUp /><strong>99.9%</strong><small>uptime target</small></div><div><LockKeyhole /><strong>Encrypted</strong><small>in transit & at rest</small></div><a href="tel:+919348532113" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div><Headphones /><strong>+91 9348532113</strong><small>India-based support</small></div>
          </a></div>
        </section>

        <section className="lp-section" id="platform">
          <div className="lp-section-head">
            <div><span className="lp-kicker">One connected platform</span><h2>Six products.<br /><em>One effortless flow.</em></h2></div>
            <p>Stop stitching together tools that do not speak. OrbitHR brings every people operation into one calm, intelligent system.</p>
          </div>
          <div className="lp-module-grid">
            {modules.map(({ icon: Icon, title, copy, tone }, index) => (
              <article className={`lp-module lp-${tone}`} key={title}>
                <div className="lp-module-top"><span><Icon size={22} /></span><b>0{index + 1}</b></div>
                <h3>{title}</h3><p>{copy}</p>
                <button onClick={onNavigateToApp}>Explore {title} <ChevronRight size={16} /></button>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-story" id="experience">
          <div className="lp-story-visual">
            <div className="lp-phone">
              <div className="lp-phone-top"><span>9:41</span><i /></div>
              <p>Monday, 25 August</p><h3>Hello, Aarav 👋</h3>
              <div className="lp-clock-card"><Fingerprint size={30} /><small>Ready to begin?</small><strong>Clock in securely</strong><button>Clock in</button></div>
              <div className="lp-phone-row"><div><span>8.5</span><small>Leave balance</small></div><div><span>4</span><small>Tasks today</small></div></div>
            </div>
            <div className="lp-activity-card">
              <div className="lp-card-title"><div><strong>Everything, in motion</strong><small>Live activity</small></div><span>Now</span></div>
              {activity.map(item => <div className="lp-activity" key={item.name}><i style={{ background: item.color }}>{item.initials}</i><div><strong>{item.name}</strong><small>{item.event}</small></div><time>{item.time}</time></div>)}
            </div>
          </div>
          <div className="lp-story-copy">
            <span className="lp-kicker">Designed around people</span>
            <h2>Powerful for HR.<br /><em>Delightful for everyone.</em></h2>
            <p>Complex systems create distance. We designed every interaction—from clocking in to reading a payslip—to feel instantly familiar.</p>
            <ul><li><Check /> One home for every employee</li><li><Check /> Mobile-first everyday workflows</li><li><Check /> Smart nudges, fewer follow-ups</li></ul>
            <button className="lp-secondary" onClick={onNavigateToApp}>See the employee experience <ArrowRight size={17} /></button>
          </div>
        </section>

        <section className="lp-security" id="solutions">
          <div className="lp-security-copy"><span><ShieldCheck /></span><div><small>Enterprise-ready by design</small><h2>Built in India.<br />Protected at every layer.</h2></div></div>
          <div className="lp-security-points"><div><Fingerprint /><strong>Role-based access</strong><small>Fine-grained permissions</small></div><div><Globe2 /><strong>India data residency</strong><small>DPDP-ready controls</small></div><div><FileText /><strong>Complete audit trail</strong><small>Every action accounted for</small></div></div>
        </section>

        <section className="lp-reviews" id="reviews">
          <div className="lp-reviews-head"><div><span className="lp-kicker">Illustrative customer feedback</span><h2>Built for people<br /><em>who build great teams.</em></h2></div><p>Representative feedback showing the outcomes OrbitHR is designed to create for modern Indian workplaces.</p></div>
          <div className="lp-review-grid">
            {testimonials.map(review => <article className="lp-review-card" key={review.name}><div className="lp-stars" aria-label="5 out of 5 stars">{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={15} fill="currentColor" />)}</div><blockquote>“{review.quote}”</blockquote><div className="lp-review-person"><span>{review.initials}</span><div><strong>{review.name}</strong><small>{review.role}</small></div></div></article>)}
          </div>
        </section>

        <section className="lp-pricing" id="pricing">
          <div className="lp-pricing-copy col-span-full text-center max-w-2xl mx-auto mb-10"><span className="lp-kicker">Simple, Transparent Pricing</span><h2>Choose the right plan<br /><em>for your growing team.</em></h2><p>Every plan includes the core people platform, employee self-service, mobile access, and bank-grade security. Billed monthly in INR via Razorpay.</p></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mx-auto col-span-full">
            {/* Starter Plan */}
            <div className="lp-price-card flex flex-col justify-between">
              <div>
                <small className="text-slate-500 font-bold uppercase tracking-wider text-xs">OrbitHR Starter</small>
                <div className="lp-price mt-4">
                  <sup>₹</sup><strong>299</strong><span>/month<br />billed monthly</span>
                </div>
                <p className="text-slate-600 text-sm mt-2">Essential workforce management for startups and small teams.</p>
                <ul className="mt-6 space-y-3">
                  <li><Check /> Up to 25 employees</li>
                  <li><Check /> Employee lifecycle & directory</li>
                  <li><Check /> Attendance & leave management</li>
                  <li><Check /> Indian statutory payroll (EPF, ESI, TDS)</li>
                  <li><Check /> Mobile & Web self-service</li>
                  <li><Check /> Standard email support</li>
                </ul>
              </div>
              <button className="lp-primary mt-8 w-full" onClick={() => onNavigateToRegister()}>
                Select Starter <ArrowRight size={17} />
              </button>
            </div>

            {/* Growth Plan */}
            <div className="lp-price-card flex flex-col justify-between border-brand-500 ring-2 ring-brand-500/20 relative">
              <div className="lp-popular">MOST POPULAR</div>
              <div>
                <small className="text-brand-600 font-bold uppercase tracking-wider text-xs">OrbitHR Growth</small>
                <div className="lp-price mt-4">
                  <sup>₹</sup><strong>799</strong><span>/month<br />billed monthly</span>
                </div>
                <p className="text-slate-600 text-sm mt-2">Automated operations and compliance for expanding teams.</p>
                <ul className="mt-6 space-y-3">
                  <li><Check /> Up to 100 employees</li>
                  <li><Check /> Everything in Starter</li>
                  <li><Check /> Face-Auth attendance & geofencing</li>
                  <li><Check /> Multi-stage approval workflows</li>
                  <li><Check /> Expense reimbursements & claims</li>
                  <li><Check /> Recruitment & ATS candidate portal</li>
                  <li><Check /> Priority email & chat support</li>
                </ul>
              </div>
              <button className="lp-primary mt-8 w-full bg-brand-600 hover:bg-brand-700" onClick={() => onNavigateToRegister()}>
                Select Growth <ArrowRight size={17} />
              </button>
            </div>

            {/* Business Plan */}
            <div className="lp-price-card flex flex-col justify-between">
              <div>
                <small className="text-slate-500 font-bold uppercase tracking-wider text-xs">OrbitHR Business</small>
                <div className="lp-price mt-4">
                  <sup>₹</sup><strong>1,199</strong><span>/month<br />billed monthly</span>
                </div>
                <p className="text-slate-600 text-sm mt-2">Enterprise-grade governance, audits, and multi-entity scale.</p>
                <ul className="mt-6 space-y-3">
                  <li><Check /> Unlimited employees</li>
                  <li><Check /> Everything in Growth</li>
                  <li><Check /> SOC-2 audit trails & compliance calendar</li>
                  <li><Check /> Multi-branch & cost center allocation</li>
                  <li><Check /> Performance review & OKR engine</li>
                  <li><Check /> Statutory reminder background daemons</li>
                  <li><Check /> Dedicated account manager & 24/7 SLA</li>
                </ul>
              </div>
              <button className="lp-primary mt-8 w-full" onClick={() => onNavigateToRegister()}>
                Select Business <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </section>

        <section className="lp-section" id="faq">
          <div className="lp-section-head">
            <div>
              <span className="lp-kicker">Got questions?</span>
              <h2>Frequently asked<br /><em>questions.</em></h2>
            </div>
            <p>Everything you need to know about OrbitHR, pricing, automated Indian statutory compliance, and rollout.</p>
          </div>
          <div className="w-full max-w-4xl mx-auto col-span-full space-y-4 mt-8">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-md overflow-hidden transition-all shadow-sm hover:border-purple-200"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-bold text-slate-800 text-base"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-3">
                      <HelpCircle size={18} className="text-purple-600 shrink-0" />
                      {faq.q}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-purple-600' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 pt-1 text-slate-600 text-sm leading-relaxed border-t border-slate-100">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="lp-cta"><div className="lp-cta-orb" /><span><Sparkles size={16} /> Your next chapter starts here</span><h2>Make work feel<br /><em>remarkably human.</em></h2><p>See onboarding, attendance, payroll, and employee self-service working together in one live workspace.</p><div><button className="lp-primary lp-light" onClick={onNavigateToApp}><Play size={16} fill="currentColor" /> View live demo</button><button className="lp-ghost" onClick={onNavigateToRegister}>Start free today <ArrowRight size={18} /></button></div></section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <div className="lp-brand"><ProductLogo className="h-12 w-44" /></div>
          <p>People operations, beautifully connected for modern Indian teams.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <a href="tel:+919348532113" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6d3df5', fontWeight: 700, textDecoration: 'none', fontSize: '12px' }}>
              <Phone size={14} /> +91 9348532113 (Support)
            </a>
            <a href="mailto:support@balajione.dev" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#655f75', textDecoration: 'none', fontSize: '12px' }}>
              <Mail size={14} /> support@balajione.dev
            </a>
          </div>
        </div>
        <div className="lp-footer-links">
          <div>
            <strong>Product</strong>
            <a href="#platform">Platform</a>
            <a href="#experience">Employee experience</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <button onClick={onNavigateToApp}>Live demo</button>
          </div>
          <div>
            <strong>Company</strong>
            <a href="tel:+919348532113">Support: +91 9348532113</a>
            <a href="mailto:support@balajione.dev">Email Support</a>
            <a href="mailto:contact@balajione.dev">Contact</a>
            <a href="/privacy">Privacy policy</a>
            <a href="/terms">Terms & conditions</a>
          </div>
          <div>
            <strong>Follow</strong>
            <a href="https://www.linkedin.com/company/balajione-enterprises/home/" target="_blank" rel="noreferrer">
              <span>in</span> LinkedIn
            </a>
            <a href="https://www.instagram.com/balajione_enterprises?utm_source=ig_web_button_share_sheet&xtok=ZDNlZDc0MzIxNw==" target="_blank" rel="noreferrer">
              <span>ig</span> Instagram
            </a>
            <a href="https://www.youtube.com/@BalajiOneEnterprises" target="_blank" rel="noreferrer">
              <span>▶</span> YouTube
            </a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <BrandCredit compact light />
          <small>© 2026 BalajiOne Enterprises · Bhubaneswar, Odisha &amp; Bengaluru, India</small>
        </div>
      </footer>
    </div>
  );
};
