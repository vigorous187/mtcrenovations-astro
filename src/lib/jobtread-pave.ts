const PAVE_URL = "https://api.jobtread.com/pave";

export class JobTreadError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "JobTreadError";
  }
}

export async function paveQuery(
  grantKey: string,
  query: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(PAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { $: { grantKey }, ...query } }),
  });

  const raw = await res.text();
  let json: { errors?: unknown; data?: Record<string, unknown> };
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    throw new JobTreadError(`JobTread API non-JSON response: ${res.status}`, {
      status: res.status,
      bodyPreview: raw.slice(0, 300),
    });
  }

  if (!res.ok || json.errors) {
    throw new JobTreadError(
      `JobTread API error: ${res.status}`,
      json.errors ?? json,
    );
  }

  return json.data ?? json;
}

export async function findContactByEmail(
  grantKey: string,
  orgId: string,
  email: string,
): Promise<{
  contactId: string;
  accountId: string;
  accountName: string;
} | null> {
  const data = await paveQuery(grantKey, {
    organization: {
      $: { id: orgId },
      contacts: {
        $: {
          with: {
            emailMatch: {
              _: "customFieldValues",
              $: {
                where: {
                  and: [
                    [["customField", "id"], "22NgpjFszPJj"],
                    ["value", email.toLowerCase()],
                  ],
                },
              },
            },
          },
          where: {
            and: [
              [["account", "type"], "customer"],
              [["emailMatch", "count"], ">", 0],
            ],
          },
          size: 1,
        },
        nodes: {
          id: {},
          name: {},
          account: { id: {}, name: {}, type: {} },
        },
      },
    },
  });

  const nodes =
    (
      data.organization as {
        contacts?: {
          nodes?: { id: string; account: { id: string; name: string } }[];
        };
      }
    )?.contacts?.nodes ?? [];

  if (!nodes.length) return null;
  const contact = nodes[0];
  return {
    contactId: contact.id,
    accountId: contact.account.id,
    accountName: contact.account.name,
  };
}

export async function createCustomerLead(
  grantKey: string,
  orgId: string,
  input: {
    name: string;
    email: string;
    phone: string;
    address: string;
    hearAbout: string;
    remodelType: string;
    projectNotes: string;
    jobName: string;
  },
): Promise<{
  accountId: string;
  contactId: string;
  locationId: string;
  jobId: string;
  created: boolean;
}> {
  const existing = await findContactByEmail(grantKey, orgId, input.email);

  if (existing) {
    const locationData = await paveQuery(grantKey, {
      createLocation: {
        $: {
          organizationId: orgId,
          accountId: existing.accountId,
          name: input.address.split("\n")[0] || input.name,
          address: input.address,
        },
        createdLocation: { id: {}, name: {}, address: {} },
      },
    });

    const locationId = (
      locationData.createLocation as { createdLocation: { id: string } }
    ).createdLocation.id;

    const jobData = await paveQuery(grantKey, {
      createJob: {
        $: {
          organizationId: orgId,
          name: input.jobName,
          locationId,
          accountId: existing.accountId,
          customFieldValues: {
            "22Nh8W9jKBnL": input.remodelType,
          },
        },
        createdJob: { id: {}, name: {}, number: {} },
      },
    });

    const jobId = (jobData.createJob as { createdJob: { id: string } })
      .createdJob.id;

    await paveQuery(grantKey, {
      updateAccount: {
        $: {
          id: existing.accountId,
          customFieldValues: {
            "22Nh8ReugeSg": input.hearAbout,
            "22Nh8Re8atBj": input.projectNotes,
          },
        },
        account: { $: { id: existing.accountId }, id: {} },
      },
    });

    await paveQuery(grantKey, {
      createComment: {
        $: {
          targetId: jobId,
          targetType: "job",
          name: "Price Guide Lead",
          message: input.projectNotes,
          isVisibleToInternalRoles: true,
        },
        createdComment: { id: {} },
      },
    });

    return {
      accountId: existing.accountId,
      contactId: existing.contactId,
      locationId,
      jobId,
      created: false,
    };
  }

  const accountData = await paveQuery(grantKey, {
    createAccount: {
      $: {
        organizationId: orgId,
        name: input.name,
        type: "customer",
        customFieldValues: {
          "22Nh8ReugeSg": input.hearAbout,
          "22Nh8Re8atBj": input.projectNotes,
        },
      },
      createdAccount: { id: {}, name: {} },
    },
  });

  const accountId = (
    accountData.createAccount as { createdAccount: { id: string } }
  ).createdAccount.id;

  const contactData = await paveQuery(grantKey, {
    createContact: {
      $: {
        accountId,
        name: input.name.trim() || "Primary Contact",
        customFieldValues: {
          "22NgpjG3zvMA": input.phone,
          "22NgpjFszPJj": input.email,
        },
      },
      createdContact: { id: {} },
    },
  });

  const contactId = (
    contactData.createContact as { createdContact: { id: string } }
  ).createdContact.id;

  const locationData = await paveQuery(grantKey, {
    createLocation: {
      $: {
        organizationId: orgId,
        accountId,
        name: input.address.split("\n")[0] || input.name,
        address: input.address,
      },
      createdLocation: { id: {}, name: {}, address: {} },
    },
  });

  const locationId = (
    locationData.createLocation as { createdLocation: { id: string } }
  ).createdLocation.id;

  const jobData = await paveQuery(grantKey, {
    createJob: {
      $: {
        organizationId: orgId,
        name: input.jobName,
        locationId,
        accountId,
        customFieldValues: {
          "22Nh8W9jKBnL": input.remodelType,
        },
      },
      createdJob: { id: {}, name: {}, number: {} },
    },
  });

  const jobId = (jobData.createJob as { createdJob: { id: string } }).createdJob
    .id;

  await paveQuery(grantKey, {
    createComment: {
      $: {
        targetId: jobId,
        targetType: "job",
        name: "Price Guide Lead",
        message: input.projectNotes,
        isVisibleToInternalRoles: true,
      },
      createdComment: { id: {} },
    },
  });

  return { accountId, contactId, locationId, jobId, created: true };
}

