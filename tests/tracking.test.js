import test from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTION_KEY, CAMPAIGN_FIELDS, createAttribution, getCookie } from "../src/attribution.js";
import { createLeadSubmitter } from "../src/lead-submit.js";
import { createLeadDelivery, formatCrmPayload, TRACKING_FIELDS } from "../lead-delivery.js";

function browser(url = "https://gol.example/", storage = new Map()) {
  return {
    location: new URL(url),
    document: { referrer: "https://campaign.example/", cookie: "" },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  };
}
function form(name = "Teste local") {
  return new Map([["nome", name], ["numero", "(11) 99999-0000"], ["cnpj", "12.345.678/0001-95"]]);
}
const response = (ok = true, body = { ok: true }) => ({ ok, json: async () => body });
const payload = { event_id: "test-1", event_name: "Lead", name: "Teste", phone: "11999990000", cnpj: "12345678000195" };

test("campaign values decode once and persist after query removal and reload", () => {
  const storage = new Map();
  const entry = browser("https://gol.example/?utm_source=meta&utm_medium=cpc&utm_campaign=cole%C3%A7%C3%A3o+nova&utm_content=A%2BB&utm_term=%252B&utm_id=123&fbclid=click&gclid=google", storage);
  const get = createAttribution(entry);
  assert.equal(get().utm_campaign, "coleção nova");
  assert.equal(get().utm_content, "A+B");
  assert.equal(get().utm_term, "%2B");
  entry.location = new URL("https://gol.example/#cadastro");
  assert.equal(get().utm_source, "meta");
  const restored = createAttribution(browser(entry.location.href, storage))();
  assert.deepEqual(restored, get());
  assert.equal(restored.entry_referrer, "https://campaign.example/");
  assert.deepEqual(Object.keys(JSON.parse(storage.get(ATTRIBUTION_KEY))).sort(), [...CAMPAIGN_FIELDS, "entry_url", "entry_referrer"].sort());
});

test("a new campaign replaces all fields, empty parameters retain history, direct entry stays empty", () => {
  const storage = new Map();
  createAttribution(browser("https://gol.example/?utm_source=meta&utm_content=old&fbclid=old", storage));
  assert.equal(createAttribution(browser("https://gol.example/?utm_source=", storage))().utm_source, "meta");
  const next = createAttribution(browser("https://gol.example/?utm_source=google", storage))();
  assert.equal(next.utm_source, "google");
  assert.equal(next.utm_content, "");
  assert.equal(next.fbclid, "");
  const direct = createAttribution(browser())();
  for (const key of CAMPAIGN_FIELDS) assert.equal(direct[key], "");
});

test("blocked storage, invalid JSON and malformed cookies do not break attribution", () => {
  const entry = browser("https://gol.example/?utm_source=meta");
  Object.defineProperty(entry, "sessionStorage", { get() { throw new Error("blocked"); } });
  const get = createAttribution(entry);
  entry.location = new URL("https://gol.example/");
  assert.equal(get().utm_source, "meta");
  assert.equal(createAttribution(browser(undefined, new Map([[ATTRIBUTION_KEY, "{broken"]])))().utm_source, "");
  assert.equal(getCookie({ cookie: "_fbc=%E0%A4%A;_fbp=fb.1.123.456" }, "_fbc"), "");
  assert.equal(getCookie({ cookie: "_fbc=fb.1.123.click;_fbp=fb.1.123.456" }, "_fbp"), "fb.1.123.456");
  assert.equal(getCookie({ get cookie() { throw new Error("blocked"); } }, "_fbc"), "");
});

test("concurrent submissions and repeats after success produce one request and Lead", async () => {
  const page = browser();
  const events = [];
  page.fbq = (...args) => events.push(args);
  let release;
  let calls = 0;
  let body;
  const submit = createLeadSubmitter({ browser: page, fetcher: async (_, options) => {
    calls++; body = JSON.parse(options.body);
    await new Promise(resolve => { release = resolve; });
    return response();
  } });
  const first = submit(form());
  assert.equal(submit(form()), first);
  assert.equal(events.length, 0);
  release();
  await first;
  await submit(form());
  assert.equal(calls, 1);
  assert.deepEqual(events, [["track", "Lead", {}, { eventID: body.event_id }]]);
  assert.equal(body.event_name, "Lead");
});

