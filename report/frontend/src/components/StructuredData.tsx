import Script from 'next/script';

export function SoftwareApplicationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "DevHQ",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web, Windows, macOS, Linux",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free trial available"
    },
    "description": "Financial and project guardrails for developers and app builders. Automated retainer monitoring, access control, and auto-refill payments.",
    "url": "https://www.devhq.site",
    "screenshot": "https://www.devhq.site/dashboard-mockup.png",
    "featureList": [
      "Automated retainer monitoring",
      "Git access control",
      "Auto-refill payments",
      "Time tracking",
      "Client portal",
      "Project management"
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "500"
    }
  };

  return (
    <Script
      id="software-application-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "DevHQ",
    "url": "https://www.devhq.site",
    "logo": "https://www.devhq.site/dev_logo.png",
    "description": "The first project management tool designed to protect the developer's financial interest first.",
    "sameAs": [
      "https://twitter.com/devhq",
      "https://github.com/devhq"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Support",
      "url": "https://www.devhq.site"
    }
  };

  return (
    <Script
      id="organization-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "DevHQ",
    "url": "https://www.devhq.site",
    "description": "Stop scope creep and get paid. Automated retainer management for developers.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://www.devhq.site/search?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <Script
      id="website-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
