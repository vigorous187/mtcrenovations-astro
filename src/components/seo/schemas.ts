import site from '../../data/site.json';

export function localBusiness(cityName?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: cityName ? `${site.name} — ${cityName}` : site.name,
    url: cityName
      ? `${site.url}/location/${cityName.toLowerCase().replace(/[\s.]+/g, '-')}`
      : site.url,
    telephone: site.phone,
    email: site.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: cityName || site.address.city,
      addressRegion: site.address.province,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    image: `${site.url}/assets/img/logo/logo.png`,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: String(site.googleReviews.rating),
      reviewCount: String(site.googleReviews.count),
      bestRating: '5',
    },
    areaServed: site.serviceAreaCities.map(city => ({
      '@type': 'City',
      name: city,
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Ontario' },
    })),
    priceRange: '$$$$',
    openingHours: 'Mo-Fr 08:00-18:00',
  };
}

export function serviceSchema(serviceName: string, serviceSlug: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${serviceName} Renovation`,
    description,
    provider: {
      '@type': 'HomeAndConstructionBusiness',
      name: site.name,
      url: site.url,
      telephone: site.phone,
    },
    areaServed: site.serviceAreaCities.map(city => ({
      '@type': 'City',
      name: city,
    })),
    url: `${site.url}/${serviceSlug}`,
  };
}

export function breadcrumbList(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqPage(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
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
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: post.url,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: {
      '@type': 'Person',
      name: post.author || 'MTC Renovations',
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      logo: { '@type': 'ImageObject', url: `${site.url}/assets/img/logo/logo.png` },
    },
    image: post.image || `${site.url}/assets/img/og-default.png`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.url },
  };
}
