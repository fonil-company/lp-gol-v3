import { createHash } from "node:crypto";

export const TRACKING_FIELDS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "fbclid", "gclid", "event_id", "event_name", "entry_url", "entry_referrer",
  "page_url", "referrer", "submitted_at", "_fbc", "_fbp",
];

export function formatCrmPayload(payload) {
  return {
    phone: String(payload.phone || "").replace(/\D/g, ""),
    name: String(payload.name || "").trim(),
    document: String(payload.cnpj || "").replace(/\D/g, ""),
    ...Object.fromEntries(TRACKING_FIELDS.map((key) => [key, payload[key] || ""])),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

// Per-process retention: 24 hours, at most 5,000 IDs. Only hashes/statuses persist.
// Receivers need durable event_id deduplication for restarts, replicas and timeouts.
export function createLeadDelivery({
  targets,
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  ttlMs = 24 * 60 * 60 * 1000,
  maxEntries = 5000,
}) {
  const entries = new Map();
  return function deliver(payload) {
    const timestamp = now();
    for (const [id, entry] of entries) {
      if (!entry.inFlight && entry.expiresAt <= timestamp) entries.delete(id);
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
    let entry = entries.get(payload.event_id);
    if (entry && entry.fingerprint !== fingerprint) {
      return Promise.resolve({ status: 409, body: { ok: false } });
    }
    if (!entry) {
      // Do not evict live receipts just to make room: return a retryable failure.
      if (entries.size >= maxEntries) return Promise.resolve({ status: 503, body: { ok: false } });
      entry = { fingerprint, expiresAt: timestamp + ttlMs, succeeded: new Set(), inFlight: null };
      entries.set(payload.event_id, entry);
    }
    if (entry.inFlight) return entry.inFlight;
    entry.inFlight = (async () => {
      await Promise.allSettled(targets.map(async (target) => {
        if (entry.succeeded.has(target.name)) return;
        const response = await fetcher(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target.formatPayload ? target.formatPayload(payload) : payload),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Webhook rejected the lead");
        entry.succeeded.add(target.name);
      }));
      const ok = targets.every((target) => !target.required || entry.succeeded.has(target.name));
      return { status: ok ? 200 : 502, body: { ok } };
    })().finally(() => { entry.inFlight = null; });
    return entry.inFlight;
  };
}
