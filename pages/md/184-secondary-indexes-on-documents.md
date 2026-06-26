Document databases are often portrayed as simple key-lookup stores — fetch a document by its `_id` and you're done. In practice, real applications need to filter, sort, and paginate on many different fields. That's where **secondary indexes** come in. This page explains how secondary indexes work in document databases, what makes them trickier than in relational systems, and how to reason about indexing nested fields and arrays.

## The Default: Primary Key Lookup

Every document in a collection has a unique identifier — MongoDB's `_id`, Firestore's document ID, CouchDB's `_id`. The database maintains a primary index on this field automatically. Any query that specifies the full `_id` value is a direct lookup: O(log n) at worst, typically a B-tree traversal to a leaf.

Everything else — filtering by `status`, sorting by `created_at`, finding by `email` — requires either a **full collection scan** or a secondary index.

## What a Secondary Index Looks Like

A secondary index on a document field is structurally the same as a secondary index in a relational database: a B-tree (or hash, or other structure) keyed by the indexed field's value, with a pointer to the full document.

```
Secondary index on "status":

  "active"  → [doc-001, doc-004, doc-009, ...]
  "inactive"→ [doc-002, doc-007, ...]
  "pending" → [doc-003, doc-005, ...]
```

When you query `{ status: "active" }`, the engine walks the secondary index to find the matching document IDs, then fetches those documents from the primary store. Without the index, it scans every document in the collection.

<figure class="diagram">
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram showing a query on status=active using a secondary index: query goes to the secondary index B-tree, retrieves doc IDs, then fetches documents from the primary store">
  <defs>
    <marker id="arrs" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arrs2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Query box -->
  <rect x="10" y="120" width="130" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="75" y="144" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">Query</text>
  <text x="75" y="163" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="monospace">{ status: &quot;active&quot; }</text>

  <!-- Secondary index -->
  <rect x="190" y="40" width="180" height="220" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="280" y="62" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--accent)">Secondary Index</text>
  <text x="280" y="80" text-anchor="middle" font-size="11" fill="var(--muted)">(B-tree on "status")</text>

  <rect x="204" y="92" width="152" height="28" rx="3" fill="var(--accent)" fill-opacity="0.25" stroke="var(--accent)" stroke-width="1"/>
  <text x="280" y="110" text-anchor="middle" font-size="11" fill="var(--text)" font-weight="bold">"active" → [001,004,009]</text>

  <rect x="204" y="126" width="152" height="28" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="280" y="144" text-anchor="middle" font-size="11" fill="var(--muted)">"inactive" → [002,007]</text>

  <rect x="204" y="160" width="152" height="28" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="280" y="178" text-anchor="middle" font-size="11" fill="var(--muted)">"pending" → [003,005]</text>

  <!-- Arrow: query → index -->
  <line x1="140" y1="150" x2="188" y2="110" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arrs)"/>

  <!-- Primary store -->
  <rect x="430" y="40" width="200" height="220" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="530" y="62" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--text)">Primary Store</text>

  <rect x="444" y="76" width="172" height="36" rx="3" fill="var(--accent)" fill-opacity="0.15" stroke="var(--accent)" stroke-width="1"/>
  <text x="530" y="94" text-anchor="middle" font-size="11" fill="var(--text)">doc-001 { status:"active"... }</text>
  <text x="530" y="107" text-anchor="middle" font-size="10" fill="var(--muted)">full document</text>

  <rect x="444" y="118" width="172" height="28" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="0.8"/>
  <text x="530" y="136" text-anchor="middle" font-size="11" fill="var(--muted)">doc-002 { status:"inactive"...}</text>

  <rect x="444" y="152" width="172" height="36" rx="3" fill="var(--accent)" fill-opacity="0.15" stroke="var(--accent)" stroke-width="1"/>
  <text x="530" y="170" text-anchor="middle" font-size="11" fill="var(--text)">doc-004 { status:"active"... }</text>
  <text x="530" y="183" text-anchor="middle" font-size="10" fill="var(--muted)">full document</text>

  <!-- Arrow: index IDs → primary store -->
  <line x1="372" y1="106" x2="428" y2="106" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arrs)"/>
  <text x="400" y="98" text-anchor="middle" font-size="10" fill="var(--accent)">fetch docs</text>
  <text x="400" y="109" text-anchor="middle" font-size="10" fill="var(--accent)">by ID</text>
</svg>
<figcaption>A secondary index narrows the query to matching document IDs; the engine then fetches full documents from the primary store.</figcaption>
</figure>

## Indexing Nested Fields

The ability to index fields inside nested objects is one area where document databases diverge from simple key-value stores. In MongoDB you create an index with dotted-path notation:

```js
// Index the city field inside the address sub-object
db.users.createIndex({ "address.city": 1 })

// Query uses the index automatically
db.users.find({ "address.city": "Auckland" })
```

The database walks the document tree to extract `address.city` at write time and inserts the value into the secondary index. Queries on that path then use the index instead of scanning documents.