for (const [name, failure] of [
  ["HTTP 4xx", () => response(false)],
  ["HTTP 5xx", () => response(false, { ok: false })],
  ["network error", () => { throw new Error("offline"); }],
  ["invalid JSON", () => ({ ok: true, json: async () => { throw new Error("invalid"); } })],
  ["negative business response", () => response(true, { ok: false })],
  ["truthy nonboolean confirmation", () => response(true, { ok: "true" })],
]) {
  test(`${name} produces no Lead; retry preserves the exact payload and ID`, async () => {
    const page = browser("https://gol.example/?utm_source=meta");
    const events = [];
    page.fbq = (...args) => events.push(args);
    const bodies = [];
    const submit = createLeadSubmitter({ browser: page, fetcher: async (_, options) => {
      bodies.push(options.body);
      return bodies.length === 1 ? failure() : response();
    } });
    await assert.rejects(submit(form()));
    assert.equal(events.length, 0);
    page.location = new URL("https://gol.example/#cadastro");
    page.document.cookie = "_fbp=changed";
    await submit(form());
    assert.equal(bodies[0], bodies[1]);
    assert.equal(events.length, 1);
    await submit(form("Outro teste"));
    assert.notEqual(JSON.parse(bodies[2]).event_id, JSON.parse(bodies[0]).event_id);
  });
}

test("missing or throwing Pixel leaves accepted submissions successful", async () => {
  for (const fbq of [undefined, () => { throw new Error("blocked"); }]) {
    const page = browser();
    page.fbq = fbq;
    const submit = createLeadSubmitter({ browser: page, fetcher: async () => response() });
    await submit(form());
    await submit(form());
  }
});

test("server shares in-flight delivery, retries only failed required destinations, rejects changed payload", async () => {
  const requests = [];
  const deliver = createLeadDelivery({
    targets: [{ name: "supabase", url: "supabase", required: true }, { name: "crm", url: "crm", required: true, formatPayload: formatCrmPayload }],
    fetcher: async (url, options) => {
      requests.push([url, JSON.parse(options.body)]);
      return { ok: url !== "crm" || requests.filter(([target]) => target === "crm").length > 1 };
    },
  });
  const attributed = { ...payload, ...Object.fromEntries(TRACKING_FIELDS.filter(key => !key.startsWith("event_")).map(key => [key, "teste+A ç"])) };
  const first = deliver(attributed);
  assert.equal(deliver(attributed), first);
  assert.equal((await first).status, 502);
  assert.equal((await deliver({ ...attributed, name: "changed" })).status, 409);
  assert.equal((await deliver(attributed)).status, 200);
  assert.equal((await deliver(attributed)).status, 200);
  assert.deepEqual(requests.map(([url]) => url), ["supabase", "crm", "crm"]);
  for (const key of TRACKING_FIELDS) assert.equal(requests[1][1][key], attributed[key]);
  assert.equal(requests[1][1].document, payload.cnpj);
});

test("server retention expires, limits entries and does not discard in-flight receipts", async () => {
  let time = 0;
  let calls = 0;
  let release;
  const deliver = createLeadDelivery({
    targets: [{ name: "test", url: "test", required: true }], now: () => time, ttlMs: 100, maxEntries: 1,
    fetcher: async () => { calls++; await new Promise(resolve => { release = resolve; }); return { ok: true }; },
  });
  const first = deliver(payload);
  time = 101;
  assert.equal(deliver(payload), first);
  assert.equal((await deliver({ ...payload, event_id: "test-2" })).status, 503);
  release(); await first;
  const expired = deliver(payload);
  release(); await expired;
  assert.equal(calls, 2);
  assert.equal((await deliver({ ...payload, event_id: "test-2" })).status, 503);
});
