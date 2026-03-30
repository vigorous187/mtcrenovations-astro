import { defineCollection, z } from 'astro:content';

const services = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    features: z.array(z.string()).optional(),
    processSteps: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })).optional(),
    whyChooseUs: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })).optional(),
  }),
});

const cities = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    province: z.string().default('Ontario'),
    country: z.string().default('Canada'),
    metaTitle: z.string().max(70),
    metaDescription: z.string().max(160),
    h1: z.string(),
    isServiceArea: z.boolean().default(true),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    nearbyAreas: z.array(z.string()).optional(),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    metaTitle: z.string().max(70),
    metaDescription: z.string().max(160),
    author: z.string().default('MTC Renovations'),
    datePublished: z.string(),
    dateModified: z.string(),
    coverImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const faqs = defineCollection({
  type: 'data',
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    order: z.number(),
  }),
});

export const collections = { services, cities, blog, faqs };