> **Note:** Indexing is always a write-time cost. Every time a document is inserted or its indexed field changes, all affected indexes must be updated. More indexes = slower writes. Index only what your queries actually need.

## Multikey Indexes: Indexing Arrays

When you index an array field, a document database creates one index entry **per array element**. This is called a multikey index (MongoDB's term) or array index.

```js
db.products.createIndex({ tags: 1 })

// Document: { _id: "p1", tags: ["footwear", "sale", "sport"] }
// Creates three index entries:
//   "footwear" → p1
//   "sale"     → p1
//   "sport"    → p1
```

This lets you query `{ tags: "sale" }` efficiently — the index is checked for the single value `"sale"` and returns `p1` instantly.

**Trade-off:** A document with a 50-element array creates 50 index entries. Arrays with many elements balloon index size and slow writes.

## Compound Indexes on Documents

Just as in relational databases, you can create compound (multi-field) indexes:

```js
// Supports queries that filter on status AND sort by created_at
db.orders.createIndex({ status: 1, created_at: -1 })
```

The same left-prefix rule applies: a compound index on `(status, created_at)` helps queries on `status` alone, but not queries on `created_at` alone.

## Covered Queries

A covered query is one where the index contains all the fields needed to satisfy the query — no document fetch is required. This works the same way as in relational databases:

```js
// If index is { email: 1, name: 1 }, this query is covered:
db.users.find({ email: "a@x.com" }, { name: 1, _id: 0 })
// Returns name from the index itself — never reads the document
```

Covered queries can be orders of magnitude faster for read-heavy workloads.

## Index Types Available in Document Databases

| Index Type | Description | When to use |
|---|---|---|
| Single-field | One field, ascending or descending | Most common; point lookups and range scans |
| Compound | Multiple fields | Queries that filter/sort on multiple fields |
| Multikey | Array fields (one entry per element) | `{ tags: "X" }` style array queries |
| Text | Full-text tokenization | Search-style keyword queries |
| Geospatial | 2D/2dsphere for lat/lng | Location-based queries |
| TTL | Expire documents automatically | Session data, logs with a retention window |
| Partial | Index only documents matching a filter | Large collections where you only query a subset |
| Sparse | Omit documents where the field is missing | Optional fields that appear in few documents |

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Secondary index on a JSON field (simulated)</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (id TEXT PRIMARY KEY, doc TEXT NOT NULL); INSERT INTO products VALUES ('p1', '{&quot;name&quot;:&quot;Trail Shoe&quot;,&quot;category&quot;:&quot;footwear&quot;,&quot;price&quot;:120,&quot;tags&quot;:[&quot;sale&quot;,&quot;sport&quot;]}'); INSERT INTO products VALUES ('p2', '{&quot;name&quot;:&quot;Running Hat&quot;,&quot;category&quot;:&quot;apparel&quot;,&quot;price&quot;:35,&quot;tags&quot;:[&quot;sport&quot;]}'); INSERT INTO products VALUES ('p3', '{&quot;name&quot;:&quot;Sandal&quot;,&quot;category&quot;:&quot;footwear&quot;,&quot;price&quot;:60,&quot;tags&quot;:[&quot;sale&quot;,&quot;casual&quot;]}'); INSERT INTO products VALUES ('p4', '{&quot;name&quot;:&quot;Polo Shirt&quot;,&quot;category&quot;:&quot;apparel&quot;,&quot;price&quot;:45,&quot;tags&quot;:[&quot;casual&quot;]}'); CREATE TABLE product_tags (product_id TEXT, tag TEXT); INSERT INTO product_tags SELECT products.id, e.value FROM products, json_each(json_extract(doc,'$.tags')) e; CREATE INDEX idx_product_tags ON product_tags(tag); CREATE INDEX idx_product_category ON products(json_extract(doc,'$.category'));">-- Query using secondary index on category (SQLite functional index)
SELECT id, json_extract(doc, '$.name') AS name, json_extract(doc, '$.price') AS price
FROM products
WHERE json_extract(doc, '$.category') = 'footwear'
ORDER BY json_extract(doc, '$.price');

-- Uncomment to query via the multikey-style tag index:
-- SELECT DISTINCT p.id, json_extract(p.doc, '$.name') AS name
-- FROM products p JOIN product_tags pt ON p.id = pt.product_id
-- WHERE pt.tag = 'sale';</textarea>
  </div>
</div>

The `product_tags` table simulates a multikey index — one row per tag per product, exactly as MongoDB stores multikey index entries. The compound query at the bottom shows how a join against the expanded index structure replaces a full document scan.

## Key Takeaways

- Secondary indexes in document databases work the same way as in relational databases: B-tree or hash structures pointing to documents by their primary key.
- Dotted-path syntax lets you index fields inside nested objects (`address.city`).
- Multikey indexes on arrays create one index entry per array element — powerful but can inflate index size.
- The left-prefix rule for compound indexes applies just as in SQL.
- Covered queries (all needed fields in the index) avoid document fetches entirely.
- Index sparingly: each additional index adds write overhead. Use partial or sparse indexes to limit index size when only a subset of documents needs the index.
