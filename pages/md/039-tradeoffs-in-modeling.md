Every schema design is a negotiation. You are always trading one thing for another — write speed versus read speed, storage versus query simplicity, flexibility versus integrity. There is no universally "correct" model; there is only the model that serves your workload well. This page maps out the most common tradeoffs and gives you the vocabulary to reason about them.

## Normalization vs. Denormalization

The biggest dial in relational modeling is how far you normalize your data.

**Normalization** eliminates redundancy by breaking data into focused tables linked by foreign keys. Each fact lives in exactly one place. If a customer changes their email, you update one row and every related record picks it up automatically.

**Denormalization** deliberately duplicates data to make reads faster. Instead of joining three tables at query time, you store the pre-joined result. Reports fly; updates get harder.

| | Normalized | Denormalized |
|---|---|---|
| **Storage** | Smaller — no repeated data | Larger — data copied across rows |
| **Write complexity** | Low — update one place | Higher — must keep copies in sync |
| **Read complexity** | Higher — joins required | Lower — data is already together |
| **Risk** | Missed joins produce wrong counts | Out-of-sync copies produce stale data |
| **Typical use** | OLTP (order entry, user accounts) | OLAP, caches, pre-computed reports |

> **Note:** Most production systems live somewhere in the middle. Start normalized, then denormalize specific hot paths once you can measure the bottleneck.

The widget below shows the same question answered two ways. Run the normalized version first, then switch to the denormalized query to see the difference in structure.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Normalized vs. denormalized reads</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL); CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), product TEXT NOT NULL, amount REAL NOT NULL); INSERT INTO customers VALUES (1, 'Alice', 'Berlin'); INSERT INTO customers VALUES (2, 'Bob', 'Paris'); INSERT INTO orders VALUES (1, 1, 'Keyboard', 89.00); INSERT INTO orders VALUES (2, 1, 'Mouse', 24.50); INSERT INTO orders VALUES (3, 2, 'Monitor', 349.00); CREATE TABLE orders_denorm (id INTEGER PRIMARY KEY, customer_name TEXT NOT NULL, city TEXT NOT NULL, product TEXT NOT NULL, amount REAL NOT NULL); INSERT INTO orders_denorm VALUES (1, 'Alice', 'Berlin', 'Keyboard', 89.00); INSERT INTO orders_denorm VALUES (2, 'Alice', 'Berlin', 'Mouse', 24.50); INSERT INTO orders_denorm VALUES (3, 'Bob', 'Paris', 'Monitor', 349.00);">-- Normalized: requires a join to see customer name
SELECT o.id, c.name AS customer, c.city, o.product, o.amount
FROM orders o
JOIN customers c ON c.id = o.customer_id;

-- Denormalized: no join needed, but 'Alice' and 'Berlin' are stored twice
-- SELECT id, customer_name, city, product, amount FROM orders_denorm;</textarea>
  </div>
</div>

## Flexibility vs. Integrity

A schema can be strict or permissive about what data it accepts.

**Strict schemas** use foreign keys, `NOT NULL`, `CHECK` constraints, and specific data types to enforce rules at the database level. Bad data is rejected before it lands. The cost is rigidity: adding a new field or changing a constraint requires a schema migration.

**Flexible schemas** (common in document databases, or relational tables with a JSON column) accept almost anything. You can evolve the shape of a record without a migration. The cost is that integrity rules move into application code, where they are easier to forget and harder to enforce consistently.

```sql
-- Strict: the database rejects orders with a negative amount
CREATE TABLE orders (
  id       INTEGER PRIMARY KEY,
  product  TEXT    NOT NULL,
  amount   REAL    NOT NULL CHECK (amount > 0)
);

-- Flexible: a JSON blob column holds anything; validation is up to the app
CREATE TABLE events (
  id      INTEGER PRIMARY KEY,
  payload TEXT    -- stores arbitrary JSON; no schema enforced here
);
```

A useful heuristic: put constraints on data that **must** be correct for the system to work (prices, foreign keys, status codes). Leave flexibility for data that genuinely varies across records or evolves rapidly (user preferences, feature flags, metadata).

## Wide Tables vs. Many Tables

A related tension is **width** — should you pack many columns into one table, or split into several narrower tables?

**Wide tables** are convenient. One query fetches everything about an entity without joins. But wide tables often mix concerns: a `users` table that stores authentication fields, billing fields, and preference fields becomes a maintenance headache as the system grows. Unrelated columns change for unrelated reasons.

**Many narrower tables** (sometimes called vertical partitioning or table splitting) keep each table focused on one concern. Joins are required, but each table stays coherent and independently evolvable.

<details class="reveal"><summary>Reveal: When does a wide table become a problem?</summary><div class="reveal-body">

A wide table is a warning sign when:
- Most queries only read a small subset of columns, so the engine reads wasted data from disk.
- Different teams or services own different groups of columns, causing coordination friction on every migration.
- Many columns are `NULL` for most rows, which usually means those columns belong to a separate entity (a classic sign of a missing table).

The fix is usually to extract the cohesive group of columns into its own table linked by a foreign key.

</div></details>

## Write Amplification and Read Amplification

Every modeling decision shifts work between reads and writes:

- **Read amplification** happens when answering a query requires touching many rows or tables. Deep normalization increases read amplification because joins pull from multiple locations.
- **Write amplification** happens when a single logical change requires updating many rows or files. Denormalization increases write amplification because the same fact is stored in multiple places.

Neither is inherently bad — the question is which direction your workload can afford. An analytics dashboard runs a heavy read once a minute; write amplification from maintaining a summary table is cheap. A real-time inventory system writes thousands of stock updates per second; read amplification from a join is far less painful than trying to keep denormalized copies consistent.

> **Note:** These same concepts apply beyond relational databases. Column-oriented databases, search indexes, and caches are all forms of deliberate read-optimization at the cost of write complexity. The tradeoff is universal.

The skill of data modeling is knowing which tradeoff you are making and being deliberate about it — not avoiding tradeoffs altogether.
