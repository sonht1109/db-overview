In relational databases, you design a normalized schema that accurately models your domain, then write whatever queries you need against it. In column-family databases — particularly Cassandra and its derivatives — you must reverse that process: **start from the queries you need to serve, then design tables around those queries**. This is one of the most important conceptual shifts when moving to the column-family world, and getting it wrong causes severe performance problems at scale.

## The Golden Rule: One Table Per Query Pattern

Cassandra's architecture explains why this rule exists. Data is physically partitioned across a cluster by the **partition key**. A query that touches only one partition hits one node and returns in single-digit milliseconds. A query that touches many partitions must scatter across the cluster, gather results, and merge them — an expensive operation that Cassandra tries to discourage by requiring `ALLOW FILTERING` for any query that cannot be routed by the partition key alone.

The practical consequence: if you have two different access patterns, you almost always need two different tables — even if both tables hold the same logical data.

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two design approaches: entity-first on the left leads to ad-hoc queries that require full scans; query-first on the right has one table per access pattern with fast partition reads">
  <defs>
    <marker id="arr197" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr197b" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- Left panel: Entity-first -->
  <rect x="10" y="10" width="310" height="295" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="165" y="34" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">Entity-First Design (Relational)</text>

  <rect x="80" y="50" width="150" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="155" y="72" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">users</text>
  <text x="155" y="89" text-anchor="middle" font-size="11" fill="var(--muted)">user_id, email, name, …</text>
  <text x="155" y="104" text-anchor="middle" font-size="10" fill="var(--muted)">one table, many queries</text>

  <!-- Arrows from single table to many queries -->
  <line x1="155" y1="110" x2="60" y2="160" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr197b)"/>
  <line x1="155" y1="110" x2="155" y2="160" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr197b)"/>
  <line x1="155" y1="110" x2="250" y2="160" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr197b)"/>

  <rect x="20" y="160" width="100" height="40" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="70" y="177" text-anchor="middle" font-size="10" fill="var(--text)">lookup by id</text>
  <text x="70" y="193" text-anchor="middle" font-size="10" fill="var(--accent)">✓ fast</text>

  <rect x="105" y="160" width="100" height="40" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="155" y="177" text-anchor="middle" font-size="10" fill="var(--text)">lookup by email</text>
  <text x="155" y="193" text-anchor="middle" font-size="10" fill="var(--muted)">needs index</text>

  <rect x="190" y="160" width="110" height="40" rx="4" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="245" y="177" text-anchor="middle" font-size="10" fill="var(--text)">filter by country</text>
  <text x="245" y="193" text-anchor="middle" font-size="10" fill="var(--muted)">ALLOW FILTERING</text>

  <rect x="35" y="225" width="240" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="155" y="247" text-anchor="middle" font-size="11" fill="var(--muted)">Ad-hoc queries work in SQL.</text>
  <text x="155" y="264" text-anchor="middle" font-size="11" fill="var(--muted)">In Cassandra: slow or forbidden.</text>

  <!-- Right panel: Query-first -->
  <rect x="380" y="10" width="310" height="295" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="535" y="34" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">Query-First Design (Cassandra)</text>

  <!-- Query boxes at top -->
  <rect x="400" y="50" width="130" height="40" rx="4" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="465" y="67" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent)">Q1: lookup by user_id</text>
  <text x="465" y="82" text-anchor="middle" font-size="10" fill="var(--muted)">access pattern 1</text>

  <rect x="545" y="50" width="130" height="40" rx="4" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="610" y="67" text-anchor="middle" font-size="10" font-weight="600" fill="var(--accent)">Q2: lookup by email</text>
  <text x="610" y="82" text-anchor="middle" font-size="10" fill="var(--muted)">access pattern 2</text>

  <!-- Arrows from queries to tables -->
  <line x1="465" y1="90" x2="465" y2="145" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr197)"/>
  <line x1="610" y1="90" x2="610" y2="145" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr197)"/>

  <!-- Table boxes -->
  <rect x="400" y="145" width="130" height="65" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="465" y="163" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent)">users_by_id</text>
  <text x="465" y="179" text-anchor="middle" font-size="10" fill="var(--text)">PK: user_id</text>
  <text x="465" y="194" text-anchor="middle" font-size="10" fill="var(--muted)">email, name, …</text>
  <text x="465" y="205" text-anchor="middle" font-size="9" fill="var(--accent)">single partition hit ✓</text>

  <rect x="545" y="145" width="130" height="65" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="610" y="163" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent)">users_by_email</text>
  <text x="610" y="179" text-anchor="middle" font-size="10" fill="var(--text)">PK: email</text>
  <text x="610" y="194" text-anchor="middle" font-size="10" fill="var(--muted)">user_id, name, …</text>
  <text x="610" y="205" text-anchor="middle" font-size="9" fill="var(--accent)">single partition hit ✓</text>

  <rect x="405" y="235" width="270" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1" opacity="0.7"/>
  <text x="540" y="257" text-anchor="middle" font-size="11" fill="var(--text)">Duplicate data, but every query</text>
  <text x="540" y="274" text-anchor="middle" font-size="11" fill="var(--accent)">hits exactly one partition — always fast.</text>
