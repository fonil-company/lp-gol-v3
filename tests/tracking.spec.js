import { test as base, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

const test = base.extend({
  app: async ({}, use) => {
    const received = [];
    let failCrm = false;
    const receiver = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received.push({ destination: request.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
      response.writeHead(request.url === "/crm" && failCrm ? 503 : 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: !(request.url === "/crm" && failCrm) }));
    });
    receiver.listen(0, "127.0.0.1");
    await once(receiver, "listening");
    const receiverUrl = `http://127.0.0.1:${receiver.address().port}`;
    const server = spawn(process.execPath, ["server.js"], {
      windowsHide: true,
      env: { ...process.env, PORT: "0", SUPABASE_WEBHOOK_URL: `${receiverUrl}/supabase`, CRM_WEBHOOK_URL: `${receiverUrl}/crm` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Local API did not start")), 10000);
        server.once("error", error => { clearTimeout(timer); reject(error); });
        server.once("exit", () => { clearTimeout(timer); reject(new Error("Local API exited")); });
        server.stdout.on("data", data => {
          const match = data.toString().match(/porta (\d+)/);
          if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
        });
      });
      await use({ url, received, setFailCrm: value => { failCrm = value; } });
    } finally {
      const exited = once(server, "exit");
      server.kill();
      await exited;
      await new Promise(resolve => receiver.close(resolve));
    }
  },
});

test.beforeEach(async ({ page }) => {
  // Keep the standard fbq queue, while preventing all external tracking traffic.
  await page.route("**/*", route => {
    const hostname = new URL(route.request().url()).hostname;
    return hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
});

async function fillForm(page) {
  await page.locator('[name="nome"]').fill("TESTE LOCAL — NÃO CADASTRAR");
  await page.locator('[name="numero"]').fill("11999990000");
  await page.locator('[name="cnpj"]').fill("12345678000195");
  await page.locator('input[type="checkbox"]').check();
}
async function pixelCalls(page) {
  return page.evaluate(() => Array.from(window.fbq?.queue || [], call => Array.from(call)));
}

test("compiled page preserves campaign after query removal/reload and delivers tracking to both receivers", async ({ page, app }) => {
  const query = "?utm_source=meta&utm_medium=cpc&utm_campaign=cole%C3%A7%C3%A3o+nova&utm_content=A%2BB&utm_term=atacado&utm_id=camp-1&fbclid=click-test&gclid=google-test";
  const entryUrl = `${app.url}/${query}`;
  await page.goto(entryUrl, { referer: "https://campaign.example/" });
  await expect(page.locator("form")).toBeVisible();
  expect(await pixelCalls(page)).toEqual([["init", "2155316585266232"], ["track", "PageView"]]);
  await page.locator("a.hero-button").click();
  await page.locator('button[type="submit"]').click();
  expect(app.received).toHaveLength(0);
  expect((await pixelCalls(page)).filter(call => call[1] === "Lead")).toHaveLength(0);
  await page.evaluate(() => history.replaceState(null, "", "/#cadastro"));
  await page.reload();
  await fillForm(page);
  await page.context().addCookies([
    { name: "_fbc", value: "fb.1.1234567890000.click-test", url: app.url },
    { name: "_fbp", value: "fb.1.1234567890000.123456789", url: app.url },
  ]);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Solicitação recebida!" })).toBeVisible();
  expect(app.received).toHaveLength(2);
  for (const { body } of app.received) {
    expect(body).toMatchObject({
      utm_source: "meta", utm_medium: "cpc", utm_campaign: "coleção nova", utm_content: "A+B",
      utm_term: "atacado", utm_id: "camp-1", fbclid: "click-test", gclid: "google-test",
      event_name: "Lead", entry_url: entryUrl, entry_referrer: "https://campaign.example/",
      referrer: "https://campaign.example/", page_url: `${app.url}/#cadastro`,
      _fbc: "fb.1.1234567890000.click-test", _fbp: "fb.1.1234567890000.123456789",
    });
    expect(Number.isNaN(Date.parse(body.submitted_at))).toBe(false);
  }
  const crm = app.received.find(item => item.destination === "/crm").body;
  expect(crm.document).toBe("12345678000195");
  expect(crm.phone).toBe("11999990000");
  const id = app.received[0].body.event_id;
  expect(crm.event_id).toBe(id);
  expect((await pixelCalls(page)).filter(call => call[1] === "Lead")).toEqual([["track", "Lead", {}, { eventID: id }]]);
});

test("partial failure retries only CRM with identical payload and emits Lead after success", async ({ page, app }) => {
  app.setFailCrm(true);
  await page.goto(`${app.url}/?utm_source=meta`);
  await fillForm(page);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(app.received).toHaveLength(2);
  expect((await pixelCalls(page)).filter(call => call[1] === "Lead")).toHaveLength(0);
  const firstCrm = app.received.find(item => item.destination === "/crm").body;
  app.setFailCrm(false);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Solicitação recebida!" })).toBeVisible();
  expect(app.received.filter(item => item.destination === "/supabase")).toHaveLength(1);
  expect(app.received.filter(item => item.destination === "/crm").map(item => item.body)).toEqual([firstCrm, firstCrm]);
  expect((await pixelCalls(page)).filter(call => call[1] === "Lead")).toHaveLength(1);
});

test("malformed cookie and throwing Pixel cannot hide confirmed form success", async ({ page, app }) => {
  await page.goto(app.url);
  await fillForm(page);
  await page.evaluate(() => {
    document.cookie = "_fbc=%E0%A4%A; path=/";
    window.fbq = () => { throw new Error("Tracking blocked"); };
  });
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Solicitação recebida!" })).toBeVisible();
  expect(app.received).toHaveLength(2);
  expect(app.received[0].body._fbc).toBe("");
  expect(app.received[0].body.utm_source).toBe("");
});

test("empty payload verifies API connectivity without forwarding; changed payload cannot reuse an ID", async ({ request, app }) => {
  expect((await request.post(`${app.url}/api/leads`, { data: {} })).status()).toBe(422);
  expect(app.received).toHaveLength(0);
  const data = { name: "TESTE LOCAL", phone: "11999990000", cnpj: "12345678000195", event_id: "local-api-test" };
  expect((await request.post(`${app.url}/api/leads`, { data })).status()).toBe(200);
  expect((await request.post(`${app.url}/api/leads`, { data })).status()).toBe(200);
  expect((await request.post(`${app.url}/api/leads`, { data: { ...data, name: "OTHER LOCAL TEST" } })).status()).toBe(409);
  expect(app.received).toHaveLength(2);
  expect(app.received.every(item => item.body.event_name === "Lead")).toBe(true);
});
