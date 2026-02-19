"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden relative">
      <SoftwareApplicationSchema />
      <OrganizationSchema />
      <WebSiteSchema />
      
      {/* Noise Texture Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-40 mix-blend-multiply"></div>

      {/* Navigation */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/80 backdrop-blur-md border-b border-black">
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          
          <Link href="/" className="text-xs font-black uppercase tracking-[0.2em] border-2 border-black px-6 py-2 hover:bg-[#ccff00] transition-colors flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            BACK
          </Link>
        </nav>
      </header>

      <main className="relative pt-32 pb-32 z-10 max-w-[1400px] mx-auto px-4 sm:px-8">
        {/* Hero Section */}
        <section className="mb-24">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-black text-[#ccff00] font-mono text-[10px] uppercase tracking-[0.4em] mb-12 shadow-[4px_4px_0px_0px_rgba(204,255,0,0.3)]">
            <Shield className="w-4 h-4" />
            Security_Audit_V1.0
          </div>
          
          <h1 className="text-7xl md:text-[120px] font-[950] leading-[0.75] tracking-tighter text-black uppercase mb-12">
            THE <br/>
            <span className="bg-[#ccff00] px-2 text-black">PROTOCOL.</span>
          </h1>

          <p className="text-2xl font-bold max-w-lg leading-tight mb-8 text-gray-800">
             Privacy is not a feature. <br/>
             <span className="text-gray-400">It is the foundation of the contract.</span>
          </p>
        </section>

        {/* Content Box */}
        <div className="bg-white border-4 border-black p-8 md:p-16 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] max-w-4xl">
          <div className="prose prose-lg max-w-none">
            <div className="bg-[#F5F5F0] border-2 border-black p-6 mb-12 font-mono text-sm uppercase font-bold text-black flex items-center justify-between">
               <span>Last updated: 2026.01.01</span>
               <span className="opacity-40 italic">ARCHIVE_STATUS: ACTIVE</span>
            </div>

            <div className="space-y-12 font-mono text-sm leading-relaxed text-gray-700">
               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">01</span>
                     Terminal Access
                  </h2>
                  <p>
                    Welcome to DevHQ. We respect your privacy and are committed to protecting your personal data. 
                    This privacy policy will inform you as to how we look after your personal data when you visit 
                    our website and tell you about your privacy rights and how the law protects you.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">02</span>
                     Data Collection
                  </h2>
                  <p>
                    We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:
                  </p>
                  <ul className="list-disc pl-5 mt-4 space-y-2">
                    <li><strong>Identity Data:</strong> first name, last name, username.</li>
                    <li><strong>Contact Data:</strong> email address and communication logs.</li>
                    <li><strong>Technical Data:</strong> IP address, login data, browser encrypted signatures.</li>
                    <li><strong>Usage Data:</strong> information about how you interact with the CLI and Web nodes.</li>
                  </ul>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">03</span>
                     Execution Flow
                  </h2>
                  <p>
                    We will only use your personal data when the law allows us to. Most commonly, we use your data to:
                  </p>
                  <ul className="list-disc pl-5 mt-4 space-y-2">
                    <li>Initialize and enforce project contracts.</li>
                    <li>Maintain repository guardrails via the CLI.</li>
                    <li>Comply with legal or regulatory audits.</li>
                  </ul>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">04</span>
                     System Security
                  </h2>
                  <p>
                    We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed. Encryption is active at the transport and rest levels.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">05</span>
                     Node Communications
                  </h2>
                  <p>
                    If you have any questions about this privacy policy or our privacy practices, please initialize a transmission at: <br/> 
                    <Link href="/contact" className="text-black font-black underline hover:bg-[#ccff00]">CONTACT_SUPPORT</Link>
                  </p>
               </section>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-black text-white py-24 px-4 sm:px-8 border-t-2 border-black relative z-10 overflow-hidden">
         <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
            <div>
               <h2 className="text-[12vw] leading-[0.8] font-black tracking-tighter text-white/5 select-none uppercase pointer-events-none">
                  LEGAL_NODE
               </h2>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-white/10 pt-12">
               <div className="flex flex-col gap-4">
                  <p className="font-mono text-[10px] text-gray-500 tracking-[0.2em] uppercase">© 2026 DEVHQ INC. ARCHIVE v0.9.2</p>
               </div>
               <div className="flex flex-wrap gap-x-8 gap-y-4 justify-end">
                  <Link href="/" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Home</Link>
                  <Link href="/docs" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Docs</Link>
                  <Link href="/download" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">CLI</Link>
                  <Link href="/pricing" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Pricing</Link>
                  <Link href="/contact" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Contact</Link>
                  <Link href="/terms-of-service" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Terms</Link>
               </div>
            </div>
         </div>
      </footer>
    </div>
  );
}