</svg>
<figcaption>Entity-first design uses one table for all queries; query-first design uses one table per access pattern. The right side stores duplicate data but every read is a single-partition lookup.</figcaption>
</figure>

## Why ALLOW FILTERING Is a Red Flag

In Cassandra Query Language (CQL), adding `ALLOW FILTERING` to a query tells the coordinator: "I know this is expensive — scan every partition anyway." This is roughly equivalent to a full table scan in SQL, except it is distributed: the coordinator must contact every node, pull all data, and filter in memory.

```sql
-- This query is FAST in Cassandra: partition key in WHERE
SELECT * FROM users_by_id WHERE user_id = 'u-4291';

-- This query requires ALLOW FILTERING — touches every partition
SELECT * FROM users_by_id WHERE country = 'DE' ALLOW FILTERING;
-- Equivalent to: SELECT * FROM users WHERE country = 'DE' (no index, full scan)
```

> **Rule of thumb:** If you find yourself writing `ALLOW FILTERING` in production code, you are missing a table. The solution is not to optimize the query — it is to create a dedicated table for that access pattern.

## The "One Table Per Query" Pattern

The canonical Cassandra data modeling methodology proceeds in four steps:

1. **List your queries** — Write down every access pattern your application needs. Be specific: "Find user by user_id", "Find user by email", "List all orders for a user, newest first".
2. **Design a table for each query** — The partition key answers "which node?"; the clustering key answers "in what order within the partition?".
3. **Accept the duplication** — The same logical entity may live in 3–5 tables. That is by design, not a mistake.
4. **Keep tables in sync at write time** — When a user's email changes, you update both `users_by_id` and `users_by_email`. Cassandra's lightweight transactions (LWT) or application-level logic handles this.

### Partition Key Selection

The partition key is the most important design decision in a column-family schema. A good partition key:

- **Distributes writes evenly** — All user IDs, for example, spread naturally across nodes via consistent hashing. A partition key of `country` would send all German users to a handful of nodes (a hot partition).
- **Matches the query exactly** — The query must supply the full partition key in its `WHERE` clause. If your query is "find by email", the partition key must be `email`.
- **Avoids unbounded growth** — A partition storing all events ever emitted for an account may eventually exceed the 2 GB recommended maximum. Composite partition keys like `(user_id, year_month)` bucket data by time to bound partition size.

| Partition Key Choice | Cardinality | Risk |
|---|---|---|
| `user_id` (UUID) | Very high | Excellent distribution |
| `country` | ~200 values | Hot partition — avoid |
| `status` (`active`/`inactive`) | 2 values | Extreme skew — never use alone |
| `(user_id, year_month)` | High | Good; bounds partition size |

## Practical Example: User Profile Tables

Imagine an application with two lookup requirements:

1. "Get user profile by user_id" — used on every authenticated API request
2. "Get user profile by email" — used during login

In SQL, one table with two indexes handles both easily. In Cassandra, you create two tables:

