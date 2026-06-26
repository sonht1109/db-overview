Relational databases are extraordinarily good at joins — as long as you don't need too many of them in sequence. The moment a query requires following relationships **three, four, or five hops deep**, the join machinery starts to buckle. This page explains why, using a LinkedIn-style "people you may know" query as a concrete example, and shows exactly where the performance cliff appears.

## The Fan-Out Problem

Imagine a social network. Every person has, on average, **5 connections**. You want to find everyone within 3 hops of a given user — a common "recommendations" pattern.

| Hops | People reached | SQL joins required |
|------|---------------|-------------------|
| 0 | 1 (yourself) | 0 |
| 1 | 5 | 1 self-join |
| 2 | 25 | 2 self-joins |
| 3 | 125 | 3 self-joins |
| 4 | 625 | 4 self-joins |
| 5 | 3 125 | 5 self-joins |

Each hop multiplies the intermediate result set. That multiplication is not just a count of rows returned — it is the number of index lookups the database engine must perform at each stage. With realistic branching factors (LinkedIn users average ~hundreds of connections), the intermediate join tables balloon into millions of rows before deduplication.

<figure class="diagram">
<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fan-out diagram: 1 person at hop 0 expands to 5 at hop 1, 25 at hop 2, 125 at hop 3">
  <defs>
    <marker id="arr-fan" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
      <path d="M0,0 L0,6 L7,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- Hop labels -->
  <text x="60"  y="18" text-anchor="middle" font-size="11" fill="var(--muted)">Hop 0</text>
  <text x="200" y="18" text-anchor="middle" font-size="11" fill="var(--muted)">Hop 1</text>
  <text x="380" y="18" text-anchor="middle" font-size="11" fill="var(--muted)">Hop 2</text>
  <text x="570" y="18" text-anchor="middle" font-size="11" fill="var(--muted)">Hop 3</text>

  <!-- Hop 0: root node -->
  <circle cx="60" cy="160" r="22" fill="var(--accent)" opacity="0.85"/>
  <text x="60" y="165" text-anchor="middle" font-size="11" font-weight="700" fill="var(--surface-2)">You</text>

  <!-- Hop 1: 5 nodes -->
  <circle cx="200" cy="60"  r="16" fill="var(--accent)" opacity="0.55"/>
  <circle cx="200" cy="110" r="16" fill="var(--accent)" opacity="0.55"/>
  <circle cx="200" cy="160" r="16" fill="var(--accent)" opacity="0.55"/>
  <circle cx="200" cy="210" r="16" fill="var(--accent)" opacity="0.55"/>
  <circle cx="200" cy="260" r="16" fill="var(--accent)" opacity="0.55"/>
  <text x="200" y="295" text-anchor="middle" font-size="10" fill="var(--muted)">5 friends</text>

  <!-- Lines hop 0→1 -->
  <line x1="82" y1="145" x2="183" y2="68"  stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr-fan)"/>
  <line x1="82" y1="153" x2="183" y2="112" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr-fan)"/>
  <line x1="82" y1="160" x2="183" y2="160" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr-fan)"/>
  <line x1="82" y1="167" x2="183" y2="208" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr-fan)"/>
  <line x1="82" y1="175" x2="183" y2="252" stroke="var(--border)" stroke-width="1.2" marker-end="url(#arr-fan)"/>

  <!-- Hop 2: 25 nodes (5 groups × 5) — rendered as bands -->
  <rect x="355" y="30"  width="14" height="250" rx="3" fill="var(--accent)" opacity="0.30"/>
  <text x="378" y="295" text-anchor="start" font-size="10" fill="var(--muted)">25 FoF</text>

  <!-- Lines hop 1→2 (one per hop-1 node) -->
  <line x1="216" y1="60"  x2="354" y2="80"  stroke="var(--border)" stroke-width="1" marker-end="url(#arr-fan)"/>
  <line x1="216" y1="110" x2="354" y2="130" stroke="var(--border)" stroke-width="1" marker-end="url(#arr-fan)"/>
  <line x1="216" y1="160" x2="354" y2="155" stroke="var(--border)" stroke-width="1" marker-end="url(#arr-fan)"/>
  <line x1="216" y1="210" x2="354" y2="195" stroke="var(--border)" stroke-width="1" marker-end="url(#arr-fan)"/>
  <line x1="216" y1="260" x2="354" y2="235" stroke="var(--border)" stroke-width="1" marker-end="url(#arr-fan)"/>

  <!-- Hop 3: 125 nodes — rendered as a filled block -->
  <rect x="530" y="20" width="20" height="265" rx="3" fill="var(--accent)" opacity="0.20"/>
  <text x="555" y="295" text-anchor="start" font-size="10" fill="var(--muted)">125 FoFoF</text>

  <!-- Lines hop 2→3 (3 representative) -->
  <line x1="370" y1="80"  x2="529" y2="60"  stroke="var(--border)" stroke-width="0.8" marker-end="url(#arr-fan)"/>
  <line x1="370" y1="155" x2="529" y2="155" stroke="var(--border)" stroke-width="0.8" marker-end="url(#arr-fan)"/>
  <line x1="370" y1="235" x2="529" y2="250" stroke="var(--border)" stroke-width="0.8" marker-end="url(#arr-fan)"/>

  <!-- Cost annotations -->
  <text x="128" y="135" text-anchor="middle" font-size="10" fill="var(--accent)">JOIN #1</text>
  <text x="290" y="135" text-anchor="middle" font-size="10" fill="var(--accent)">JOIN #2</text>
  <text x="468" y="135" text-anchor="middle" font-size="10" fill="var(--accent)">JOIN #3</text>
