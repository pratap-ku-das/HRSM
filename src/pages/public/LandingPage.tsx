import React, { useState } from 'react';
import {
  ArrowRight, BarChart3, CalendarCheck, Check, ChevronRight,
  CircleCheck, CreditCard, FileText, Fingerprint, Globe2, Menu, Play,
  Headphones, LockKeyhole, Mail, Receipt, ShieldCheck, Sparkles, Star,
  Target, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import { BrandCredit } from '../../components/BrandCredit';
import { ProductLogo } from '../../components/ProductLogo';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onNavigateToApp: () => void;
}

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
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

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
          <div className="lp-trust-companies"><span>BUILT FOR AMBITIOUS TEAMS ACROSS INDIA</span><div><b>finbox</b><b>PIXELCRAFT</b><b>northstar</b><b>WAVEFORM</b><b>kernl.</b></div></div>
          <div className="lp-trust-metrics"><div><TrendingUp /><strong>99.9%</strong><small>uptime target</small></div><div><LockKeyhole /><strong>Encrypted</strong><small>in transit & at rest</small></div><div><Headphones /><strong>India-based</strong><small>customer support</small></div></div>
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
          <div className="lp-pricing-copy"><span className="lp-kicker">Simple pricing</span><h2>Start small.<br /><em>Scale without friction.</em></h2><p>Every plan includes the core people platform, employee self-service, mobile access, and support.</p><div className="lp-toggle"><button className={billing === 'monthly' ? 'active' : ''} onClick={() => setBilling('monthly')}>Monthly</button><button className={billing === 'annual' ? 'active' : ''} onClick={() => setBilling('annual')}>Annual <span>Save 20%</span></button></div></div>
          <div className="lp-price-card"><div className="lp-popular">MOST POPULAR</div><small>OrbitHR Growth</small><div className="lp-price"><sup>₹</sup><strong>{billing === 'annual' ? '149' : '189'}</strong><span>/employee<br />/month</span></div><p>For growing teams ready to bring their people operations together.</p><ul><li><Check /> Complete employee lifecycle</li><li><Check /> Attendance and leave</li><li><Check /> Indian payroll and compliance</li><li><Check /> Recruitment and performance</li><li><Check /> Priority support</li></ul><button className="lp-primary" onClick={onNavigateToRegister}>Start your 14-day trial <ArrowRight size={17} /></button></div>
        </section>

        <section className="lp-cta"><div className="lp-cta-orb" /><span><Sparkles size={16} /> Your next chapter starts here</span><h2>Make work feel<br /><em>remarkably human.</em></h2><p>See onboarding, attendance, payroll, and employee self-service working together in one live workspace.</p><div><button className="lp-primary lp-light" onClick={onNavigateToApp}><Play size={16} fill="currentColor" /> View live demo</button><button className="lp-ghost" onClick={onNavigateToRegister}>Start free today <ArrowRight size={18} /></button></div></section>
      </main>

      <footer className="lp-footer"><div className="lp-footer-brand"><div className="lp-brand"><ProductLogo className="h-12 w-44" /></div><p>People operations, beautifully connected for modern Indian teams.</p><a href="mailto:support@balajione.dev"><Mail size={15} /> support@balajione.dev</a></div><div className="lp-footer-links"><div><strong>Product</strong><a href="#platform">Platform</a><a href="#experience">Employee experience</a><a href="#pricing">Pricing</a><button onClick={onNavigateToApp}>Live demo</button></div><div><strong>Company</strong><a href="mailto:contact@balajione.dev">Contact</a><a href="/privacy">Privacy policy</a><a href="/terms">Terms & conditions</a><a href="mailto:support@balajione.dev">Support</a></div><div><strong>Follow</strong><a href="https://www.linkedin.com" target="_blank" rel="noreferrer"><span>in</span> LinkedIn</a><a href="https://www.instagram.com" target="_blank" rel="noreferrer"><span>ig</span> Instagram</a><a href="https://www.youtube.com" target="_blank" rel="noreferrer"><span>▶</span> YouTube</a></div></div><div className="lp-footer-bottom"><BrandCredit compact light /><small>© 2026 BalajiOne Enterprises · Bengaluru, India</small></div></footer>
    </div>
  );
};
