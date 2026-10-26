// GET /api/leads -> live HubSpot contact counts by Record source and FT Lead Source.
//
// Env vars (set in Vercel > Project > Settings > Environment Variables):
//   HUBSPOT_TOKEN       required. HubSpot private app token with crm.objects.contacts.read
//                       and crm.schemas.contacts.read scopes.
//   DASHBOARD_PASSWORD  optional. When set, the page asks for it before showing any data.
//
// The response is cached on Vercel's CDN for 15 minutes and served stale for up to a day
// while it refreshes in the background, so most visits load instantly.

import { createHash } from "node:crypto";
import { PROPS, buildCube } from "./_lib/aggregate.js";

const HS = "https://api.hubapi.com";
const PAGE = 200;            // search API max page size
const MIN_GAP_MS = 230;      // search API allows ~5 requests/second per token
const LABEL_PROPS = ["hs_object_source_label", "ft_lead_source", "lifecyclestage"];

let lastStart = 0;
async function hubspot(path, token, body) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    const res = await fetch(HS + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise(r => setTimeout(r, retryAfter ? retryAfter * 1000 : 1000 * 2 ** attempt));
      continue;
    }
    const text = await res.text();
    const err = new Error(`HubSpot ${res.status} on ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

// Page through every contact using an hs_object_id cursor, which avoids the
// search API's 10,000-result cap on a single query.
async function fetchAllContacts(token) {
  const out = [];
  let lastId = "0";
  for (;;) {
    const data = await hubspot("/crm/v3/objects/contacts/search", token, {
      filterGroups: [{ filters: [{ propertyName: "hs_object_id", operator: "GT", value: lastId }] }],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      properties: PROPS,
      limit: PAGE,
    });
    const results = data.results || [];
    out.push(...results);
    if (results.length < PAGE) return out;
    lastId = results[results.length - 1].id;
  }
}

async function fetchLabels(token) {
  const labels = {};
  for (const name of LABEL_PROPS) {
    const def = await hubspot(`/crm/v3/properties/contacts/${name}`, token);
    labels[name] = (def.options || [])
      .filter(o => !o.hidden)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map(o => ({ value: o.value, label: o.label }));
  }
  return labels;
}

const sha256 = s => createHash("sha256").update(s).digest("hex");

export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;
  const password = process.env.DASHBOARD_PASSWORD;

  if (password) {
    if (req.query.k !== sha256(password)) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ error: "password_required" });
    }
  }
  if (!token) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "HUBSPOT_TOKEN is not set in this Vercel project's environment variables." });
  }

  try {
    const [records, labels] = await Promise.all([fetchAllContacts(token), fetchLabels(token)]);
    const cube = buildCube(records);
    // The cache key includes the query string, so a correct password hash (k) is
    // required to read a cached copy too.
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).json({ generatedAt: new Date().toISOString(), labels, ...cube });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    const hint = e.status === 401 || e.status === 403
      ? " Check that HUBSPOT_TOKEN is valid and has the crm.objects.contacts.read and crm.schemas.contacts.read scopes."
      : "";
    return res.status(502).json({ error: e.message + hint });
  }
}
