"use client";

import Link from "next/link";
import { ArrowLeft, Gavel } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";

export default function TermsOfService() {
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
            <Gavel className="w-4 h-4" />
            Legal_Framework_V1.1
          </div>
          
          <h1 className="text-7xl md:text-[120px] font-[950] leading-[0.75] tracking-tighter text-black uppercase mb-12">
            THE <br/>
            <span className="bg-[#ccff00] px-2 text-black">CONTRACT.</span>
          </h1>

          <p className="text-2xl font-bold max-w-lg leading-tight mb-8 text-gray-800">
             Rules of engagement. <br/>
             <span className="text-gray-400">By using the node, you accept the protocol.</span>
          </p>
        </section>

        {/* Content Box */}
        <div className="bg-white border-4 border-black p-8 md:p-16 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] max-w-4xl">
          <div className="prose prose-lg max-w-none">
            <div className="bg-[#ccff00] border-2 border-black p-6 mb-12 font-mono text-sm uppercase font-bold text-black flex items-center justify-between">
               <span>Last updated: 2026.01.01</span>
               <span className="opacity-40 italic">BINDING_VERSION: 1.1</span>
            </div>

            <div className="space-y-12 font-mono text-sm leading-relaxed text-gray-700">
               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">01</span>
                     Agreement to Terms
                  </h2>
                  <p>
                    By accessing our website and using our services, you agree to be bound by these Terms of Service. 
                    If you do not agree to abide by the terms of this agreement, you are not authorized to use or access the website and its services.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">02</span>
                     Service Protocol
                  </h2>
                  <p>
                    DevHQ provides a platform for developers and clients to manage project retainers, automate payments, and control repository access. 
                    We reserve the right to modify, suspend, or discontinue the service at any time without notice.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">03</span>
                     Node Registration
                  </h2>
                  <p>
                    To access certain features of the platform, you must register for an account. You agree to provide accurate, current, and complete information during the registration process and to keep it updated.
                  </p>
                  <p className="mt-4">
                    You are responsible for safeguarding your credentials and for all activities that occur under your account.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">04</span>
                     Value Exchange (Payments)
                  </h2>
                  <p>
                    DevHQ facilitates value transfers between nodes. By using the payment features, you agree to the terms of our third-party processors. Fees for the service are described on our pricing page and are subject to immediate audit/change.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">05</span>
                     Intellectual Property
                  </h2>
                  <p>
                    The service and its original content, features, and functionality are and will remain the exclusive property of DevHQ and its licensors. The service is protected by copyright, trademark, and other laws.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">06</span>
                     Liability Matrix
                  </h2>
                  <p>
                    In no event shall DevHQ, nor its directors, employees, partners, or affiliates, be liable for any indirect, incidental, special, or consequential damages resulting from your access to or use of the node.
                  </p>
               </section>

               <section>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-4 flex items-center gap-3">
                     <span className="bg-black text-white w-8 h-8 flex items-center justify-center text-xs">07</span>
                     Dispute Initialization
                  </h2>
                  <p>
                    If you have any questions about these Terms, please initialize a transmission at: <br/> 
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
                  <Link href="/privacy-policy" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Privacy</Link>
               </div>
            </div>
         </div>
      </footer>
    </div>
  );
}
