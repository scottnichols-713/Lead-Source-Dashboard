# Lead source dashboard (live HubSpot)

Shows where leads come from, using live HubSpot contact data:

- **FT Lead Source** (`ft_lead_source`): the primary view, with `ft_lead_source_detail` drill-down
- **Record source** (`hs_object_source_label`): how the record was created, with `hs_object_source_detail_1` drill-down
- Monthly trend, FT Lead Source × Record source matrix, and lifecycle-stage quality for both
- Date range presets, and click any FT Lead Source or Record source bar to filter the whole page

## Files

- `index.html`: the page (no build step, no dependencies)
- `api/leads.js`: Vercel function that reads every contact from HubSpot and returns aggregated counts only
- `api/_lib/aggregate.js`: the counting logic
- `vercel.json`, `package.json`: Vercel config

## Setup

1. **Create a HubSpot private app token.** In HubSpot: Settings → Integrations → Private Apps → Create.
   Scopes: `crm.objects.contacts.read` and `crm.schemas.contacts.read`. Copy the access token.
2. **Put this folder in a GitHub repo** and import it at https://vercel.com/new.
   Framework preset: **Other**. Leave the build command and output directory empty.
3. **Add environment variables** (Vercel → Project → Settings → Environment Variables):
   - `HUBSPOT_TOKEN`: the token from step 1 (required)
   - `DASHBOARD_PASSWORD`: a password the page asks for before showing data (recommended, since the URL is otherwise public)
4. Redeploy so the variables take effect.

## How "live" works

Each load reads all contacts from HubSpot (about 160 API calls for 32k contacts, so roughly 40–60 seconds).
Vercel's CDN caches the result for 15 minutes and keeps serving the last copy for up to a day while it
refreshes in the background, so most visits load instantly with data no more than ~15 minutes old.
The **Refresh** button forces a brand-new read.
