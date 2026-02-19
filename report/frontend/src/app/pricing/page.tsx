"use client";

import Link from "next/link";
import { useState } from "react";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";
import { Logo } from "@/components/Logo";
import { 
  Check, 
  Lock, 
  Zap, 
  Shield, 
  Star,
  Menu,
  X
} from "lucide-react";

export default function PricingPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const TierCard = ({ 
    name, 
    price, 
    features, 
    locked = false, 
    accent = false,
    delay = "0s"
  }: { 
    name: string, 
    price: string, 
    features: string[], 
    locked?: boolean, 
    accent?: boolean,
    delay?: string
  }) => (
    <div 
      className={`relative border-4 border-black p-8 md:p-10 flex flex-col h-full transition-all hover:-translate-y-2 hover:-translate-x-2 hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] ${
        accent ? 'bg-[#ccff00] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' : 'bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
      }`}
      style={{ animationDelay: delay }}
    >
      {locked && (
        <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
          <Lock className="w-3 h-3" />
          Locked
        </div>
      )}
      
      <div className="mb-8">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">{name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-[950] tracking-tighter">{price}</span>
          {price !== "Free" && <span className="font-bold text-gray-500">/mo</span>}
        </div>
      </div>

      <ul className="space-y-4 mb-12 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 font-bold text-sm uppercase leading-tight">
            <Check className="w-5 h-5 shrink-0" />
            {feature}
          </li>
        ))}
      </ul>

      <button 
        disabled={locked}
        className={`w-full py-4 text-sm font-black uppercase tracking-widest border-2 border-black transition-all ${
          locked 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : accent ? 'bg-black text-white hover:bg-white hover:text-black' : 'bg-[#ccff00] text-black hover:bg-black hover:text-white'
        }`}
      >
        {locked ? 'COMING_V1.1' : 'START_FREE'}
      </button>
    </div>
  );

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
            <Link href="/download" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">CLI</Link>
            <Link href="/docs" className="text-sm font-bold uppercase tracking-wider hover:text-gray-500 transition-colors">Docs</Link>
            <Link href="/pricing" className="text-sm font-bold uppercase tracking-wider text-[#ccff00] bg-black px-3 py-1">Pricing</Link>
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
            <Link href="/download" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>CLI</Link>
            <Link href="/docs" className="text-2xl font-black uppercase tracking-tight block" onClick={() => setIsMobileMenuOpen(false)}>Docs</Link>
            <Link href="/pricing" className="text-2xl font-black uppercase tracking-tight text-[#ccff00] bg-black px-3 py-1 inline-block" onClick={() => setIsMobileMenuOpen(false)}>Pricing</Link>
            <div className="h-px bg-black/10 my-2"></div>
            <Link href="/login" className="text-xl font-bold uppercase text-gray-500" onClick={() => setIsMobileMenuOpen(false)}>Login</Link>
            <Link href="/waitlist" className="bg-black text-[#ccff00] px-6 py-4 text-xl font-bold uppercase tracking-widest text-center block">Join Alpha</Link>
          </div>
        </div>
      )}

      <main className="relative pt-32 pb-32 z-10 max-w-[1400px] mx-auto px-4 sm:px-8">
        {/* Hero Section */}
        <section className="mb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-black text-[#ccff00] font-mono text-xs uppercase tracking-[0.3em] mb-8 animate-fade-in-up">
            <Zap className="w-4 h-4" />
            Pricing_Protocol_V1.0
          </div>
          
          <h1 className="text-7xl md:text-[10vw] font-[950] leading-[0.7] tracking-tighter text-black uppercase mb-12 animate-fade-in-up">
            UNIFORM <br/>
            <span className="bg-[#ccff00] px-2 text-black">VALUATION.</span>
          </h1>

          <div className="inline-block bg-black border-4 border-black px-8 py-6 shadow-[8px_8px_0px_0px_rgba(204,255,0,1)] mb-8">
            <span className="text-2xl md:text-3xl font-[950] uppercase tracking-tighter text-[#ccff00]">Pricing Under Review</span>
          </div>
          
          <p className="text-xl md:text-2xl font-bold text-gray-600 max-w-2xl mx-auto mb-20 leading-relaxed">
            We're currently in Alpha and refining our pricing model based on user feedback. 
            <span className="text-black"> All features are free during the Alpha period.</span>
          </p>
        </section>

        {/* Dynamic Pricing Grid */}
        <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto mb-32">
          <TierCard 
            name="Alpha" 
            price="Free" 
            features={[
              "Up to 3 Projects",
              "Local CLI History",
              "Standard Git Hooks",
              "Community Support"
            ]}
          />
          <TierCard 
            name="Professional" 
            price="$19" 
            accent={true}
            locked={true}
            features={[
              "Unlimited Projects",
              "Cloud Log Syncing",
              "Advanced Guardrails",
              "Priority API Access",
              "Webhooks & Integrations"
            ]}
          />
          <TierCard 
            name="Enterprise" 
            price="Custom" 
            locked={true}
            features={[
              "Self-Hosted Node",
              "SLA Protection",
              "Custom Enforcement",
              "Compliance Reports",
              "Direct Engineering Support"
            ]}
          />
        </div>

        {/* High-Impact Comparison */}
        <div className="bg-black text-white p-12 md:p-20 shadow-[16px_16px_0px_0px_rgba(204,255,0,1)] relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <Shield className="w-64 h-64" />
           </div>
           
           <h2 className="text-4xl md:text-6xl font-[950] uppercase leading-none tracking-tighter mb-12 relative z-10">
              One Price for <br className="hidden md:block"/> Absolute Control.
           </h2>

           <div className="grid md:grid-cols-2 gap-12 relative z-10">
              <div className="p-8 border-2 border-white/20 bg-white/5 backdrop-blur-sm">
                 <Star className="w-10 h-10 text-[#ccff00] mb-6" />
                 <h3 className="text-2xl font-black uppercase mb-4">No Per-Seat.</h3>
                 <p className="text-gray-400 font-medium leading-relaxed">
                    We charge per active monitoring project, not per developer. Scale your team without scaling your subscription.
                 </p>
              </div>
              <div className="p-8 border-2 border-[#ccff00] bg-[#ccff00]/5 backdrop-blur-sm">
                 <Zap className="w-10 h-10 text-[#ccff00] mb-6" />
                 <h3 className="text-2xl font-black uppercase mb-4">Native Performance.</h3>
                 <p className="text-gray-400 font-medium leading-relaxed">
                    The DevHQ CLI is a lightweight Go binary. It monitors project status with zero overhead and full local privacy.
                 </p>
              </div>
           </div>
        </div>

        {/* Footer Year Fix */}
        <div className="mt-40 pt-12 border-t-4 border-black flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="text-center md:text-left">
              <h2 className="text-4xl font-black uppercase leading-tight tracking-tight">Access The <br/> Source Code.</h2>
           </div>
           <Link 
              href="/waitlist"
              className="bg-black text-[#ccff00] px-10 py-5 text-xl font-black uppercase tracking-widest hover:bg-[#ccff00] hover:text-black border-4 border-black transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
           >
              Join Alpha
           </Link>
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
                  <Link href="/download" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">CLI</Link>
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
