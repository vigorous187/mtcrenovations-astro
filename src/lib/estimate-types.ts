export interface EstimateBreakdownLine {
  label: string;
  range: [number, number];
}

export interface EstimateSelection {
  step: string;
  question: string;
  answer: string;
  range: [number, number];
  modifier?: string;
  image?: string;
  imageAlt?: string;
}

export interface SavedEstimate {
  id: string;
  type: string;
  typeLabel: string;
  scope?: string | null;
  scopeLabel?: string | null;
  size: string;
  sizeLabel: string;
  finish: string;
  finishLabel: string;
  addons: string[];
  addonLabels: string[];
  min: number;
  max: number;
  breakdown: EstimateBreakdownLine[];
  selections: EstimateSelection[];
  market: string;
  hstNote: string;
  contingencyNote: string;
  createdAt: string;
  email?: string;
  name?: string;
  leadSubmitted?: boolean;
  jobTread?: {
    accountId?: string;
    contactId?: string;
    locationId?: string;
    jobId?: string;
  };
}

export interface EstimateSaveInput {
  type: string;
  typeLabel: string;
  scope?: string | null;
  scopeLabel?: string | null;
  size: string;
  sizeLabel: string;
  finish: string;
  finishLabel: string;
  addons: string[];
  addonLabels: string[];
  min: number;
  max: number;
  breakdown: EstimateBreakdownLine[];
  selections: EstimateSelection[];
  market: string;
  hstNote: string;
  contingencyNote: string;
  email?: string;
  name?: string;
}

export interface LeadSubmitInput {
  estimateId?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  hearAbout?: string;
  remodelType?: string;
  projectNotes?: string;
}

export interface EmailSender {
  send(message: {
    to: string | string[];
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<{ messageId?: string }>;
}

export interface CloudflareEnv {
  ESTIMATES: KVNamespace;
  EMAIL?: EmailSender;
  CLOUDFLARE_EMAIL_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  JOBTREAD_GRANT_KEY?: string;
  JOBTREAD_ORG_ID?: string;
  SITE_URL?: string;
}
