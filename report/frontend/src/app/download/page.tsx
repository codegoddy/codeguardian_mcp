"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";
import { Logo } from "@/components/Logo";
import { 
  Download, 
  Shield, 
  CheckCircle2,
  X,
  Menu,
  Copy,
  Clock,
  GitBranch,
  Package
} from "lucide-react";

export default function DownloadPage() {
  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('linux');
  const [copied, setCopied] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf('Win') !== -1) setOS('windows');
    else if (userAgent.indexOf('Mac') !== -1) setOS('macos');
    else setOS('linux');
  }, []);

  const getInstallCommand = () => {
    // CLI scripts are hosted in public/cli directory
    const cliBaseUrl = 'https://www.devhq.site/cli';
    
    switch (os) {
      case 'macos':
        return `curl -fsSL ${cliBaseUrl}/install-macos.sh | sh`;
      case 'windows':
        return `curl -fsSL ${cliBaseUrl}/install-windows.ps1 | powershell`;
      default:
        return `curl -fsSL ${cliBaseUrl}/install.sh | sh`;
    }
  };



  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden relative">
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
            <Link href="/download" className="text-sm font-bold uppercase tracking-wider text-[#ccff00] bg-black px-3 py-1">CLI</Link>
            <Link href="/docs" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Docs</Link>
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

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-[#F5F5F0] pt-24 px-6 md:hidden overflow-y-auto">
          <div className="space-y-8 pb-12">
            <Link href="/#system" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>The System</Link>
            <Link href="/#manifesto" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>Manifesto</Link>
            <Link href="/download" className="text-2xl font-black uppercase tracking-tight text-[#ccff00] bg-black px-3 py-1 inline-block" onClick={() => setIsMobileMenuOpen(false)}>CLI</Link>
            <Link href="/docs" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>Docs</Link>
            <Link href="/pricing" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>Pricing</Link>
            <div className="h-px bg-black/10 my-2"></div>
            <Link href="/login" className="text-xl font-bold uppercase text-gray-500" onClick={() => setIsMobileMenuOpen(false)}>Login</Link>
            <Link href="/waitlist" className="bg-black text-[#ccff00] px-6 py-4 text-xl font-bold uppercase tracking-widest text-center block">Join Alpha</Link>
          </div>
        </div>
      )}

      <main className="relative pt-24 z-10 max-w-[1500px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_450px] gap-8">
          {/* Left Column: Hero & Installation */}
          <section className="py-8 md:py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-[#ccff00] font-mono text-[10px] uppercase tracking-[0.3em] mb-4">
              <Download className="w-3 h-3" />
              SYSTEM_LINK_READY_V1.0
            </div>
            
            <h1 className="text-7xl md:text-[11vw] font-[950] leading-[0.75] tracking-[-0.06em] text-black uppercase mb-8">
              ENFORCE <br/>
              THE <br/>
              <span className="bg-[#ccff00] px-2 text-black">CONTRACT.</span>
            </h1>

            <div className="max-w-2xl border-l-4 border-black pl-6 mb-12">
              <p className="text-xl md:text-2xl font-bold leading-tight uppercase tracking-tight italic">
                The impartial link between code and budget.
              </p>
              <p className="text-gray-500 font-mono text-sm mt-2 uppercase tracking-tight italic">
                {/* Monitor progress directly from your local shell. */}
                Monitor progress directly from your local shell.
              </p>
            </div>

            {/* High-Impact Terminal Installation Block */}
            <div className="bg-black text-white p-1 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-2xl overflow-hidden group">
              <div className="bg-[#F5F5F0] border-b border-black p-2 flex justify-between items-center">
                <div className="flex items-center gap-4 mb-8">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <span className="font-mono text-[10px] text-gray-500 uppercase tracking-widest">
                    {/* active_dist_node: 0x8291 */}
                    ACTIVE_DIST_NODE: 0X8291
                  </span>
                </div>
                <div className="flex gap-2">
                   {['macos', 'linux', 'windows'].map((opt) => (
                     <button
                       key={opt}
                       onClick={() => setOS(opt as 'windows' | 'macos' | 'linux')}
                       className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all border border-black/10 ${
                         os === opt ? 'bg-[#ccff00] text-black' : 'bg-white text-black/40 hover:text-black'
                       }`}
                     >
                       {opt === 'macos' ? 'MAC' : opt === 'windows' ? 'WIN' : 'NIX'}
                     </button>
                   ))}
                </div>
              </div>
              <div className="p-6 md:p-8 font-mono text-sm md:text-base">
                <div className="flex gap-4 items-start">
                  <span className="text-[#ccff00] font-black">{">_"}</span>
                  <code className="break-all text-white/90 selection:bg-[#ccff00] selection:text-black">{getInstallCommand()}</code>
                </div>
                
                <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between border-t border-white/5 pt-6">
                  <button
                    onClick={() => copyToClipboard(getInstallCommand())}
                    className="w-full md:w-auto flex items-center justify-center gap-3 bg-[#ccff00] text-black px-6 py-3 text-xs font-black uppercase tracking-widest hover:bg-white transition-all transform hover:-translate-y-1 active:translate-y-0"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        BUFFERED
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        INIT_DEPHQ_CLI
                      </>
                    )}
                  </button>
                  <p className="font-mono text-[9px] text-gray-500 uppercase tracking-widest">
                    Build: v0.9.2-dist
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Key Protocols / Features */}
          <aside className="lg:border-l-2 lg:border-black lg:pl-10 py-8 md:py-12">
            <h3 className="font-mono text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mb-8 border-b border-black/5 pb-2">
              CORE_PROTOCOLS
            </h3>
            
            <div className="space-y-12">
              {[
                { icon: Clock, title: "Silent Sync", desc: "Background daemons handle the heartbeats. Persistent across terminal restarts." },
                { icon: GitBranch, title: "Auth Hook", desc: "Native git integration. Every commit is mapped to a deliverable code automatically." },
                { icon: Shield, title: "Session Guard", desc: "Idle detection. Automatically pauses tracking to protect project runway." },
                { icon: Package, title: "Native Binary", desc: "Compiled Go binary. 4MB. Zero dependencies. Universal compatibility." }
              ].map((f, i) => (
                <div key={i} className="group cursor-default">
                  <div className="flex items-center gap-3 mb-3">
                    <f.icon className="w-5 h-5 text-black group-hover:text-[#ccff00] transition-colors" />
                    <h4 className="text-lg font-black uppercase tracking-tighter">{f.title}</h4>
                  </div>
                  <p className="text-gray-500 text-sm font-medium leading-snug">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-16 bg-black p-6">
               <h4 className="text-[#ccff00] font-mono text-[10px] font-black uppercase mb-4 tracking-widest">Quick Commands</h4>
               <div className="space-y-3">
                  {[
                    { cmd: 'devhq start <CODE>', label: 'init_work' },
                    { cmd: 'devhq status', label: 'check_runway' },
                    { cmd: 'devhq stop', label: 'term_session' }
                  ].map((c, i) => (
                    <div key={i} className="flex flex-col gap-1">
                       <span className="text-white/40 text-[9px] font-mono uppercase">{c.label}</span>
                       <code className="text-white font-mono text-xs">{c.cmd}</code>
                    </div>
                  ))}
               </div>
            </div>
          </aside>
        </div>

        {/* Action Call */}
        <div className="mt-20 mb-32 border-t-4 border-black pt-12 text-center lg:text-left">
           <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
              <h2 className="text-4xl md:text-6xl font-[950] uppercase leading-none tracking-tight">
                JOIN THE <br className="hidden lg:block"/> PROTOCOL.
              </h2>
              <Link 
                href="/waitlist"
                className="bg-black text-[#ccff00] px-12 py-6 text-xl font-black uppercase tracking-widest hover:bg-white hover:text-black border-4 border-black transition-all shadow-[8px_8px_0px_0px_rgba(204,255,0,1)]"
              >
                ACCESS_ALPHA
              </Link>
           </div>
        </div>
      </main>

      <footer className="bg-black text-white py-24 px-4 sm:px-8 border-t-2 border-black overflow-hidden relative">
         <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
            <div>
               <h2 className="text-[12vw] leading-[0.8] font-black tracking-tighter text-white/5 select-none uppercase pointer-events-none">
                  PHASE_1.0
               </h2>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-white/10 pt-12">
               <div className="flex flex-col gap-4">
                  <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">© 2026 DEVHQ INC. ARCHIVE v0.9.2</p>
               </div>
               <div className="flex flex-wrap gap-x-8 gap-y-4 justify-end">
                  <Link href="/" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Home</Link>
                  <Link href="/docs" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Docs</Link>
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