```sql
-- Table 1: primary lookup by user_id
CREATE TABLE users_by_id (
  user_id   UUID,
  email     TEXT,
  full_name TEXT,
  created_at TIMESTAMP,
  PRIMARY KEY (user_id)
);

-- Table 2: lookup by email (for login)
CREATE TABLE users_by_email (
  email     TEXT,
  user_id   UUID,
  full_name TEXT,
  created_at TIMESTAMP,
  PRIMARY KEY (email)
);
```

Both tables contain the same data, duplicated. A write must insert (or update) both. A read hits exactly one table and one partition — guaranteed single-node resolution.

### Clustering Keys for Ordered Data

Within a partition, rows are physically ordered by the **clustering key**. This unlocks efficient range scans inside a partition:

```sql
-- Orders for a user, most recent first
CREATE TABLE orders_by_user (
  user_id    UUID,
  created_at TIMESTAMP,
  order_id   UUID,
  total      DECIMAL,
  PRIMARY KEY (user_id, created_at, order_id)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- Query fetches the partition for user_id, then slices by time range — fast
SELECT * FROM orders_by_user
WHERE user_id = 'u-4291'
  AND created_at >= '2024-01-01'
  AND created_at < '2024-02-01';
```

The clustering key range scan (`created_at >= ... AND created_at < ...`) reads a contiguous slice of sorted rows within a single partition — as efficient as a B-tree range scan in a relational database.

## The Trade-off in Plain Terms

| Dimension | Relational (SQL) | Column-Family (Cassandra) |
|---|---|---|
| Schema design | Model entities | Model access patterns |
| Ad-hoc queries | Supported naturally | Expensive or impossible |
| Data duplication | Minimized (normalization) | Accepted (intentional) |
| Write complexity | One row per entity | One row per table per entity |
| Read latency | Depends on indexes/joins | Predictably low (single partition) |
| Query flexibility | High | Low — must plan ahead |

The column-family approach makes reads blindingly fast and perfectly predictable at the cost of write complexity and data duplication. You are essentially **materializing views at write time** — doing the join work upfront, once, rather than at read time, repeatedly.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Two Tables for Two Access Patterns</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE users_by_id (user_id TEXT PRIMARY KEY, email TEXT, full_name TEXT, country TEXT); CREATE TABLE users_by_email (email TEXT PRIMARY KEY, user_id TEXT, full_name TEXT, country TEXT); INSERT INTO users_by_id VALUES ('u-001', 'alice@example.com', 'Alice Chen', 'US'); INSERT INTO users_by_id VALUES ('u-002', 'bob@example.com', 'Bob Smith', 'DE'); INSERT INTO users_by_id VALUES ('u-003', 'carol@example.com', 'Carol Wu', 'US'); INSERT INTO users_by_email VALUES ('alice@example.com', 'u-001', 'Alice Chen', 'US'); INSERT INTO users_by_email VALUES ('bob@example.com', 'u-002', 'Bob Smith', 'DE'); INSERT INTO users_by_email VALUES ('carol@example.com', 'u-003', 'Carol Wu', 'US');">-- Access pattern 1: look up by user_id (partition key hit)
SELECT user_id, email, full_name, country
FROM users_by_id
WHERE user_id = 'u-001';

-- Access pattern 2: look up by email (partition key hit on second table)
-- SELECT user_id, email, full_name
-- FROM users_by_email
-- WHERE email = 'bob@example.com';

-- What Cassandra prevents without ALLOW FILTERING:
-- SELECT * FROM users_by_id WHERE country = 'US';
-- (would require scanning every partition — dangerous in production)</textarea>
  </div>
</div>

## Key Takeaways

- **Model for queries, not for entities.** In column-family databases, the query is the schema. Design tables around the access patterns your application will actually execute.
- **ALLOW FILTERING is a full-cluster scan.** Avoid it in production; its presence signals a missing table.
- **One table per query pattern** is not a smell — it is the correct approach. Duplication is the price of predictable latency.
- **Partition key determines routing.** Every query must supply the full partition key in `WHERE`; everything else risks a full scan.
- **Clustering keys provide ordering within a partition.** Use them for time-range or rank-order access within a user's or device's data.
- **Write fan-out is the cost.** A single logical write may touch multiple tables. Keep tables in sync at write time; the reward is single-partition reads at query time.
