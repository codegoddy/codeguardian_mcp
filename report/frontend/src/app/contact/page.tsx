"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, ArrowRight } from "lucide-react";
import { ApiService } from "../../services/api";
import { Logo } from "@/components/Logo";
import { SoftwareApplicationSchema, OrganizationSchema, WebSiteSchema } from "@/components/StructuredData";

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormInputProps {
  label: string;
  id: string;
  name: keyof FormData;
  type?: string;
  placeholder: string;
  required?: boolean;
  textarea?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const FormInput = ({ label, id, name, type = "text", placeholder, required = true, textarea = false, value, onChange }: FormInputProps) => (
  <div className="mb-6">
    <label htmlFor={id} className="block text-sm font-bold uppercase mb-2 px-4 italic opacity-70">
      {label} {required && "*" }
    </label>
    {textarea ? (
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        rows={5}
        className="w-full px-6 py-4 bg-white text-black border-2 border-black focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all font-bold placeholder:text-gray-300 resize-none rounded-3xl"
        placeholder={placeholder}
      />
    ) : (
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-6 py-4 bg-white text-black border-2 border-black focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all font-bold placeholder:text-gray-300 rounded-full"
        placeholder={placeholder}
      />
    )}
  </div>
);

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await ApiService.post("/api/support/contact", formData);
      if (response) {
        setSubmitStatus("success");
        setFormData({ name: "", email: "", subject: "", message: "" });
      } else {
        throw new Error("Failed to send message");
      }
    } catch (err) {
      setSubmitStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "AN UNKNOWN ERROR OCCURRED");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-black font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden relative">
      <SoftwareApplicationSchema />
      <OrganizationSchema />
      <WebSiteSchema />
      
      {/* Noise Texture Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-40 mix-blend-multiply"></div>

      {/* Navigation */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/80 backdrop-blur-md">
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

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 pt-32 pb-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Identity Side */}
          <div className="space-y-12">
            <div>
               <p className="font-mono text-sm text-gray-500 uppercase tracking-widest mb-4">Node_Support_Channel [05]</p>
               <h1 className="text-7xl md:text-9xl font-black uppercase leading-[0.85] tracking-tighter">
                  Contact <br/> <span className="text-[#ccff00] stroke-black stroke-2" style={{ WebkitTextStroke: '2px black' }}>Core.</span>
               </h1>
            </div>

            <div className="bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
               <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-gray-400">Technical_Relay</h3>
               <p className="text-lg font-bold leading-tight">SUPPORT@DEVHQ.SITE</p>
            </div>
          </div>

          {/* Form Side */}
          <div className="bg-white border-2 border-black p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-fade-in-up">
            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-x-6">
                <FormInput
                  label="Identifier"
                  id="name"
                  name="name"
                  placeholder="CONTRACTOR NAME"
                  value={formData.name}
                  onChange={handleChange}
                />
                <FormInput
                  label="Frequency / Email"
                  id="email"
                  name="email"
                  type="email"
                  placeholder="EMAIL_ADDRESS"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <FormInput
                label="Primary Subject"
                id="subject"
                name="subject"
                placeholder="SUBJECT_LOG"
                value={formData.subject}
                onChange={handleChange}
              />

              <FormInput
                label="Encryption Payload / Message"
                id="message"
                name="message"
                textarea={true}
                placeholder="DETAILS_HERE..."
                value={formData.message}
                onChange={handleChange}
              />

              {submitStatus === "success" && (
                <div className="bg-[#ccff00] border-4 border-black p-6 mb-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-bounce">
                  <p className="font-black uppercase tracking-widest text-sm flex items-center gap-3">
                    <MessageSquare className="w-5 h-5" />
                    TRANSMISSION COMPLETE. EXPECT CONTACT.
                  </p>
                </div>
              )}

              {submitStatus === "error" && (
                <div className="bg-red-500 text-white border-4 border-black p-6 mb-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <p className="font-black uppercase tracking-widest text-sm">{errorMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-black text-[#ccff00] py-6 text-xl font-bold uppercase border-2 border-black rounded-full hover:bg-[#ccff00] hover:text-black transition-all flex items-center justify-center gap-4 group"
              >
                {isSubmitting ? "ENCRYPTING..." : (
                  <>
                    Initialize Transmission <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="bg-black text-white py-24 px-4 sm:px-8 border-t-2 border-black relative z-10 overflow-hidden">
          <div className="max-w-[1400px] mx-auto flex flex-col gap-12 relative z-10">
             <div className="text-center overflow-hidden">
                <h2 className="text-[10vw] leading-[0.8] font-black tracking-tighter text-white/5 select-none uppercase pointer-events-none">
                   CONTACT_CORE
                </h2>
             </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-t border-white/10 pt-12">
               <div className="flex flex-col gap-4">
                  <p className="font-mono text-[10px] text-gray-500 tracking-[0.2em] uppercase">© 2026 DEVHQ INC. ARCHIVE v0.9.2</p>
               </div>
               <div className="flex flex-wrap gap-x-8 gap-y-4">
                  <Link href="/" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Home</Link>
                  <Link href="/docs" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Docs</Link>
                  <Link href="/download" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">CLI</Link>
                  <Link href="/pricing" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Pricing</Link>
                  <Link href="/privacy-policy" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Privacy</Link>
                  <Link href="/terms-of-service" className="font-bold uppercase text-[10px] tracking-[0.2em] hover:text-[#ccff00] transition-colors">Terms</Link>
               </div>
            </div>
         </div>
      </footer>
    </div>
  );
}
