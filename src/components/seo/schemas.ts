import site from "../../data/site.json";

/** Ensure a URL ends with a trailing slash */
function trailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

/** Stable id for the sitewide HomeAndConstructionBusiness node. */
export const businessId = `${trailingSlash(site.url)}#business`;

/** Service-area cities only. No street address is published. */
export function areasServed() {
  const names = site.areaServed?.length ? site.areaServed : site.serviceAreaCities;
  return names.map((city) => ({
    "@type": "City",
    name: city,
    containedInPlace: { "@type": "AdministrativeArea", name: "Ontario" },
  }));
}

export function localBusiness(cityName?: string) {
  const address: Record<string, string> = {
    "@type": "PostalAddress",
    addressLocality: cityName || site.address.city,
    addressRegion: site.address.province,
    addressCountry: site.address.country,
  };
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: cityName ? `${site.name} — ${cityName}` : site.name,
    url: cityName
      ? trailingSlash(
          `${site.url}/location/${cityName.toLowerCase().replace(/[\s.]+/g, "-")}`,
        )
      : trailingSlash(site.url),
    telephone: site.phone,
    email: site.email,
    address,
    image: `${site.url}/assets/img/logo/logo.png`,
    areaServed: areasServed(),
    priceRange: "$$$$",
    openingHours: "Mo-Fr 08:00-18:00",
  };
  if (!cityName) node["@id"] = businessId;
  return node;
}

/** Pull ### questions from a markdown FAQ section. Answers are plain text. */
export function faqsFromMarkdown(markdown: string) {
  const heading = markdown.match(/^## (?:Frequently Asked Questions|FAQ)\s*$/m);
  if (!heading || heading.index === undefined) return [];
  const rest = markdown.slice(heading.index + heading[0].length);
  const nextH2 = rest.search(/\n## /);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
  return section
    .split(/\n### /)
    .slice(1)
    .map((chunk) => {
      const breakAt = chunk.indexOf("\n");
      const question = (breakAt === -1 ? chunk : chunk.slice(0, breakAt))
        .replace(/[#*_]/g, "")
        .trim();
      const answer = (breakAt === -1 ? "" : chunk.slice(breakAt + 1))
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return { question, answer };
    })
    .filter((faq) => faq.question && faq.answer);
}

export function serviceSchema(
  serviceName: string,
  serviceSlug: string,
  description: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${serviceName} Renovation`,
    description,
    provider: {
      "@type": "HomeAndConstructionBusiness",
      name: site.name,
      url: trailingSlash(site.url),
      telephone: site.phone,
    },
    areaServed: areasServed(),
    url: trailingSlash(`${site.url}/${serviceSlug}`),
  };
}

export function breadcrumbList(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqPage(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function imageGallery(
  serviceName: string,
  serviceSlug: string,
  photos: { file: string; alt: string; project: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: `${serviceName} Renovation Portfolio — Hamilton`,
    about: {
      "@type": "Service",
      name: `${serviceName} Renovation`,
      provider: { "@type": "HomeAndConstructionBusiness", name: site.name },
    },
    url: `${site.url}/${serviceSlug}/our-work/`,
    image: photos.map((photo) => ({
      "@type": "ImageObject",
      contentUrl: `${site.url}/assets/img/${serviceSlug}/our-work/${photo.file}`,
      description: photo.alt,
      name: `${photo.project} ${serviceName} Renovation`,
    })),
  };
}

export function article(post: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  author?: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    url: post.url,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: {
      "@type": "Person",
      name: post.author || "MTC Renovations",
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
      logo: {
        "@type": "ImageObject",
        url: `${site.url}/assets/img/logo/logo.png`,
      },
    },
    image: post.image || `${site.url}/assets/img/og/default.png`,
    mainEntityOfPage: { "@type": "WebPage", "@id": post.url },
  };
}
