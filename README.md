# PNJ Diamond Inventory & Velocity Tracker — Dashboard

Static dashboard visualising PNJ's public web inventory (diamond / gold jewellery / 24K gold),
built as alternative data to gauge whether PNJ can sell through its ~2,000 tỷ diamond stock.

- **Data**: a frozen snapshot (`data/data.js`) of aggregated roll-ups + a karat × jewellery-type ×
  price cross-tab. Derived from PNJ's public web catalogue; no per-SKU or personal data.
- **Panels**: KPI banner, inventory-value trend vs the 2,000 tỷ benchmark, units/sell-through,
  assortment, review velocity, relative index, median price, and a 3-way **pivot**
  (group-by × split-by × metric).

Served via GitHub Pages — pure static HTML/JS (Chart.js from CDN). To refresh the snapshot,
regenerate `data/data.js` from the source Google Sheet and redeploy.

> `amount` = system-wide stock (not store-level, not sales). Signals are catalogue-level proxies,
> not exact sales figures. Karat/type parsed from product names.