</svg>
<figcaption>Each hop multiplies the working set. With average branching factor 5, hop 3 reaches 125 candidates — and SQL must materialise every intermediate row.</figcaption>
</figure>

## What SQL Actually Does

A single hop is easy:

```sql
-- 1-hop: direct friends
SELECT b.user_id AS friend
FROM   connections c
JOIN   users b ON c.to_user = b.user_id
WHERE  c.from_user = 42;
```

Two hops: join again against the result:

```sql
-- 2-hop: friends of friends
SELECT DISTINCT fof.user_id
FROM   connections c1
JOIN   connections c2 ON c1.to_user = c2.from_user
JOIN   users fof      ON c2.to_user = fof.user_id
WHERE  c1.from_user = 42
  AND  fof.user_id <> 42;
```

The query planner sees `connections` twice. With 10 million rows in `connections`, each B-tree lookup is O(log N) ≈ 23 comparisons. After the first join, you might have 500 rows; the second join then fires 500 × O(log N) index lookups. At three hops, 2 500 lookups. The **cost grows multiplicatively** with both branching factor and depth.

### Recursive CTEs: The SQL Workaround

SQL:1999 introduced **recursive CTEs** (`WITH RECURSIVE`) to express variable-depth traversal without repeating self-joins:

```sql
WITH RECURSIVE reachable(user_id, depth) AS (
  -- anchor: start at user 42
  SELECT to_user, 1
  FROM   connections
  WHERE  from_user = 42

  UNION ALL

  -- recursive step: follow one more edge
  SELECT c.to_user, r.depth + 1
  FROM   reachable r
  JOIN   connections c ON c.from_user = r.user_id
  WHERE  r.depth < 3        -- max 3 hops
)
SELECT DISTINCT user_id FROM reachable
WHERE  user_id <> 42;
```

This is better — you don't hard-code the number of joins — but the engine still performs a **B-tree lookup per edge** in the recursive step. The intermediate table grows with every iteration, and each lookup carries the O(log N) cost of navigating the index.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · 2-hop friend-of-friend with recursive CTE</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE users (user_id INTEGER PRIMARY KEY, name TEXT); INSERT INTO users VALUES (1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave'),(5,'Eve'),(6,'Frank'),(7,'Grace'),(8,'Hank'),(9,'Ivy'),(10,'Jack'); CREATE TABLE connections (from_user INTEGER, to_user INTEGER); INSERT INTO connections VALUES (1,2),(1,3),(1,4),(2,5),(2,6),(3,7),(3,8),(4,9),(4,10),(5,6),(6,7),(7,8),(8,9),(9,10);">-- Find everyone reachable from Alice (user 1) within 2 hops
-- Change the WHERE clause depth limit to 3 to see the explosion

