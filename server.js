import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localEnvPath = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

const WEBHOOK_TARGETS = [
  {
    name: "Supabase",
    required: true,
    url:
      process.env.SUPABASE_WEBHOOK_URL,
  },
  {
    name: "CRM Fonil",
    required: true,
    url:
      process.env.CRM_WEBHOOK_URL,
    formatPayload: (payload) => ({
      phone: String(payload.phone || "").replace(/\D/g, ""),
      name: String(payload.name || "").trim(),
      document: String(payload.cnpj || "").replace(/\D/g, ""),
    }),
  },
];

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, "dist");
const port = Number(process.env.PORT) || 3000;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new Error("Payload muito grande");
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function forwardLead(request, response) {
  try {
    const payload = await readJson(request);
    const requiredFields = ["name", "phone", "cnpj"];
    if (requiredFields.some((field) => !String(payload[field] || "").trim())) {
      return sendJson(response, 422, { ok: false });
    }

    const results = await Promise.allSettled(
      WEBHOOK_TARGETS.map(async (target) => {
        const targetPayload = target.formatPayload
          ? target.formatPayload(payload)
          : payload;
        const webhookResponse = await fetch(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetPayload),
          signal: AbortSignal.timeout(10_000),
        });

        if (!webhookResponse.ok) {
          throw new Error(
            `${target.name} respondeu com status ${webhookResponse.status}`,
          );
        }
      }),
    );

    const failures = results
      .map((result, index) => ({ result, target: WEBHOOK_TARGETS[index] }))
      .filter(({ result }) => result.status === "rejected");
    const requiredFailures = failures.filter(({ target }) => target.required);
    const summarizeFailures = (items) =>
      items.map(({ result, target }) => ({
        name: target.name,
        reason: result.reason?.message || "Erro desconhecido",
      }));

    if (requiredFailures.length > 0) {
      console.error(
        "Falha no webhook obrigatório:",
        summarizeFailures(requiredFailures),
      );
      return sendJson(response, 502, { ok: false });
    }

    if (failures.length > 0) {
      console.warn(
        "Falha em webhook complementar:",
        summarizeFailures(failures),
      );
    }

    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("Falha ao processar lead:", error);
    return sendJson(response, 400, { ok: false });
  }
}

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  let filePath = path.resolve(publicDirectory, relativePath);

  if (!filePath.startsWith(`${publicDirectory}${path.sep}`) && filePath !== publicDirectory) {
    response.writeHead(403).end();
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Arquivo não encontrado");
  } catch {
    filePath = path.join(publicDirectory, "index.html");
  }

  const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  if (request.method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (request.method === "POST" && pathname === "/api/leads") {
    return forwardLead(request, response);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return serveStatic(request, response);
  }

  response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${port}`);
});
