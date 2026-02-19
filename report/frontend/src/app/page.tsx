"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../contexts/AuthContext";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "../components/StructuredData";
import { Logo } from "../components/Logo";
import { ArrowRight, Menu, GitBranch, FileCode, Camera } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);


  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden">
      <SoftwareApplicationSchema />
      <OrganizationSchema />
      <WebSiteSchema />
      
      {/* Noise Texture Overlay - Optimized */}
      <div 
        className="fixed inset-0 z-0 bg-noise opacity-30 mix-blend-multiply gpu-accelerated"
        aria-hidden="true"
      />

      {/* Navigation - Minimalist - Optimized */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/90 border-b border-black/5 gpu-accelerated">
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#system" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">The System</a>
            <a href="#manifesto" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Manifesto</a>
            <Link href="/download" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">CLI</Link>
            <Link href="/docs" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Docs</Link>
            <Link href="/pricing" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Pricing</Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-sm font-bold uppercase tracking-wider hover:underline">
              Login
            </Link>
            <Link href="/waitlist" className="bg-black text-[#ccff00] px-6 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-gray-900 transition-colors">
              Join Alpha
            </Link>
          </div>

          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 border-2 border-black/10 rounded-md"
          >
            <Menu className="w-6 h-6" />
          </button>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute top-16 left-0 w-full bg-[#F5F5F0] border-b border-black p-8 flex flex-col gap-6 md:hidden shadow-xl z-50">
            <Link href="/docs" className="text-2xl font-black uppercase tracking-tight" onClick={() => setMobileMenuOpen(false)}>Docs</Link>
            <Link href="/download" className="text-2xl font-black uppercase tracking-tight" onClick={() => setMobileMenuOpen(false)}>Download CLI</Link>
            <a href="#manifesto" className="text-2xl font-black uppercase tracking-tight" onClick={() => setMobileMenuOpen(false)}>Manifesto</a>
            <a href="#system" className="text-2xl font-black uppercase tracking-tight" onClick={() => setMobileMenuOpen(false)}>The System</a>
            <Link href="/pricing" className="text-2xl font-black uppercase tracking-tight" onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
            <div className="h-px bg-black/10 my-2"></div>
            <Link href="/login" className="text-xl font-bold uppercase text-gray-500" onClick={() => setMobileMenuOpen(false)}>Login</Link>
          </div>
        )}
      </header>

      <main className="relative pt-20 z-10">
        
        {/* 1. THE STATEMENT (Hero) */}
        <section className="min-h-[90vh] flex flex-col justify-center px-4 sm:px-8 max-w-[1400px] mx-auto relative">
           <div className="absolute top-0 right-0 p-4 opacity-50 hidden md:block">
              <p className="font-mono text-xs">v0.9.2 (BETA)</p>
           </div>
           
           <div className="max-w-5xl">
              <h1 className="text-editorial-huge mb-8 leading-[0.85] text-black">
                ENFORCE <br/>
                THE <span className="bg-[#ccff00] px-2 text-black">CONTRACT.</span>
              </h1>
              
              <div className="flex flex-col md:flex-row gap-8 md:items-end justify-between border-t-2 border-black pt-8 mt-12">
                 <p className="text-xl sm:text-2xl font-medium max-w-xl leading-snug">
                    The financial guardrail for independent developers. 
                    <span className="text-gray-500"> We automatically revoke repo access when the retainer runs dry.</span>
                 </p>
                 
                 <Link href="/waitlist" className="group flex items-center gap-4 text-xl font-bold uppercase tracking-widest border-2 border-black px-8 py-4 bg-white hover:bg-black hover:text-white transition-all">
                    Start The Protocol
                    <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                 </Link>
              </div>
           </div>
        </section>

        {/* 2. THE PROBLEM (The Brutalist List) */}
        <section id="manifesto" className="py-24 sm:py-32 px-4 sm:px-8 bg-[#EAEAE5]">
           <div className="max-w-[1400px] mx-auto">
              <div className="sticky top-16 md:top-20 z-30 bg-[#EAEAE5] mb-16 md:mb-24 flex flex-col md:flex-row justify-between items-end gap-6 border-b border-black/10 pb-8 pt-4 gpu-accelerated">
                 <div>
                    <p className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">[01] The Reality</p>
                    <h2 className="text-5xl md:text-7xl font-black uppercase leading-none">The Freelance <br/> Fatigue.</h2>
                 </div>
                 <p className="text-xl font-medium max-w-md text-right md:text-left">
                    The creative work is easy. <br/> Getting paid for it is the hard part.
                 </p>
              </div>
              
              <div className="flex flex-col border-t-2 border-black">
                 {/* Item 1 */}
                 <div className="group border-b-2 border-black py-12 md:py-16 hover:bg-white transition-colors cursor-default">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                       <h3 className="text-4xl md:text-6xl font-black uppercase text-gray-400 group-hover:text-black transition-colors w-full md:w-1/2">
                          01. Scope Creep
                       </h3>
                       <div className="max-w-md">
                          <p className="text-lg md:text-xl font-bold mb-2">&quot;Just one small tweak...&quot;</p>
                          <p className="text-gray-600">The project ended 3 weeks ago. The client is still emailing requests. You are effectively working for free.</p>
                       </div>
                       <div className="hidden md:block">
                          <ArrowRight className="w-8 h-8 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all" />
                       </div>
                    </div>
                 </div>

                 {/* Item 2 */}
                 <div className="group border-b-2 border-black py-12 md:py-16 hover:bg-[#111] hover:text-white transition-colors cursor-default">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                       <h3 className="text-4xl md:text-6xl font-black uppercase text-gray-400 group-hover:text-white transition-colors w-full md:w-1/2">
                          02. Chasing Pay
                       </h3>
                       <div className="max-w-md">
                          <p className="text-lg md:text-xl font-bold mb-2">&quot;Check is in the mail.&quot;</p>
                          <p className="text-gray-500 group-hover:text-gray-400">Your code is live. Their business is running on it. Your bank account is still empty.</p>
                       </div>
                       <div className="hidden md:block">
                          <ArrowRight className="w-8 h-8 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all text-[#ccff00]" />
                       </div>
                    </div>
                 </div>

                 {/* Item 3 */}
                 <div className="group border-b-2 border-black py-12 md:py-16 hover:bg-[#ccff00] transition-colors cursor-default">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                       <h3 className="text-4xl md:text-6xl font-black uppercase text-gray-400 group-hover:text-black transition-colors w-full md:w-1/2">
                          03. The Awkwardness
                       </h3>
                       <div className="max-w-md">
                          <p className="text-lg md:text-xl font-bold mb-2">Relationship Breakdown.</p>
                          <p className="text-gray-600 group-hover:text-black">Asking for money is uncomfortable. It builds resentment and kills the creative vibe.</p>
                       </div>
                       <div className="hidden md:block">
                          <ArrowRight className="w-8 h-8 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all text-black" />
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* 3. THE PROTOCOL STACK (Solution) */}
        <section id="system" className="bg-black text-white py-32">
           <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
              
              {/* Header - Sticky - Optimized */}
              <div className="sticky top-16 md:top-20 z-40 bg-black mb-24 border-b border-white/20 pb-8 pt-8 gpu-accelerated">
                 <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                    <div>
                       <p className="font-mono text-sm text-[#ccff00] uppercase tracking-widest mb-4">[02] The System</p>
                       <h2 className="text-6xl md:text-8xl font-black uppercase leading-none tracking-tighter">Code is <br/> Currency.</h2>
                    </div>
                    <p className="text-xl text-gray-400 max-w-md text-right md:text-left">
                       We act as the impartial executioner. <br/> Your work is automatically quantified and billed.
                    </p>
                 </div>
              </div>

              {/* STACK ITEM 1: INGEST (Terminal) */}
              <div className="group relative border-l-2 border-white/10 pl-8 md:pl-16 py-12 mb-24 transition-colors hover:border-[#ccff00]">
                 <div className="flex flex-col xl:flex-row gap-16">
                    <div className="xl:w-1/3">
                       <span className="font-mono text-[#ccff00] text-sm mb-4 block">01. INGEST</span>
                       <h3 className="text-4xl md:text-5xl font-bold mb-6">Commit-to-Cash.</h3>
                       <p className="text-xl text-gray-400 leading-relaxed">
                          Forget manual time tracking. We parse your git commits to log hours automatically. Every line of code is linked to a deliverable.
                       </p>
                    </div>
                    
                    <div className="xl:w-2/3 w-full">
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
                                <span>git push origin feature/auth-api</span>
                             </div>
                             <div className="pl-6 text-gray-500 text-xs md:text-sm">
                                <p>Enumerating objects: 15, done.</p>
                                <p>Counting objects: 100% (15/15), done.</p>
                                <p>Writing objects: 100% (15/15), 3.24 KiB, done.</p>
                             </div>
                             <div className="flex gap-4 pt-4 animate-pulse">
                                <span className="text-[#ccff00]">&gt;&gt;</span>
                                 <span className="text-white">DEVHQ_AGENT: Parsing commit &quot;feat: implement auth middleware [3h]&quot;...</span>
                             </div>
                             <div className="flex gap-4 text-[#ccff00]">
                                <span>&gt;&gt;</span>
                                 <span>LOGGED: 3.0 Hours ($450.00) to &quot;Backend Infrastructure&quot;</span>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* STACK ITEM 2: MONITOR (Budget) */}
              <div className="group relative border-l-2 border-white/10 pl-8 md:pl-16 py-12 mb-24 transition-colors hover:border-[#ccff00]">
                 <div className="flex flex-col xl:flex-row gap-16">
                    <div className="xl:w-1/3">
                       <span className="font-mono text-[#ccff00] text-sm mb-4 block">02. MONITOR</span>
                       <h3 className="text-4xl md:text-5xl font-bold mb-6">Retainer Burn.</h3>
                       <p className="text-xl text-gray-400 leading-relaxed">
                          Watch the budget burn in real-time. Both you and the client see exactly how much runway is left. No surprises.
                       </p>
                    </div>
                    
                    <div className="xl:w-2/3 w-full">
                       <div className="bg-[#111] border border-white/10 rounded-xl p-6 md:p-12">
                          <div className="flex justify-between items-center mb-4">
                             <span className="text-sm font-bold text-gray-500 tracking-widest">RETAINER HEALTH</span>
                             <span className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                <span className="text-xs font-mono text-white">LIVE</span>
                             </span>
                          </div>
                          <div className="flex items-baseline gap-2 sm:gap-4 mb-8 flex-wrap">
                             <span className="text-5xl sm:text-6xl md:text-8xl font-black text-white tracking-tighter">$850.00</span>
                             <span className="text-lg sm:text-xl text-gray-500 font-mono">/ $5,000.00</span>
                          </div>
                          
                          <div className="relative w-full h-6 bg-black rounded-full overflow-hidden border border-white/10">
                             <div className="absolute top-0 left-0 h-full bg-[#ccff00] w-[17%]"></div>
                             {/* Markers */}
                             <div className="absolute top-0 left-[25%] h-full w-px bg-white/20"></div>
                             <div className="absolute top-0 left-[50%] h-full w-px bg-white/20"></div>
                             <div className="absolute top-0 left-[75%] h-full w-px bg-white/20"></div>
                          </div>
                          
                          <div className="flex justify-between mt-4 text-xs font-mono text-gray-500">
                             <span className="text-[#ccff00]">LOW BALANCE WARNING</span>
                             <span>RENEWAL REQUIRED</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* STACK ITEM 3: VERIFY (Proof) */}
              <div className="group relative border-l-2 border-white/10 pl-8 md:pl-16 py-12 transition-colors hover:border-[#ccff00]">
                 <div className="flex flex-col xl:flex-row gap-16">
                    <div className="xl:w-1/3">
                       <span className="font-mono text-[#ccff00] text-sm mb-4 block">03. VERIFY</span>
                       <h3 className="text-4xl md:text-5xl font-bold mb-6">Proof of Work.</h3>
                       <p className="text-xl text-gray-400 leading-relaxed">
                          Zero disputes. We proof work using git commits and file changes directly from your local environment. Optional manual screenshots for complete transparency.
                       </p>
                    </div>
                    
                    <div className="xl:w-2/3 w-full">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                              { label: "COMMIT_LOG.patch", Icon: GitBranch },
                              { label: "DIFF_STAT.json", Icon: FileCode },
                              { label: "SCREEN_01.jpg", Icon: Camera },
                              { label: "SCREEN_02.jpg", Icon: Camera }
                           ].map((item, i) => (
                              <div key={i} className="aspect-square bg-[#111] border border-white/10 rounded-lg p-2 hover:border-[#ccff00] transition-colors group/item flex flex-col items-center justify-center">
                                 <div className="w-full h-full bg-[#222] rounded flex flex-col items-center justify-center relative overflow-hidden p-2">
                                    <div className="absolute inset-0 bg-noise opacity-20"></div>
                                    <item.Icon className="w-6 h-6 text-gray-600 mb-2 group-hover/item:text-[#ccff00] transition-colors" />
                                    <span className="font-mono text-[8px] text-gray-600 text-center uppercase tracking-tighter">{item.label}</span>
                                 </div>
                              </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>

           </div>
        </section>

        {/* 4. FOOTER (Minimalist) */}
         <footer className="bg-[#F5F5F0] py-24 px-4 sm:px-8 border-t-2 border-black overflow-hidden relative">
            <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
             <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <h2 className="text-[12vw] leading-[0.8] font-black tracking-tighter text-black/10 select-none pointer-events-none">
                   DEVHQ
                </h2>
                <div className="flex flex-col items-start lg:items-end gap-2 text-right">
                   <Link href="/waitlist" className="text-4xl md:text-5xl font-black uppercase hover:bg-[#ccff00] hover:px-2 transition-all inline-block">Join Alpha</Link>
                   <Link href="/login" className="text-4xl md:text-5xl font-black uppercase hover:bg-[#ccff00] hover:px-2 transition-all inline-block">Login</Link>
                   <Link href="/contact" className="text-4xl md:text-5xl font-black uppercase hover:bg-[#ccff00] hover:px-2 transition-all inline-block">Contact</Link>
                </div>
             </div>
             
             <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-black/5 pt-12">
                <div className="flex flex-col gap-4">
                   <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">© 2026 DEVHQ INC. SYSTEM ACTIVE.</p>
                   <div className="flex gap-6">
                      <Link href="/privacy-policy" className="text-[10px] font-black uppercase tracking-widest hover:underline transition-all">Privacy Protocol</Link>
                      <Link href="/terms-of-service" className="text-[10px] font-black uppercase tracking-widest hover:underline transition-all">Legal Contract</Link>
                   </div>
                </div>
             </div>
            </div>
         </footer>

      </main>
    </div>
  );
}
