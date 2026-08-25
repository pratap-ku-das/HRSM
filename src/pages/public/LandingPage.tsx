import React, { useState } from 'react';
import {
  ArrowRight, BarChart3, Building2, CalendarCheck, Check, ChevronRight,
  CircleCheck, CreditCard, FileText, Fingerprint, Globe2, Menu, Play,
  Receipt, ShieldCheck, Sparkles, Target, TrendingUp, Users, X, Zap,
} from 'lucide-react';

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
          <span className="lp-brandmark"><Building2 size={20} strokeWidth={2.4} /></span>
          <span>OrbitHR</span>
          <small>by HRSM</small>
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
          </div>
        </section>

        <section className="lp-trust">
          <span>BUILT FOR AMBITIOUS TEAMS ACROSS INDIA</span>
          <div><b>finbox</b><b>PIXELCRAFT</b><b>northstar</b><b>WAVEFORM</b><b>kernl.</b></div>
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

        <section className="lp-pricing" id="pricing">
          <div className="lp-pricing-copy"><span className="lp-kicker">Simple pricing</span><h2>Start small.<br /><em>Scale without friction.</em></h2><p>Every plan includes the core people platform, employee self-service, mobile access, and support.</p><div className="lp-toggle"><button className={billing === 'monthly' ? 'active' : ''} onClick={() => setBilling('monthly')}>Monthly</button><button className={billing === 'annual' ? 'active' : ''} onClick={() => setBilling('annual')}>Annual <span>Save 20%</span></button></div></div>
          <div className="lp-price-card"><div className="lp-popular">MOST POPULAR</div><small>OrbitHR Growth</small><div className="lp-price"><sup>₹</sup><strong>{billing === 'annual' ? '149' : '189'}</strong><span>/employee<br />/month</span></div><p>For growing teams ready to bring their people operations together.</p><ul><li><Check /> Complete employee lifecycle</li><li><Check /> Attendance and leave</li><li><Check /> Indian payroll and compliance</li><li><Check /> Recruitment and performance</li><li><Check /> Priority support</li></ul><button className="lp-primary" onClick={onNavigateToRegister}>Start your 14-day trial <ArrowRight size={17} /></button></div>
        </section>

        <section className="lp-cta"><div className="lp-cta-orb" /><span><Sparkles size={16} /> Your next chapter starts here</span><h2>Make work feel<br /><em>remarkably human.</em></h2><p>Join the teams building happier, higher-performing workplaces with OrbitHR.</p><div><button className="lp-primary lp-light" onClick={onNavigateToRegister}>Start free today <ArrowRight size={18} /></button><button className="lp-ghost" onClick={onNavigateToLogin}>Talk to our team</button></div></section>
      </main>

      <footer className="lp-footer"><div className="lp-brand"><span className="lp-brandmark"><Building2 size={19} /></span><span>OrbitHR</span></div><p>People operations, beautifully connected.</p><div><a href="#platform">Platform</a><a href="#pricing">Pricing</a><button onClick={onNavigateToLogin}>Sign in</button></div><small>© 2026 HRSM Technologies · Bengaluru, India</small></footer>
    </div>
  );
};
