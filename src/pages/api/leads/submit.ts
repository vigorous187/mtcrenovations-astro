import type { APIRoute } from "astro";
import { sendLeadConfirmationEmail } from "../../../lib/email";
import {
  buildJobName,
  buildProjectNotes,
  defaultHearAbout,
  inferRemodelType,
} from "../../../lib/estimate-to-jobtread";
import { createCustomerLead } from "../../../lib/jobtread-pave";
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

    let estimate: SavedEstimate | null = null;
    if (body.estimateId && kv) {
      const raw = await kv.get(`estimate:${body.estimateId}`);
      if (raw) estimate = JSON.parse(raw) as SavedEstimate;
    }

    const hearAbout = body.hearAbout || defaultHearAbout("price-guide");
    const remodelType =
      body.remodelType ||
      (estimate
        ? inferRemodelType(estimate.type, estimate.scope)
        : inferRemodelType("basement"));

    const projectNotes = estimate
      ? buildProjectNotes(estimate, siteUrl, body.projectNotes)
      : body.projectNotes || "Lead from MTC website";

    const jobName = estimate
      ? buildJobName(estimate)
      : body.service
        ? `Website Lead — ${body.service} — ${body.name}`
        : `Website Lead — ${body.name}`;

    let jobTreadResult: {
      accountId: string;
      contactId: string;
      locationId: string;
      jobId: string;
      created: boolean;
    } | null = null;

    let syncPending = false;

    if (grantKey && orgId) {
      try {
        jobTreadResult = await createCustomerLead(grantKey, orgId, {
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          phone: body.phone.trim(),
          address: body.address.trim(),
          hearAbout,
          remodelType,
          projectNotes,
          jobName,
        });
      } catch (err) {
        console.error("JobTread sync failed", err);
        syncPending = true;
      }
    } else {
      syncPending = true;
    }

    if (estimate && kv) {
      const updated: SavedEstimate = {
        ...estimate,
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        leadSubmitted: true,
        jobTread: jobTreadResult
          ? {
              accountId: jobTreadResult.accountId,
              contactId: jobTreadResult.contactId,
              locationId: jobTreadResult.locationId,
              jobId: jobTreadResult.jobId,
            }
          : estimate.jobTread,
      };
      if (syncPending) {
        (updated as SavedEstimate & { syncPending?: boolean }).syncPending =
          true;
      }
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

    return json({
      success: true,
      syncPending,
      jobTread: jobTreadResult
        ? {
            accountId: jobTreadResult.accountId,
            jobId: jobTreadResult.jobId,
            created: jobTreadResult.created,
          }
        : null,
    });
  } catch (err) {
    console.error("lead submit error", err);
    return json({ error: "Failed to submit lead" }, 500);
  }
};
