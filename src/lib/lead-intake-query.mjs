// Query names match mtc-voice-bridge FOLLOWUP_FORM_URL_MTC:
// /newleadintake/?name={name}&email={email}&city={city}&phone={phone}
export const LEAD_INTAKE_QUERY_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  city: 100,
};

export function clipLeadQueryValue(raw, max) {
  if (raw == null) return "";
  return raw.trim().slice(0, max);
}

export function leadIntakeQueryValues(params) {
  return {
    name: clipLeadQueryValue(params.get("name"), LEAD_INTAKE_QUERY_LIMITS.name),
    email: clipLeadQueryValue(params.get("email"), LEAD_INTAKE_QUERY_LIMITS.email),
    phone: clipLeadQueryValue(params.get("phone"), LEAD_INTAKE_QUERY_LIMITS.phone),
    city: clipLeadQueryValue(params.get("city"), LEAD_INTAKE_QUERY_LIMITS.city),
  };
}
