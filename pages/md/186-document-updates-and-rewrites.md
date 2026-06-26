Updating documents sounds straightforward — change a field, save the document. But the mechanics matter a great deal at scale. Document databases offer two fundamentally different update strategies: **whole-document replacement** and **field-level operators**. Choosing between them — and understanding the concurrency hazards of each — is essential for building correct applications.

## The Two Update Strategies

### Whole-Document Replacement

The simplest model: read the document, modify it in your application, write the entire new document back. Every document database supports this.

```js
// Fetch the document
const user = await db.users.findOne({ _id: "usr-441" });

// Modify in application memory
user.last_login = new Date();
user.login_count += 1;

// Write the entire new document back
await db.users.replaceOne({ _id: "usr-441" }, user);
```

**Problem:** This is a **read-modify-write cycle**. Between the read and the write, another concurrent request could modify the same document. Your write overwrites those changes. This is the classic **lost update** problem.

### Field-Level Update Operators

Most document databases provide atomic update operators that modify only specific fields without reading the document first:

```js
// Atomic: increment login_count and set last_login — no read needed
await db.users.updateOne(
  { _id: "usr-441" },
  {
    $set:  { last_login: new Date() },
    $inc:  { login_count: 1 },
    $push: { recent_ips: "203.0.113.5" }
  }
)
```

This executes as a single atomic operation on the server. No other write can interleave. The document is read, modified, and written as an indivisible unit.

<figure class="diagram">
<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Side-by-side comparison: read-modify-write cycle (left, showing lost update hazard) vs atomic field-level update (right, showing no read needed)">
  <defs>
    <marker id="arru" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arrur" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--text)"/>
    </marker>
  </defs>

  <!-- Left panel: read-modify-write -->
  <rect x="10" y="10" width="290" height="300" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="155" y="36" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--text)">Read-Modify-Write</text>

  <rect x="75" y="52" width="160" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="155" y="71" text-anchor="middle" font-size="12" fill="var(--text)">1. Read document</text>
  <line x1="155" y1="82" x2="155" y2="108" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arrur)"/>

  <rect x="40" y="110" width="230" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="155" y="129" text-anchor="middle" font-size="12" fill="var(--text)">2. Modify in app (count += 1)</text>
  <line x1="155" y1="140" x2="155" y2="166" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arrur)"/>

  <rect x="75" y="168" width="160" height="30" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="155" y="187" text-anchor="middle" font-size="12" fill="var(--text)">3. Write full document</text>

  <!-- Hazard label -->
  <rect x="22" y="230" width="266" height="52" rx="5" fill="var(--accent)" fill-opacity="0.1" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="155" y="252" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--accent)">⚠ Lost Update Risk</text>
  <text x="155" y="270" text-anchor="middle" font-size="11" fill="var(--muted)">Concurrent write between steps</text>
  <text x="155" y="284" text-anchor="middle" font-size="11" fill="var(--muted)">1 and 3 is overwritten silently.</text>

  <!-- Right panel: atomic -->
  <rect x="340" y="10" width="290" height="300" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="485" y="36" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Atomic Field-Level Update</text>

  <rect x="365" y="60" width="240" height="100" rx="5" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1"/>
  <text x="485" y="84" text-anchor="middle" font-size="12" fill="var(--text)" font-family="monospace">$inc: { login_count: 1 }</text>
  <text x="485" y="104" text-anchor="middle" font-size="12" fill="var(--text)" font-family="monospace">$set: { last_login: now }</text>
  <text x="485" y="124" text-anchor="middle" font-size="12" fill="var(--text)" font-family="monospace">$push: { ips: &quot;...&quot; }</text>
  <line x1="485" y1="162" x2="485" y2="188" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arru)"/>

  <rect x="395" y="190" width="180" height="30" rx="4" fill="var(--accent)" fill-opacity="0.2" stroke="var(--accent)" stroke-width="1"/>
  <text x="485" y="209" text-anchor="middle" font-size="12" fill="var(--text)">Server applies atomically</text>

  <!-- Safe label -->
  <rect x="352" y="240" width="266" height="52" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="485" y="262" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">No read needed. No lost update.</text>
  <text x="485" y="280" text-anchor="middle" font-size="11" fill="var(--muted)">Operation is indivisible on the server.</text>
</svg>
<figcaption>Read-modify-write exposes a lost-update window. Atomic operators eliminate it.</figcaption>
</figure>

## Common Update Operators

