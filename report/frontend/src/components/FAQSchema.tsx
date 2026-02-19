import Script from 'next/script';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaProps {
  faqs: FAQItem[];
}

export function FAQSchema({ faqs }: FAQSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <Script
      id="faq-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// Example usage:
// const faqs = [
//   {
//     question: "What is DevHQ?",
//     answer: "DevHQ is a financial and project guardrail tool for developers and app builders. It provides automated retainer monitoring, git access control, and auto-refill payments."
//   },
//   {
//     question: "How does git access control work?",
//     answer: "When your retainer runs dry, DevHQ automatically locks commit access to your repository. The code stays yours until it's paid for."
//   },
//   {
//     question: "Is there a free trial?",
//     answer: "Yes! DevHQ offers a free trial with no credit card required. Start managing your retainers and protecting your work today."
//   }
// ];
// 
// Then in your component:
// <FAQSchema faqs={faqs} />
