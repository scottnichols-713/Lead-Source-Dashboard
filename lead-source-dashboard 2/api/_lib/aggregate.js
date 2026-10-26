// Pure aggregation: HubSpot contact records -> compact count cube.
// No Node APIs here, so it can also run in a browser for testing.

export const PROPS = [
  "createdate",
  "hs_object_source_label",
  "hs_object_source_detail_1",
  "ft_lead_source",
  "ft_lead_source_detail",
  "lifecyclestage",
];

const clean = (v, max = 80) => (v == null ? "" : String(v).trim().toLowerCase().slice(0, max));

// Cube shape:
//   dims: { month: [...], rec: [...], recDetail: [...], ft: [...], ftDetail: [...], stage: [...] }
//   rows: [[monthIdx, recIdx, recDetailIdx, ftIdx, ftDetailIdx, stageIdx, count], ...]
// "" in a dim means the property was empty on the record.
export function buildCube(records) {
  const names = ["month", "rec", "recDetail", "ft", "ftDetail", "stage"];
  const dims = Object.fromEntries(names.map(n => [n, []]));
  const index = Object.fromEntries(names.map(n => [n, new Map()]));
  const idx = (n, v) => {
    let i = index[n].get(v);
    if (i === undefined) { i = dims[n].length; dims[n].push(v); index[n].set(v, i); }
    return i;
  };
  const counts = new Map();
  for (const r of records) {
    const p = r.properties || r;
    const created = p.createdate ? String(p.createdate).slice(0, 7) : "";
    const key = [
      idx("month", created),
      idx("rec", p.hs_object_source_label || ""),
      idx("recDetail", clean(p.hs_object_source_detail_1)),
      idx("ft", p.ft_lead_source || ""),
      idx("ftDetail", clean(p.ft_lead_source_detail)),
      idx("stage", p.lifecyclestage || ""),
    ].join(",");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [];
  for (const [k, c] of counts) rows.push([...k.split(",").map(Number), c]);
  return { dims, rows, total: records.length };
}
