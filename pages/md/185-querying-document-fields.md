Querying a document database is different from writing SQL — but the underlying ideas are the same. You specify **which documents you want** (filtering), **which fields to return** (projection), and **how to sort or paginate** the results. This page walks through the query model, shows how path-based expressions work, and compares document query syntax to its SQL equivalent.

## The Query Model at a Glance

In a relational database you describe what you want in SQL. In a document database you typically pass a **query document** (itself a JSON object) that describes the shape of documents you want to match.

```js
// "Find all orders where status is 'shipped' and total > 100"
db.orders.find({
  status: "shipped",
  total: { $gt: 100 }
})
```

The outer object `{ status: "shipped", total: { $gt: 100 } }` is the **filter**. Every field in the filter must match the target document. Multiple conditions are implicitly `AND`-ed together.

This parallels a SQL `WHERE` clause:

```sql
SELECT * FROM orders WHERE status = 'shipped' AND total > 100;
```

## Field-Path Expressions

Because documents are trees, not flat rows, document databases need a way to address nested fields. The standard notation is **dot-separated paths**:

| Path | What it targets |
|---|---|
| `status` | Top-level field `status` |
| `address.city` | `city` inside the `address` object |
| `items.0.sku` | `sku` of the first element of `items` |
| `items.sku` | `sku` of *any* element in `items` (array match) |

The last case — `items.sku` without an index — is special. It returns the document if **any** element in the `items` array has a matching `sku`. This implicit array unrolling is unique to the document query model and has no direct SQL equivalent without `json_each`.

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram showing how a dotted path expression items.sku traverses a document tree to match any element in the items array">
  <defs>
    <marker id="arrq" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arrq2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--border)"/>
    </marker>
  </defs>

  <!-- Document tree -->
  <rect x="10" y="20" width="300" height="240" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="160" y="44" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--text)">Document</text>

  <text x="28" y="68" font-size="12" fill="var(--text)" font-family="monospace">_id: "ORD-9901"</text>
  <text x="28" y="88" font-size="12" fill="var(--text)" font-family="monospace">status: "shipped"</text>
  <text x="28" y="108" font-size="12" fill="var(--text)" font-family="monospace">items: [</text>
  <text x="44" y="128" font-size="12" fill="var(--accent)" font-family="monospace">  { sku: "SHOE-9B", qty: 1 },</text>
  <text x="44" y="148" font-size="12" fill="var(--accent)" font-family="monospace">  { sku: "SOCK-3P", qty: 3 }</text>
  <text x="28" y="168" font-size="12" fill="var(--text)" font-family="monospace">]</text>

  <!-- Path query explanation -->
  <rect x="340" y="20" width="290" height="240" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="485" y="44" text-anchor="middle" font-size="13" font-weight="bold" fill="var(--accent)">Query: { "items.sku": "SHOE-9B" }</text>

  <text x="354" y="80" font-size="12" fill="var(--text)">1. Resolve path "items"</text>
  <text x="354" y="100" font-size="12" fill="var(--muted)">   → found an array</text>

  <text x="354" y="130" font-size="12" fill="var(--text)">2. For each element, check "sku"</text>
  <rect x="354" y="142" width="262" height="24" rx="3" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1"/>
  <text x="354" y="158" font-size="11" fill="var(--accent)" font-family="monospace">  item[0].sku = "SHOE-9B" ✓ match!</text>
  <rect x="354" y="170" width="262" height="24" rx="3" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="354" y="186" font-size="11" fill="var(--muted)" font-family="monospace">  item[1].sku = "SOCK-3P" — no</text>

  <text x="354" y="220" font-size="12" fill="var(--text)">3. Any element matched →</text>
  <text x="354" y="238" font-size="12" fill="var(--accent)" font-weight="bold">   document included in results</text>
</svg>
<figcaption>The path "items.sku" automatically iterates the array. Any matching element causes the document to be included.</figcaption>
</figure>

## Comparison and Logical Operators

Document databases provide a rich set of query operators. Using MongoDB notation as a common reference:

### Comparison
| Operator | Meaning | Example |
|---|---|---|
| `$eq` | Equal (default when no operator given) | `{ age: 25 }` |
| `$ne` | Not equal | `{ status: { $ne: "cancelled" } }` |
| `$gt` / `$gte` | Greater than / greater than or equal | `{ total: { $gte: 100 } }` |
| `$lt` / `$lte` | Less than / less than or equal | `{ price: { $lt: 50 } }` |
| `$in` | Value in a list | `{ status: { $in: ["pending", "processing"] } }` |
| `$nin` | Value not in a list | `{ category: { $nin: ["archived"] } }` |

### Logical
```js
// OR: documents where status is "shipped" OR total > 1000
db.orders.find({ $or: [ { status: "shipped" }, { total: { $gt: 1000 } } ] })

// AND (explicit form):
db.orders.find({ $and: [ { status: "active" }, { total: { $gt: 0 } } ] })

// NOT:
db.orders.find({ status: { $not: { $eq: "cancelled" } } })
```

