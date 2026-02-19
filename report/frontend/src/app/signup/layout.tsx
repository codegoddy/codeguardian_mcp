import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up for DevHQ | Start Your Free Trial",
  description: "Join 500+ developers who stopped chasing invoices. Get started with DevHQ's automated retainer management and git access control. No credit card required.",
  openGraph: {
    title: "Sign Up for DevHQ | Start Your Free Trial",
    description: "Join 500+ developers who stopped chasing invoices. Automated retainer management for developers and app builders.",
    url: "https://www.devhq.site/signup",
  },
  twitter: {
    title: "Sign Up for DevHQ | Start Your Free Trial",
    description: "Join 500+ developers who stopped chasing invoices. Automated retainer management for developers and app builders.",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
