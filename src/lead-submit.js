import { createAttribution, getCookie } from "./attribution.js";

export function createLeadSubmitter({
  browser,
  fetcher = (...args) => fetch(...args),
  createEventId = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  // Capture on module initialization, before the form or any internal navigation.
  const getAttribution = createAttribution(browser);
  const attempts = new Map();

  return function submitLead(formData) {
    const contact = {
      name: String(formData.get("nome") || "").trim(),
      phone: String(formData.get("numero") || ""),
      cnpj: String(formData.get("cnpj") || ""),
    };
    const key = JSON.stringify(contact);
    let attempt = attempts.get(key);
    if (!attempt) {
      const attribution = getAttribution();
      attempt = {
        payload: {
          event_id: createEventId(),
          event_name: "Lead",
          source: "Gol Distribuidora",
          ...contact,
          nome: contact.name,
          numero: contact.phone,
          whatsapp: contact.phone,
          ...attribution,
          page_url: browser.location.href,
          referrer: attribution.entry_referrer,
          submitted_at: now(),
          _fbc: getCookie(browser.document, "_fbc"),
          _fbp: getCookie(browser.document, "_fbp"),
        },
        inFlight: null,
        completed: false,
      };
      attempts.set(key, attempt);
    }
    if (attempt.completed) return Promise.resolve();
    if (attempt.inFlight) return attempt.inFlight;

    attempt.inFlight = (async () => {
      const response = await fetcher("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt.payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        throw new Error("Não foi possível concluir o cadastro. Tente novamente.");
      }
      attempt.completed = true;
      try {
        if (typeof browser.fbq === "function") {
          browser.fbq("track", "Lead", {}, { eventID: attempt.payload.event_id });
        }
      } catch { /* Tracking failure must not turn an accepted lead into an error. */ }
    })().finally(() => { attempt.inFlight = null; });
    return attempt.inFlight;
  };
}

export const submitLead = typeof window === "undefined"
  ? undefined
  : createLeadSubmitter({ browser: window });
