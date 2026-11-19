import type { PaveExecutor } from "./jobtread-pave";

export function isMockLeadMode(env: Record<string, unknown> | undefined | null): boolean {
  return env?.LEAD_DELIVERY_MODE === "mock";
}

export type MockLeadRecord = {
  accountId: string;
  contactId: string;
  locationId: string;
  jobId: string;
  created: boolean;
  payloadCount: number;
};

const mockLeads = new Map<string, MockLeadRecord>();

export function mockLeadKey(email: string, phone: string, jobName: string): string {
  const digitsOnlyPhone = (phone || "").replace(/\D/g, "");
  return `${(email || "").toLowerCase()}|${digitsOnlyPhone}|${jobName}`;
}

export function getMockLead(key: string): MockLeadRecord | undefined {
  return mockLeads.get(key);
}

export function saveMockLead(key: string, record: MockLeadRecord): void {
  mockLeads.set(key, record);
}

export function createMockExecutor(): {
  exec: PaveExecutor;
  payloads: Record<string, unknown>[];
} {
  const payloads: Record<string, unknown>[] = [];

  const exec: PaveExecutor = async (
    _grantKey: string,
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    // Record the exact HTTP body paveQuery would POST, with a mock key.
    // Never touches the network.
    const body = {
      query: { $: { grantKey: "MOCK-NO-REAL-KEY" }, ...query },
    };
    payloads.push(body as unknown as Record<string, unknown>);

    if ("organization" in query) {
      return { organization: { contacts: { nodes: [] } } };
    }
    if ("createAccount" in query) {
      return {
        createAccount: {
          createdAccount: { id: "MOCK-ACCOUNT-0001", name: "Mock Account" },
        },
      };
    }
    if ("createContact" in query) {
      return {
        createContact: { createdContact: { id: "MOCK-CONTACT-0001" } },
      };
    }
    if ("createLocation" in query) {
      return {
        createLocation: {
          createdLocation: { id: "MOCK-LOCATION-0001", name: "Mock Location", address: "" },
        },
      };
    }
    if ("createJob" in query) {
      return {
        createJob: {
          createdJob: { id: "MOCK-JOB-0001", name: "Mock Job", number: "MOCK-0001" },
        },
      };
    }
    if ("createComment" in query) {
      return { createComment: { createdComment: { id: "MOCK-COMMENT-0001" } } };
    }
    if ("updateAccount" in query) {
      return { updateAccount: { account: { id: "MOCK-ACCOUNT-0001" } } };
    }
    return {};
  };

  return { exec, payloads };
}
