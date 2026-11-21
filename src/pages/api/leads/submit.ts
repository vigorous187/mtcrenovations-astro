import type { APIRoute } from "astro";
import {
  sendLeadConfirmationEmail,
  sendStaffLeadNotification,
} from "../../../lib/email";
import {
  buildJobName,
  buildProjectNotes,
  defaultHearAbout,
  inferRemodelType,
  LEAD_SOURCES,
  REMODEL_TYPES,
} from "../../../lib/estimate-to-jobtread";
import { createCustomerLead } from "../../../lib/jobtread-pave";
import { isValidPhone } from "../../../lib/phone";
import {
  createMockExecutor,
  getMockLead,
  isMockLeadMode,
  mockLeadKey,
  saveMockLead,
} from "../../../lib/lead-mock";
import type {
  LeadSubmitInput,
  SavedEstimate,
} from "../../../lib/estimate-types";

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function webLeadSource(estimateId: string | undefined, hearAbout: string): string {
  if (estimateId || hearAbout === "Price Guide") return "price-guide";
  return hearAbout;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env;
    const kv = env.ESTIMATES;
    const grantKey = env.JOBTREAD_GRANT_KEY;
    const orgId = env.JOBTREAD_ORG_ID;
    const siteUrl = env.SITE_URL || "https://www.mtcrenovations.ca";

    const body = (await request.json()) as LeadSubmitInput;

    if (
      !body.name?.trim() ||
      !body.email?.trim() ||
      !body.phone?.trim() ||
      !body.address?.trim()
    ) {
      return json(
        { error: "Name, email, phone, and address are required" },
        400,
      );
    }

    if (!isValidPhone(body.phone)) {
      return json({ error: "Please enter a valid phone number." }, 400);
    }
    if (!/.+@.+\..+/.test(body.email.trim())) {
      return json({ error: "Please enter a valid email address." }, 400);
    }

    let estimate: SavedEstimate | null = null;
    if (body.estimateId && kv) {
      const raw = await kv.get(`estimate:${body.estimateId}`);
      if (!raw) {
        return json(
          {
            error:
              "We could not find that saved estimate. Please check the link or submit without it.",
          },
          400,
        );
      }
      estimate = JSON.parse(raw) as SavedEstimate;
    }

    const hearAbout = body.hearAbout || defaultHearAbout("price-guide");
    const remodelType =
      body.remodelType ||
      (estimate
        ? inferRemodelType(estimate.type, estimate.scope)
        : inferRemodelType("basement"));

    if (!LEAD_SOURCES.includes(hearAbout) || !REMODEL_TYPES.includes(remodelType)) {
      return json({ error: "Please select a valid lead source and project type." }, 400);
    }

    const projectNotes = estimate
      ? buildProjectNotes(estimate, siteUrl, body.projectNotes)
      : body.projectNotes || "Lead from MTC website";

    const jobName = estimate
      ? buildJobName(estimate)
      : `Web Lead - ${body.name}`;

    const leadInput = {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone.trim(),
      address: body.address.trim(),
      hearAbout,
      remodelType,
      projectNotes,
      jobName,
    };

    if (isMockLeadMode(env)) {
      const mockOrgId = env.JOBTREAD_ORG_ID || "MOCK-ORG";
      const key = mockLeadKey(leadInput.email, leadInput.phone, jobName);
      const existingMock = getMockLead(key);
      if (existingMock) {
        return json({
          success: true,
          syncPending: false,
          mock: true,
          duplicate: true,
          jobTread: {
            accountId: existingMock.accountId,
            jobId: existingMock.jobId,
            created: existingMock.created,
          },
        });
      }

      const { exec, payloads } = createMockExecutor();
      let mockResult: Awaited<ReturnType<typeof createCustomerLead>>;
      try {
        mockResult = await createCustomerLead("MOCK", mockOrgId, leadInput, exec);
      } catch (err) {
        console.error("Mock JobTread sync failed", err);
        return json({ error: "Unable to submit your request. Please call (647) 560-1095." }, 502);
      }

      saveMockLead(key, {
        accountId: mockResult.accountId,
        contactId: mockResult.contactId,
        locationId: mockResult.locationId,
        jobId: mockResult.jobId,
        created: mockResult.created,
        payloadCount: payloads.length,
      });

      if (estimate && kv) {
        const updated: SavedEstimate = {
          ...estimate,
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          leadSubmitted: true,
          jobTread: {
            accountId: mockResult.accountId,
            contactId: mockResult.contactId,
            locationId: mockResult.locationId,
            jobId: mockResult.jobId,
          },
        };
        await kv.put(`estimate:${estimate.id}`, JSON.stringify(updated), {
          expirationTtl: 90 * 24 * 60 * 60,
        });
        estimate = updated;
      }

      return json({
        success: true,
        syncPending: false,
        mock: true,
        duplicate: false,
        jobTread: {
          accountId: mockResult.accountId,
          jobId: mockResult.jobId,
          created: mockResult.created,
        },
        mockPayloads: payloads,
      });
    }

    if (!grantKey || !orgId) {
      console.error("JobTread lead delivery is not configured");
      return json({ error: "Unable to submit your request. Please call (647) 560-1095." }, 503);
    }

    let jobTreadResult: Awaited<ReturnType<typeof createCustomerLead>>;

    try {
      jobTreadResult = await createCustomerLead(grantKey, orgId, leadInput);
    } catch (err) {
      console.error("JobTread sync failed", err);
      return json({ error: "Unable to submit your request. Please call (647) 560-1095." }, 502);
    }

    if (estimate && kv) {
      const updated: SavedEstimate = {
        ...estimate,
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        leadSubmitted: true,
        jobTread: {
          accountId: jobTreadResult.accountId,
          contactId: jobTreadResult.contactId,
          locationId: jobTreadResult.locationId,
          jobId: jobTreadResult.jobId,
        },
      };
      await kv.put(`estimate:${estimate.id}`, JSON.stringify(updated), {
        expirationTtl: 90 * 24 * 60 * 60,
      });
      estimate = updated;
    }

    await sendLeadConfirmationEmail(
      estimate,
      {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
      },
      env,
    );

    const staffNotice = sendStaffLeadNotification(
      {
        name: leadInput.name,
        phone: leadInput.phone,
        email: leadInput.email,
        address: leadInput.address,
        projectType: leadInput.remodelType,
        description: leadInput.projectNotes,
        source: webLeadSource(body.estimateId, hearAbout),
        estimateId: estimate?.id || body.estimateId,
        submittedAt: new Date(),
        jobId: jobTreadResult.jobId,
        jobName: leadInput.jobName,
        customerId: jobTreadResult.accountId,
      },
      env,
    )
      .then((result) => {
        if (result && result.ok === false) {
          console.error("Staff lead notification failed", result.reason);
        }
      })
      .catch((err) => {
        console.error("Staff lead notification failed", err);
      });
    const ctx = locals.runtime?.ctx;
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(staffNotice);

    return json({
      success: true,
      syncPending: false,
      jobTread: {
        accountId: jobTreadResult.accountId,
        jobId: jobTreadResult.jobId,
        created: jobTreadResult.created,
      },
    });
  } catch (err) {
    console.error("lead submit error", err);
    return json({ error: "Failed to submit lead" }, 500);
  }
};