### Array Operators
```js
// $elemMatch: all conditions must match the SAME element
db.orders.find({ items: { $elemMatch: { sku: "SHOE-9B", qty: { $gt: 1 } } } })

// Without $elemMatch: conditions can match DIFFERENT elements
// (usually not what you want)
db.orders.find({ "items.sku": "SHOE-9B", "items.qty": { $gt: 1 } })
```

> **Common gotcha:** Without `$elemMatch`, `{ "items.sku": "X", "items.qty": { $gt: 1 } }` matches a document where *some* element has `sku = "X"` **and** *some* element (possibly a different one) has `qty > 1`. Always use `$elemMatch` when you need both conditions to apply to the same array element.

## Projection: Choosing Which Fields to Return

By default, a `find()` returns the entire document. For large documents, that wastes bandwidth and memory. A **projection** specifies which fields to include or exclude:

```js
// Include only name and email (suppress _id)
db.users.find({ status: "active" }, { name: 1, email: 1, _id: 0 })

// Exclude a specific field (useful when document is mostly what you want)
db.users.find({}, { password_hash: 0 })
```

> You cannot mix inclusions and exclusions in the same projection (except for `_id`). Either list the fields you want or the fields you don't want.

## Sorting and Pagination

```js
// Sort by total descending, then by created_at ascending
db.orders.find({ status: "shipped" })
         .sort({ total: -1, created_at: 1 })
         .skip(20)
         .limit(10)
```

`skip + limit` implements offset-based pagination, which is simple but inefficient for large offsets (the engine still scans and discards `skip` documents). For high-performance pagination on large collections, use **cursor-based pagination**: remember the last `_id` (or sort field value) from the previous page and use `$gt` to start the next query from there.

## SQL Translation Reference

| Document Query | SQL Equivalent |
|---|---|
| `find({ status: "active" })` | `WHERE status = 'active'` |
| `find({}, { name: 1 })` | `SELECT name FROM …` |
| `find({}).sort({ price: -1 })` | `ORDER BY price DESC` |
| `find({}).limit(10).skip(20)` | `LIMIT 10 OFFSET 20` |
| `find({ tags: "sale" })` | `WHERE 'sale' = ANY(tags)` |
| `aggregate([{ $group: … }])` | `GROUP BY …` |

## Interactive Example

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Document-style field queries with json_extract</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id TEXT PRIMARY KEY, doc TEXT NOT NULL); INSERT INTO orders VALUES ('ORD-001','{&quot;status&quot;:&quot;shipped&quot;,&quot;total&quot;:250.00,&quot;customer&quot;:{&quot;name&quot;:&quot;Aroha&quot;,&quot;city&quot;:&quot;Auckland&quot;},&quot;items&quot;:[{&quot;sku&quot;:&quot;SHOE-9B&quot;,&quot;qty&quot;:1},{&quot;sku&quot;:&quot;SOCK-3P&quot;,&quot;qty&quot;:3}]}'); INSERT INTO orders VALUES ('ORD-002','{&quot;status&quot;:&quot;pending&quot;,&quot;total&quot;:85.50,&quot;customer&quot;:{&quot;name&quot;:&quot;Leo&quot;,&quot;city&quot;:&quot;Wellington&quot;},&quot;items&quot;:[{&quot;sku&quot;:&quot;HAT-1X&quot;,&quot;qty&quot;:2}]}'); INSERT INTO orders VALUES ('ORD-003','{&quot;status&quot;:&quot;shipped&quot;,&quot;total&quot;:1200.00,&quot;customer&quot;:{&quot;name&quot;:&quot;Priya&quot;,&quot;city&quot;:&quot;Auckland&quot;},&quot;items&quot;:[{&quot;sku&quot;:&quot;LAPTOP-X&quot;,&quot;qty&quot;:1}]}'); INSERT INTO orders VALUES ('ORD-004','{&quot;status&quot;:&quot;cancelled&quot;,&quot;total&quot;:30.00,&quot;customer&quot;:{&quot;name&quot;:&quot;Sam&quot;,&quot;city&quot;:&quot;Christchurch&quot;},&quot;items&quot;:[{&quot;sku&quot;:&quot;SOCK-3P&quot;,&quot;qty&quot;:1}]}');">-- Filter on nested field: shipped orders from Auckland customers
SELECT
  id,
  json_extract(doc, '$.customer.name')  AS customer,
  json_extract(doc, '$.total')          AS total
FROM orders
WHERE json_extract(doc, '$.status') = 'shipped'
  AND json_extract(doc, '$.customer.city') = 'Auckland'
ORDER BY json_extract(doc, '$.total') DESC;

-- Try: change the city, or remove the status filter, or sort ASC</textarea>
  </div>
</div>

## Key Takeaways

- Document queries use a filter document (key-value pairs) rather than SQL syntax; the concepts — filtering, projection, sorting, limiting — are identical.
- Dotted paths navigate nested objects; array paths implicitly match any element.
- `$elemMatch` ensures multiple conditions apply to the same array element — a common source of bugs when omitted.
- Projection limits returned fields, reducing bandwidth and memory for large documents.
- For paginating large results, prefer cursor-based pagination (`$gt` on the last seen `_id`) over `skip` to avoid scanning and discarding rows.
