function getAttribution() {
  const params = new URLSearchParams(window.location.search);

  return {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || "",
    fbclid: params.get("fbclid") || "",
    gclid: params.get("gclid") || "",
  };
}

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

export async function submitLead(formData) {
  const eventId = crypto.randomUUID();
  const payload = {
    event_id: eventId,
    source: "Gol Distribuidora",
    name: formData.get("nome"),
    nome: formData.get("nome"),
    phone: formData.get("numero"),
    numero: formData.get("numero"),
    whatsapp: formData.get("numero"),
    cnpj: formData.get("cnpj"),
    page_url: window.location.href,
    referrer: document.referrer,
    submitted_at: new Date().toISOString(),
    ...getAttribution(),
    _fbc: getCookie("_fbc"),
    _fbp: getCookie("_fbp"),
  };

  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error("Não foi possível concluir o cadastro. Tente novamente.");
  }

  if (typeof window.fbq === "function") {
    window.fbq("track", "Lead", {}, { eventID: eventId });
  }
}
