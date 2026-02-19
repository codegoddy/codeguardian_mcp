"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";
import { Logo } from "@/components/Logo";
import { 
  Zap, 
  Menu, 
  X, 
  Book, 
  Terminal, 
  GitBranch, 
  CreditCard, 
  Shield, 
  Clock, 
  Layout, 
  Webhook, 
  Code,
  ArrowRight,
  LucideIcon
} from "lucide-react";

export default function DocsPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  // Handle scroll spy for active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll("section[id]");
      const scrollPosition = window.scrollY + 100;

      sections.forEach((section) => {
        const sectionTop = (section as HTMLElement).offsetTop;
        const sectionHeight = (section as HTMLElement).offsetHeight;
        const sectionId = section.getAttribute("id") || "";

        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
          setActiveSection(sectionId);
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setIsMobileMenuOpen(false);
    }
  };

  const SidebarLink = ({ id, label, icon: Icon }: { id: string, label: string, icon?: LucideIcon }) => (
    <button
      onClick={() => scrollToSection(id)}
      className={`w-full text-left px-6 py-4 rounded-xl text-base font-black uppercase tracking-widest transition-all flex items-center gap-4 ${
        activeSection === id 
          ? "bg-[#ccff00] text-black border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] -translate-y-1" 
          : "text-gray-500 hover:text-black hover:bg-black/5"
      }`}
    >
      {Icon && <Icon className={`w-4 h-4 ${activeSection === id ? "text-black" : "text-gray-400"}`} />}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black relative">
      <SoftwareApplicationSchema />
      <OrganizationSchema />
      <WebSiteSchema />
      
      {/* Noise Texture Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-40 mix-blend-multiply"></div>

      {/* Navigation - Full Navigation like Landing Page */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/90 border-b border-black/5 gpu-accelerated">
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#system" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">The System</Link>
            <Link href="/#manifesto" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Manifesto</Link>
            <Link href="/download" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">CLI</Link>
            <Link href="/docs" className="text-sm font-bold uppercase tracking-wider text-[#ccff00] bg-black px-3 py-1">Docs</Link>
            <Link href="/pricing" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Pricing</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden md:block text-sm font-bold uppercase tracking-wider hover:underline">
              Login
            </Link>
            <Link href="/waitlist" className="bg-black text-[#ccff00] px-6 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-gray-900 transition-colors">
              Join Alpha
            </Link>
            <button 
              className="md:hidden p-2 border border-black/10 rounded-md"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pt-24 flex items-start relative z-10 gap-12">
        {/* Sidebar Navigation - Desktop */}
        <aside className="hidden md:block w-80 sticky top-32 max-h-[calc(100vh-160px)] overflow-y-auto py-8 pr-8 border-r-2 border-black/5">
          <div className="space-y-10">
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-6 px-4">Getting Started</h3>
              <div className="space-y-2">
                <SidebarLink id="overview" label="Overview" icon={Book} />
                <SidebarLink id="quick-start" label="Quick Start" icon={Zap} />
                <SidebarLink id="core-concepts" label="Core Concepts" icon={Layout} />
              </div>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-6 px-4">Core Features</h3>
              <div className="space-y-2">
                <SidebarLink id="budget-tracking" label="Budget Tracking" icon={CreditCard} />
                <SidebarLink id="time-tracking" label="Time Tracking" icon={Clock} />
                <SidebarLink id="git-controls" label="Git Controls" icon={Shield} />
              </div>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-6 px-4">CLI Tool</h3>
              <div className="space-y-2">
                <SidebarLink id="cli-install" label="Installation" icon={Terminal} />
                <SidebarLink id="cli-commands" label="Commands" icon={Code} />
              </div>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-6 px-4">Integrations</h3>
              <div className="space-y-2">
                <SidebarLink id="git-integration" label="Git Providers" icon={GitBranch} />
                <SidebarLink id="webhooks" label="Webhooks" icon={Webhook} />
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-[#F5F5F0] pt-24 px-6 md:hidden overflow-y-auto">
            <div className="space-y-8 pb-12">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4">Getting Started</h3>
                <div className="space-y-3">
                  <SidebarLink id="overview" label="Overview" icon={Book} />
                  <SidebarLink id="quick-start" label="Quick Start" icon={Zap} />
                  <SidebarLink id="core-concepts" label="Core Concepts" icon={Layout} />
                </div>
              </div>
              <div>
                <h3 className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4">Core Features</h3>
                <div className="space-y-3">
                  <SidebarLink id="budget-tracking" label="Budget Monitoring" icon={CreditCard} />
                  <SidebarLink id="time-tracking" label="Time Tracking" icon={Clock} />
                  <SidebarLink id="git-controls" label="Git Controls" icon={Shield} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 py-12 md:px-12 max-w-4xl">
          <div className="mb-20">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-black">
              THE <br/>
              <span className="bg-[#ccff00] px-2">LOGIC.</span>
            </h1>
            <p className="text-xl md:text-2xl font-medium leading-snug max-w-2xl text-black/80">
              Everything you need to know about keeping your project on track. 
              <span className="text-gray-500"> Real-time budget monitoring and git access control for developers.</span>
            </p>
          </div>

          {/* Overview */}
          <section id="overview" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[01] Overview</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">The Financial <br/> Guardrail.</h2>
                </div>
                <Book className="w-12 h-12 text-[#ccff00]" />
             </div>
            
            <div className="space-y-8">
              <p className="text-xl font-medium leading-relaxed">
                DevHQ is the impartial monitoring layer between you and your deliverables. It automates budget tracking and git access control to ensure every commit is accounted for.
              </p>
              
              <div className="bg-white border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-[#ccff00] transition-colors group">
                <h3 className="text-2xl font-black uppercase mb-4 flex items-center gap-3">
                  <Zap className="w-6 h-6" />
                  Core Philosophy
                </h3>
                <p className="text-lg font-medium leading-relaxed group-hover:text-black">
                  We believe transparency is the best policy. When the budget is exceeded, the protocol notifies and enforces limits. 
                  Zero surprises. Zero awkward conversations about overages.
                </p>
              </div>

              <div className="pt-12">
                <h3 className="text-2xl font-black uppercase mb-8">The Execution Flow</h3>
                <div className="grid sm:grid-cols-2 gap-6">
                  {[
                    { num: "01", title: "Ingest", desc: "Connect your repo and set your hourly rate. Every commit is quantified." },
                    { num: "02", title: "Budget", desc: "Define your project budget and tracking parameters for the protocol." },
                    { num: "03", title: "Monitor", desc: "Work as usual. We track the progress in real-time from your terminal." },
                    { num: "04", title: "Enforce", desc: "If the budget dries up, we can revoke access automatically until review." }
                  ].map((step, i) => (
                    <div key={i} className="border-t-2 border-black pt-6">
                      <span className="font-mono text-[#ccff00] font-bold text-sm bg-black px-2 py-0.5 mb-2 inline-block">{step.num}</span>
                      <h4 className="text-xl font-black uppercase mb-2">{step.title}</h4>
                      <p className="text-gray-600 font-medium">{step.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Quick Start */}
          <section id="quick-start" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[02] Quick Start</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Start The <br/> Protocol.</h2>
                </div>
                <Zap className="w-12 h-12 text-[#ccff00]" />
             </div>
            
            <div className="space-y-12">
              <div className="group flex flex-col md:flex-row gap-8 items-start pb-12 border-b border-black/10">
                 <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center font-black text-xl shrink-0 group-hover:bg-[#ccff00] transition-colors">1</div>
                 <div>
                    <h3 className="text-2xl font-black uppercase mb-3">Create Account</h3>
                    <p className="text-gray-600 text-lg font-medium">Join the alpha waitlist and setup your developer profile.</p>
                 </div>
              </div>

              <div className="group flex flex-col md:flex-row gap-8 items-start pb-12 border-b border-black/10">
                 <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center font-black text-xl shrink-0 group-hover:bg-[#ccff00] transition-colors">2</div>
                 <div>
                    <h3 className="text-2xl font-black uppercase mb-3">Setup Project</h3>
                    <p className="text-gray-600 text-lg font-medium">Link your repository, set your rate, and define your tracking codes.</p>
                 </div>
              </div>

              <div className="group flex flex-col md:flex-row gap-8 items-start">
                 <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center font-black text-xl shrink-0 group-hover:bg-[#ccff00] transition-colors">3</div>
                 <div className="w-full">
                    <h3 className="text-2xl font-black uppercase mb-6">Install CLI</h3>
                    <div className="bg-[#111] border border-white/10 rounded-xl p-6 md:p-8 font-mono text-sm md:text-base text-gray-300 shadow-2xl">
                       <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
                          <div className="flex gap-2">
                             <div className="w-3 h-3 rounded-full bg-red-500"></div>
                             <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                             <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          </div>
                          <span className="opacity-50 text-xs">term -- -zsh -- 80x24</span>
                       </div>
                       <div className="space-y-4">
                          <div className="flex gap-4">
                             <span className="text-[#ccff00]">$</span>
                             <span>curl -fsS https://devhq.site/install.sh | sh</span>
                          </div>
                          <div className="flex gap-4">
                             <span className="text-[#ccff00]">$</span>
                             <span>devhq config set api-token YOUR_TOKEN</span>
                          </div>
                          <div className="flex gap-4 pt-4">
                             <span className="text-[#ccff00]">&gt;&gt;</span>
                             <span className="text-white">DEVHQ_CLI: Authentication complete. System ready.</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* Core Concepts */}
          <section id="core-concepts" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[03] Concepts</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">The Logic <br/> Stack.</h2>
                </div>
                <Layout className="w-12 h-12 text-[#ccff00]" />
             </div>

            <div className="space-y-12">
              <div className="bg-black text-white p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(204,255,0,1)]">
                <h3 className="text-3xl font-black uppercase mb-6 border-b border-white/20 pb-4">Budget Progress</h3>
                <p className="text-xl text-gray-400 font-medium leading-relaxed mb-6">
                   Monitor your runway in real-time. We quantify every contribution and compare it against your project limits, giving you instant visibility into project health.
                </p>
                <div className="flex items-center gap-4">
                   <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#ccff00] w-[65%] border-r-2 border-white"></div>
                   </div>
                   <span className="font-mono text-[#ccff00] font-bold">65%</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                 <div className="border-2 border-black p-8 bg-white hover:translate-x-2 transition-transform">
                    <h3 className="text-2xl font-black uppercase mb-4">Tracking Codes</h3>
                    <p className="text-gray-600 font-medium mb-6">Universal identifiers for your work. Use them across git, CLI, and docs.</p>
                    <div className="bg-[#F5F5F0] p-4 font-mono text-sm border-l-4 border-[#ccff00]">
                       <p className="text-black font-bold">git push -m &quot;feat: [WEB-001] auth&quot;</p>
                    </div>
                 </div>
                 <div className="border-2 border-black p-8 bg-white -rotate-1 hover:rotate-0 transition-transform">
                    <h3 className="text-2xl font-black uppercase mb-4">Proof of Work</h3>
                    <p className="text-gray-600 font-medium mb-6">Automated logs and snapshots that prove every billable minute of progress.</p>
                    <div className="flex gap-2">
                       {[1,2,3].map(i => (
                          <div key={i} className="w-10 h-10 bg-black/5 border border-black/10 rounded"></div>
                       ))}
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* Budget Tracking */}
          <section id="budget-tracking" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[04] Features</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Budget <br/> Tracking.</h2>
                </div>
                <CreditCard className="w-12 h-12 text-[#ccff00]" />
             </div>
             <div className="space-y-6">
                <p className="text-xl font-medium leading-relaxed">
                   Set your project budget in hours or currency. DevHQ monitors the burn rate in real-time as you commit code and log time.
                </p>
                <ul className="space-y-4">
                   {[
                      "Real-time burn monitoring",
                      "Visual health indicators (Healthy, At Risk, Over Budget)",
                      "Projected total based on current pace",
                      "Historical budget logs"
                   ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 font-bold uppercase text-sm">
                         <div className="w-2 h-2 bg-[#ccff00] border border-black"></div>
                         {item}
                      </li>
                   ))}
                </ul>
             </div>
          </section>

          {/* Time Tracking */}
          <section id="time-tracking" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[05] Features</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Time <br/> Tracking.</h2>
                </div>
                <Clock className="w-12 h-12 text-[#ccff00]" />
             </div>
             <div className="space-y-6">
                <p className="text-xl font-medium leading-relaxed">
                   Native time tracking via the CLI. Start, stop, and pause sessions without leaving your terminal.
                </p>
                <div className="bg-white border-2 border-black p-6 font-mono text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                   <div className="text-gray-400 mb-2"># Start a session for feature [WEB-101]</div>
                   <div className="text-[#ccff00]">$ <span className="text-black">devhq start [WEB-101]</span></div>
                </div>
             </div>
          </section>

          {/* Git Controls */}
          <section id="git-controls" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[06] Features</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Git <br/> Controls.</h2>
                </div>
                <Shield className="w-12 h-12 text-[#ccff00]" />
             </div>
             <p className="text-xl font-medium leading-relaxed mb-8">
                Enforce project guardrails directly at the git level. Revoke access when budgets are exceeded or sessions are inactive.
             </p>
          </section>

          {/* CLI Installation */}
          <section id="cli-install" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[07] CLI Tool</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Installation.</h2>
                </div>
                <Terminal className="w-12 h-12 text-[#ccff00]" />
             </div>
             <div className="bg-black text-white p-8 rounded-xl">
                <p className="font-mono text-sm mb-4 text-gray-400"># One-step install for macOS, Linux, and Windows</p>
                <code className="text-[#ccff00] break-all">curl -fsS https://devhq.site/install.sh | sh</code>
             </div>
          </section>

          {/* CLI Commands */}
          <section id="cli-commands" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[08] CLI Tool</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Commands.</h2>
                </div>
                <Code className="w-12 h-12 text-[#ccff00]" />
             </div>
             <div className="grid gap-6">
                {[
                   { cmd: "devhq start <CODE>", desc: "Initialize a work session for a specific deliverable tracking code." },
                   { cmd: "devhq stop", desc: "Commit your active session logs and terminate the background monitor." },
                   { cmd: "devhq pause", desc: "Temporarily suspend tracking without closing the active session." },
                   { cmd: "devhq status", desc: "View your current runway, active session time, and budget health." }
                ].map((item, i) => (
                   <div key={i} className="border-2 border-black p-6 bg-white flex flex-col md:flex-row gap-6 items-center">
                      <code className="bg-black text-[#ccff00] px-4 py-2 text-sm font-bold shrink-0">{item.cmd}</code>
                      <p className="font-medium text-gray-600">{item.desc}</p>
                   </div>
                ))}
             </div>
          </section>

          {/* Git Integration */}
          <section id="git-integration" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[09] Integrations</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Git Providers.</h2>
                </div>
                <GitBranch className="w-12 h-12 text-[#ccff00]" />
             </div>
             <p className="text-xl font-medium leading-relaxed mb-8">
                Connect your repositories from top providers. We support one-click integration for:
             </p>
             <div className="flex flex-wrap gap-4">
                {["GitHub", "GitLab"].map(provider => (
                   <div key={provider} className="px-6 py-3 border-2 border-black font-black uppercase tracking-widest bg-white">
                      {provider}
                   </div>
                ))}
             </div>
          </section>

          {/* Webhooks */}
          <section id="webhooks" className="mb-32 scroll-mt-32">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-2 border-black pb-8 mb-12">
                <div>
                   <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[10] Integrations</p>
                   <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9]">Webhooks.</h2>
                </div>
                <Webhook className="w-12 h-12 text-[#ccff00]" />
             </div>
             <p className="text-xl font-medium leading-relaxed">
                Connect your existing tools to DevHQ via incoming and outgoing webhooks. Sync budget status to Slack, Discord, or custom internal systems.
             </p>
          </section>

          {/* Footer CTA */}
          <div className="bg-[#ccff00] border-2 border-black p-12 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center mt-24 mb-32">
            <h2 className="text-5xl md:text-7xl font-black uppercase mb-6 leading-none">Ready to <br/> Monitor?</h2>
            <Link 
              href="/waitlist"
              className="inline-flex items-center gap-4 bg-black text-white px-10 py-5 text-xl font-bold uppercase tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all group"
            >
              Join The Alpha
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </Link>
          </div>
        </main>
      </div>

      <footer className="bg-black text-white py-24 px-4 sm:px-8 border-t-2 border-black overflow-hidden relative">
         <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
            <div>
               <h2 className="text-[12vw] leading-[0.8] font-black tracking-tighter text-white/5 select-none uppercase pointer-events-none">
                  LOGIC_V1.0
               </h2>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-white/10 pt-12">
               <div className="flex flex-col gap-4">
                  <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">© 2026 DEVHQ INC. ARCHIVE v0.9.2</p>
               </div>
               <div className="flex flex-wrap gap-x-8 gap-y-4 justify-end">
                  <Link href="/" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Home</Link>
                  <Link href="/download" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">CLI</Link>
                  <Link href="/pricing" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Pricing</Link>
                  <Link href="/contact" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Contact</Link>
                  <Link href="/privacy-policy" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Privacy</Link>
                  <Link href="/terms-of-service" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Terms</Link>
                  <Link href="/login" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Login</Link>
               </div>
            </div>
         </div>
      </footer>
    </div>
  );
}
