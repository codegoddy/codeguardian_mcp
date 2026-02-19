"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, CheckCircle2, ArrowLeft, Loader2, Mail, Shield, Zap as ZapIcon } from "lucide-react";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";
import { Logo } from "@/components/Logo";

export default function WaitlistPage() {
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    company: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSuccess(true);
        setFormData({ email: "", full_name: "", company: "" });
      } else {
        const data = await response.json();
        if (response.status === 409) {
          setError("This email is already on the waitlist!");
        } else {
          setError(data.detail || "Failed to join waitlist. Please try again.");
        }
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden relative">
      <SoftwareApplicationSchema />
      <OrganizationSchema />
      <WebSiteSchema />
      
      {/* Noise Texture Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-40 mix-blend-multiply"></div>

      {/* Navigation */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/80 backdrop-blur-md border-b border-black/5">
        <nav className="max-w-[1400px] mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xs font-bold uppercase tracking-widest hover:underline transition-all flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <Link href="/login" className="text-xs font-bold uppercase tracking-widest hover:underline transition-all">
              Login
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative pt-24 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12 md:py-24">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24">
            
            {/* Left Sidebar: Identity & Status */}
            <div className="flex flex-col">
              <div className="sticky top-32">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-[#ccff00] text-[10px] font-bold uppercase tracking-[0.2em] mb-8 border border-black transform -rotate-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00] animate-pulse"></span>
                  Waitlist Active
                </div>
                
                <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.8] mb-12 uppercase">
                  ACCESS <br/>
                  <span className="bg-[#ccff00] px-2 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] inline-block mt-2">QUE.</span>
                </h1>

                <div className="space-y-12 max-w-md">
                   <div className="group">
                      <div className="flex items-center gap-4 mb-4">
                         <div className="w-10 h-10 border-2 border-black flex items-center justify-center group-hover:bg-[#ccff00] transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            <Shield className="w-5 h-5" />
                         </div>
                         <h3 className="text-lg font-black uppercase">Reserved Seats</h3>
                      </div>
                      <p className="font-bold text-gray-500 leading-tight">
                         Join the alpha protocol to reserve your position in the deployment queue.
                      </p>
                   </div>

                   <div className="group">
                      <div className="flex items-center gap-4 mb-4">
                         <div className="w-10 h-10 border-2 border-black flex items-center justify-center group-hover:bg-[#ccff00] transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            <ZapIcon className="w-5 h-5" />
                         </div>
                         <h3 className="text-lg font-black uppercase">Rapid Onboarding</h3>
                      </div>
                      <p className="font-bold text-gray-500 leading-tight">
                         Waitlist members get priority access to the CLI and technical support.
                      </p>
                   </div>
                </div>
              </div>
            </div>

            {/* Right Column: Form */}
            <div className="relative">
               {isSuccess ? (
                  <div className="bg-[#ccff00] border-2 border-black p-12 md:p-16 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
                     <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mx-auto mb-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)]">
                        <CheckCircle2 className="w-14 h-14 text-[#ccff00]" />
                     </div>
                     <h2 className="text-4xl md:text-5xl font-black mb-6 uppercase tracking-tighter">PROTOCOL_JOINED</h2>
                     <p className="text-xl font-bold mb-10 max-w-sm mx-auto leading-tight">
                        YOU ARE NOW RECORDED IN THE ARCHIVE. WE WILL NOTIFY YOU VIA THE PROVIDED ENCRYPTION LINK.
                     </p>
                     <Link 
                        href="/" 
                        className="inline-flex items-center gap-4 bg-black text-white px-10 py-5 text-xl font-bold uppercase border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                     >
                        <ArrowLeft className="w-6 h-6" />
                        Init_Exit
                     </Link>
                  </div>
               ) : (
                  <div className="bg-white border-2 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                     <form onSubmit={handleSubmit} className="space-y-10">
                        <div className="space-y-4">
                           <label htmlFor="email" className="block text-sm font-bold uppercase px-4 italic opacity-70">
                              Encryption Link [Email] *
                           </label>
                           <div className="relative">
                              <input
                                 type="email"
                                 id="email"
                                 name="email"
                                 required
                                 value={formData.email}
                                 onChange={handleChange}
                                 placeholder="ID@DOMAIN.COM"
                                 className="w-full px-8 py-5 border-2 border-black font-bold uppercase text-xl focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] placeholder:text-gray-300 transition-all rounded-full"
                              />
                              <Mail className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-6 text-black/20" />
                           </div>
                        </div>

                        <div className="space-y-4">
                           <label htmlFor="full_name" className="block text-sm font-bold uppercase px-4 italic opacity-70">
                              Identity Label [Name] *
                           </label>
                           <input
                              type="text"
                              id="full_name"
                              name="full_name"
                              required
                              value={formData.full_name}
                              onChange={handleChange}
                              placeholder="FULL_IDENTITY"
                              className="w-full px-8 py-5 border-2 border-black font-bold uppercase text-xl focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] placeholder:text-gray-300 transition-all rounded-full"
                           />
                        </div>

                        <div className="space-y-4">
                           <label htmlFor="company" className="block text-sm font-bold uppercase px-4 italic opacity-70">
                              Node ID [Organization]
                           </label>
                           <input
                              type="text"
                              id="company"
                              name="company"
                              value={formData.company}
                              onChange={handleChange}
                              placeholder="ENTITY_LABEL"
                              className="w-full px-8 py-5 border-2 border-black font-bold uppercase text-xl focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] placeholder:text-gray-300 transition-all rounded-full"
                           />
                        </div>

                        {error && (
                           <div className="bg-black text-[#ff4444] border-2 border-[#ff4444] p-4 px-6 font-mono text-xs uppercase font-bold flex items-center gap-3 rounded-full">
                              <div className="w-2 h-2 bg-[#ff4444] animate-pulse"></div>
                              {error}
                           </div>
                        )}

                        <button
                           type="submit"
                           disabled={isSubmitting}
                           className="w-full bg-[#ccff00] text-black px-10 py-6 text-2xl font-bold uppercase border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4"
                        >
                           {isSubmitting ? (
                              <>
                                 <Loader2 className="w-8 h-8 animate-spin" />
                                 Joining_Queue...
                              </>
                           ) : (
                              <>
                                 Join Waitlist
                                 <Zap className="w-6 h-6" fill="currentColor" />
                              </>
                           )}
                        </button>
                     </form>
                  </div>
               )}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-black text-white py-24 px-4 sm:px-8 border-t-2 border-black overflow-hidden relative">
         <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
            <div>
               <h2 className="text-[12vw] leading-[0.8] font-black tracking-tighter text-white/5 select-none uppercase pointer-events-none">
                  ACCESS_NODE
               </h2>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-white/10 pt-12">
               <div className="flex flex-col gap-4">
                  <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">© 2026 DEVHQ INC. ARCHIVE v0.9.2</p>
               </div>
               <div className="flex flex-wrap gap-x-8 gap-y-4 justify-end">
                  <Link href="/" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Home</Link>
                  <Link href="/docs" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Docs</Link>
                  <Link href="/download" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">CLI</Link>
                  <Link href="/pricing" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Pricing</Link>
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
