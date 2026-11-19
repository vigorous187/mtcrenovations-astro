// Staging mock only; production chat delivery is not wired.
import type { APIRoute } from "astro";
import { createCustomerLead } from "../../../lib/jobtread-pave";
import { isValidPhone } from "../../../lib/phone";
import {
  createMockExecutor,
  getMockLead,
  isMockLeadMode,
  mockLeadKey,
  saveMockLead,
} from "../../../lib/lead-mock";

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env;

    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      projectNotes?: string;
    };

    const name = body.name?.trim() || "";
    if (!name) {
      return json({ error: "Please enter your name." }, 400);
    }
    if (!body.phone || !isValidPhone(body.phone)) {
      return json({ error: "Please enter a valid phone number." }, 400);
    }
    const phone = body.phone.trim();

    if (!isMockLeadMode(env)) {
      return json(
        { error: "Chat lead delivery is not configured in this environment." },
        503,
      );
    }

    const jobName = `Web Chat Lead - ${name}`;
    const phoneDigits = phone.replace(/\D/g, "");
    const key = mockLeadKey(`chat:${phoneDigits}`, phone, jobName);
    const existingMock = getMockLead(key);
    if (existingMock) {
      return json({
        success: true,
        mock: true,
        recorded: true,
        duplicate: true,
        accountId: existingMock.accountId,
        jobId: existingMock.jobId,
        jobTread: {
          accountId: existingMock.accountId,
          jobId: existingMock.jobId,
          created: existingMock.created,
        },
      });
    }

    const { exec, payloads } = createMockExecutor();
    const result = await createCustomerLead(
      "MOCK",
      "MOCK-ORG",
      {
        name,
        email: "",
        phone,
        address: "",
        hearAbout: "Website",
        remodelType: "Other",
        projectNotes:
          body.projectNotes?.trim() || "Callback requested via website chat",
        jobName,
      },
      exec,
    );

    saveMockLead(key, {
      accountId: result.accountId,
      contactId: result.contactId,
      locationId: result.locationId,
      jobId: result.jobId,
      created: result.created,
      payloadCount: payloads.length,
    });

    return json({
      success: true,
      mock: true,
      recorded: true,
      duplicate: false,
      jobId: result.jobId,
      jobTread: {
        accountId: result.accountId,
        jobId: result.jobId,
        created: result.created,
      },
      mockPayloads: payloads,
    });
  } catch (err) {
    console.error("chat lead error", err);
    return json({ error: "Failed to submit lead" }, 500);
  }
};