WITH RECURSIVE reachable(user_id, depth) AS (
  SELECT to_user, 1
  FROM   connections
  WHERE  from_user = 1

  UNION ALL

  SELECT c.to_user, r.depth + 1
  FROM   reachable r
  JOIN   connections c ON c.from_user = r.user_id
  WHERE  r.depth &lt; 2
)
SELECT u.name, MIN(r.depth) AS hops
FROM   reachable r
JOIN   users u ON u.user_id = r.user_id
WHERE  r.user_id &lt;&gt; 1
GROUP  BY u.user_id, u.name
ORDER  BY hops, u.name;</textarea>
  </div>
</div>

## Why Graph DBs Are Different: Index-Free Adjacency

A native graph database stores each node with **direct physical pointers to its neighbouring nodes**. There is no index to traverse — the pointer *is* the edge.

| Operation | Relational DB | Graph DB |
|-----------|--------------|---------|
| Find node | O(log N) B-tree lookup | O(1) pointer follow |
| Follow 1 edge | O(log N) index join | O(1) pointer dereference |
| Follow k edges | O(k × log N × branch_factor) | O(k × branch_factor) — linear in edges visited |
| 3-hop traversal on 1 M nodes | ~millions of comparisons | ~125 pointer follows (above example) |

> **Index-free adjacency** is the term Neo4j uses for this design. Each node record in the storage file contains the address of its first relationship. Each relationship record contains the IDs of both endpoints *and* the addresses of the next relationships for each endpoint. Traversing is literally following linked-list pointers — no global index involved.

The consequence: **traversal time is proportional to the subgraph visited, not to the total graph size**. Finding 3-hop neighbours of one person takes the same time whether the graph has 1 000 or 1 000 000 000 nodes — as long as the local neighbourhood is the same size.

## When Should You Switch?

The crossover point is roughly:

- **Depth ≤ 2, low cardinality:** SQL with a good index is fine. A two-table join on indexed foreign keys is fast and familiar.
- **Depth 2–3, moderate cardinality (thousands of rows in intermediate result):** Recursive CTE works but starts to hurt on large graphs. Consider a graph DB if queries are frequent.
- **Depth > 3 or variable depth (shortest path, reachability):** Relational cost explodes. Graph DB is the natural tool.
- **Many-to-many at any depth, plus frequent schema changes on relationship types:** Graph DB wins on both performance and modelling flexibility.

A common real-world trigger: fraud detection graphs, recommendation engines, access-control hierarchies, knowledge graphs, and route planning — all require traversal beyond 2 hops regularly.

### What Graph Query Languages Gain

Cypher (Neo4j) expresses the same 3-hop query concisely:

```cypher
MATCH (you:Person {id: 42})-[:KNOWS*1..3]-(others)
WHERE others <> you
RETURN DISTINCT others.name
```

The `*1..3` syntax means "follow KNOWS edges between 1 and 3 times." The engine walks pointers rather than joining index pages. The planner never materialises intermediate result sets in the same way — it streams node IDs along paths.

## Key Takeaways

- **Each additional SQL join multiplies the intermediate row count** by the branching factor — cost is superlinear in depth.
- **Recursive CTEs** solve variable-depth queries syntactically, but the engine still pays O(log N) per edge at runtime.
- **Index-free adjacency** in graph databases replaces every join with a pointer follow — O(1) per hop regardless of graph size.
- **Traversal cost** in a graph DB scales with the number of edges visited, not with total data size.
- The practical switch point is **depth > 2–3** or **highly connected many-to-many relationships** that change frequently.