| Operator | What it does | Example |
|---|---|---|
| `$set` | Set one or more fields | `$set: { status: "active" }` |
| `$unset` | Remove a field from the document | `$unset: { temp_field: "" }` |
| `$inc` | Increment a numeric field by N | `$inc: { views: 1 }` |
| `$mul` | Multiply a numeric field by N | `$mul: { price: 1.1 }` |
| `$rename` | Rename a field | `$rename: { "old": "new" }` |
| `$push` | Append to an array | `$push: { tags: "sale" }` |
| `$pull` | Remove matching elements from array | `$pull: { tags: "draft" }` |
| `$addToSet` | Append if not already present | `$addToSet: { tags: "new" }` |
| `$pop` | Remove first or last array element | `$pop: { items: -1 }` |
| `$setOnInsert` | Only set fields if this is an insert (upsert) | Used with upsert operations |

## Upserts

An **upsert** (update-or-insert) is a single atomic operation: if a document matching the filter exists, update it; if not, create it. This pattern is extremely useful for idempotent writes.

```js
// Upsert: find by external ID; update if exists, insert if not
await db.users.updateOne(
  { external_id: "oauth-google-12345" },
  {
    $set:         { last_seen: new Date() },
    $setOnInsert: { created_at: new Date(), plan: "free" }
  },
  { upsert: true }
)
```

`$set` applies on both insert and update. `$setOnInsert` applies only when a new document is created.

## Whole-Document Replacement: When Is It Safe?

Replacement is fine when:
- Only one process ever updates this document (no concurrent writers).
- You use **optimistic concurrency control** — store a version counter or timestamp, check it in the filter, and retry if the update finds zero matches (the document was concurrently modified).

```js
// Optimistic concurrency: include version in filter
const result = await db.records.updateOne(
  { _id: "rec-001", version: 5 },           // match only if version is still 5
  { $set: { data: newData, version: 6 } }   // increment version on write
)
if (result.matchedCount === 0) {
  throw new Error("Concurrent modification — retry");
}
```

## Partial Updates on Arrays: Positional Operators

Updating a specific element inside an array requires positional update operators:

```js
// Update qty of the item where sku matches
db.orders.updateOne(
  { _id: "ORD-9901", "items.sku": "SOCK-3P" },
  { $set: { "items.$.qty": 5 } }      // $ refers to the matched element
)

// Update all items where qty < 1 (MongoDB 3.6+)
db.orders.updateOne(
  { _id: "ORD-9901" },
  { $set: { "items.$[elem].backordered": true } },
  { arrayFilters: [ { "elem.qty": { $lt: 1 } } ] }
)
```

> **Note:** The `$` positional operator only works when the array field is included in the query filter. If the array is not filtered, use `$[]` to update all elements.

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Simulating document update patterns</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE docs (id TEXT PRIMARY KEY, doc TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1); INSERT INTO docs VALUES ('usr-001', '{&quot;name&quot;:&quot;Priya&quot;,&quot;status&quot;:&quot;active&quot;,&quot;login_count&quot;:5,&quot;tags&quot;:[&quot;beta&quot;]}', 1); INSERT INTO docs VALUES ('usr-002', '{&quot;name&quot;:&quot;Leo&quot;,&quot;status&quot;:&quot;inactive&quot;,&quot;login_count&quot;:0,&quot;tags&quot;:[]}', 1);">-- Simulate an atomic field-level update (increment login_count, set status)
UPDATE docs
SET
  doc = json_set(
          json_set(doc, '$.login_count', json_extract(doc, '$.login_count') + 1),
          '$.status', 'active'
        ),
  version = version + 1
WHERE id = 'usr-001';

-- See the result
SELECT id, json_extract(doc, '$.login_count') AS login_count,
           json_extract(doc, '$.status') AS status,
           version
FROM docs;</textarea>
  </div>
</div>

The `json_set()` function updates fields in place without replacing the full document. The `version` column increments with each write, enabling optimistic concurrency checks.

## Key Takeaways

- **Read-modify-write cycles are dangerous** under concurrency; use atomic update operators (`$set`, `$inc`, `$push`, etc.) to avoid lost updates.
- Atomic operators execute on the server as a single indivisible step — no concurrent write can interleave.
- Upserts combine insert-or-update into one atomic operation, eliminating the race condition of "check then insert."
- For whole-document replacement, protect against concurrent modification with optimistic concurrency (store a version field and include it in the filter).
- Positional array operators (`$`, `$[]`, `arrayFilters`) let you surgically update specific elements inside embedded arrays.
