Knowing *what* to learn is easy; knowing *in what order* is harder. Database engineering has deep prerequisites — understanding a query optimizer requires understanding what data structures it is optimizing over, which requires understanding storage, which requires understanding I/O. This page lays out a concrete, sequenced path that builds on those dependencies correctly, whether you are starting from zero or filling in gaps.

## Who This Is For

This path assumes you are comfortable writing code in at least one language and have a passing familiarity with SQL — you can write a `SELECT` with a `JOIN` but you don't know what happens inside the database when you do. If you are more advanced, use the stage map below to identify which stage you are at and start there.

## The Five Stages

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Five-stage learning path: Stage 1 foundations, Stage 2 internals, Stage 3 distributed systems, Stage 4 advanced topics, Stage 5 research frontier — connected in sequence with estimated time per stage">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- Stage boxes, left to right -->
  <!-- S1 -->
  <rect x="10" y="80" width="105" height="130" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="62" y="105" text-anchor="middle" font-size="11" font-weight="600" fill="var(--accent)">Stage 1</text>
  <text x="62" y="122" text-anchor="middle" font-size="10" fill="var(--text)">Foundations</text>
  <text x="62" y="142" text-anchor="middle" font-size="9" fill="var(--muted)">SQL · Indexes</text>
  <text x="62" y="158" text-anchor="middle" font-size="9" fill="var(--muted)">ACID basics</text>
  <text x="62" y="174" text-anchor="middle" font-size="9" fill="var(--muted)">Schema design</text>
  <text x="62" y="198" text-anchor="middle" font-size="9" fill="var(--muted)">1–2 months</text>
  <!-- arrow -->
  <line x1="117" y1="145" x2="133" y2="145" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- S2 -->
  <rect x="135" y="80" width="105" height="130" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="188" y="105" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">Stage 2</text>
  <text x="188" y="122" text-anchor="middle" font-size="10" fill="var(--text)">Internals</text>
  <text x="188" y="142" text-anchor="middle" font-size="9" fill="var(--muted)">B-trees · LSM</text>
  <text x="188" y="158" text-anchor="middle" font-size="9" fill="var(--muted)">Buffer pool</text>
  <text x="188" y="174" text-anchor="middle" font-size="9" fill="var(--muted)">WAL · MVCC</text>
  <text x="188" y="198" text-anchor="middle" font-size="9" fill="var(--muted)">2–4 months</text>
  <!-- arrow -->
  <line x1="242" y1="145" x2="258" y2="145" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- S3 -->
  <rect x="260" y="80" width="105" height="130" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="312" y="105" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">Stage 3</text>
  <text x="312" y="122" text-anchor="middle" font-size="10" fill="var(--text)">Distribution</text>
  <text x="312" y="142" text-anchor="middle" font-size="9" fill="var(--muted)">Replication</text>
  <text x="312" y="158" text-anchor="middle" font-size="9" fill="var(--muted)">Sharding</text>
  <text x="312" y="174" text-anchor="middle" font-size="9" fill="var(--muted)">Consensus</text>
  <text x="312" y="198" text-anchor="middle" font-size="9" fill="var(--muted)">2–4 months</text>
  <!-- arrow -->
  <line x1="367" y1="145" x2="383" y2="145" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- S4 -->
  <rect x="385" y="80" width="115" height="130" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="442" y="105" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">Stage 4</text>
  <text x="442" y="122" text-anchor="middle" font-size="10" fill="var(--text)">Advanced</text>
  <text x="442" y="142" text-anchor="middle" font-size="9" fill="var(--muted)">Query optimizer</text>
  <text x="442" y="158" text-anchor="middle" font-size="9" fill="var(--muted)">Columnar / HTAP</text>
  <text x="442" y="174" text-anchor="middle" font-size="9" fill="var(--muted)">Benchmarking</text>
  <text x="442" y="198" text-anchor="middle" font-size="9" fill="var(--muted)">3–6 months</text>
  <!-- arrow -->
  <line x1="502" y1="145" x2="518" y2="145" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- S5 -->
  <rect x="520" y="80" width="108" height="130" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="574" y="105" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">Stage 5</text>
  <text x="574" y="122" text-anchor="middle" font-size="10" fill="var(--text)">Research</text>
  <text x="574" y="142" text-anchor="middle" font-size="9" fill="var(--muted)">Papers · Code</text>
  <text x="574" y="158" text-anchor="middle" font-size="9" fill="var(--muted)">Contribute</text>
  <text x="574" y="174" text-anchor="middle" font-size="9" fill="var(--muted)">Specialize</text>
  <text x="574" y="198" text-anchor="middle" font-size="9" fill="var(--muted)">Ongoing</text>
</svg>
<figcaption>Five stages from SQL foundations through research-level engagement — each builds on the prerequisites of the previous stage.</figcaption>
</figure>

---

### Stage 1 — Foundations (1–2 months)

**Goal:** Write correct, efficient SQL and understand what ACID means at a practical level.

| Activity | Resource |
|---|---|
| Master SQL | Mode Analytics SQL tutorial; SQLZoo; LeetCode DB problems |
| Understand indexes | "Use the Index, Luke" — `use-the-index-luke.com` (free, excellent) |
| Schema design | "Database Design for Mere Mortals" — Hernandez |
| ACID in practice | PostgreSQL docs: "Transactions" and "Concurrency Control" chapters |
| Build something | A personal project with PostgreSQL or SQLite |

**Checkpoint:** You can write complex queries with window functions, explain what each isolation level prevents, and design a normalized schema for a given domain.

---

### Stage 2 — Internals (2–4 months)

**Goal:** Understand what happens inside the database when you run a query.

| Activity | Resource |
|---|---|
| Storage engines | This course (Parts I–III) |
| Build a B-tree | Implement insert, lookup, split from scratch |
| Build a WAL | Append-only log with crash recovery |
| Read SQLite source | `btree.c`, `wal.c`, `vdbe.c` |
| Read the ARIES paper | Mohan et al. (1992) — the WAL algorithm used by most RDBMS |

**Checkpoint:** You can describe the B-tree split algorithm, explain what makes WAL crash-safe, and trace a PostgreSQL INSERT from executor to WAL.

---

### Stage 3 — Distribution (2–4 months)

**Goal:** Understand replication, partitioning, and distributed transactions.

| Activity | Resource |
|---|---|
| Replication | "Designing Data-Intensive Applications" — Kleppmann, Chapters 5–9 |
| Consensus | Read the Raft paper; implement leader election |
| Distributed transactions | Kleppmann Chapters 8–9; Spanner paper |
| Study TiKV or etcd | Follow the write path through the Raft log |
| Build TinyKV | PingCAP Talent Plan project |

**Checkpoint:** You can explain the difference between sync and async replication, describe what a network partition does to a replicated system, and explain how Raft achieves consensus.

---

### Stage 4 — Advanced Topics (3–6 months)

**Goal:** Deep expertise in one area; broad awareness of the others.

| Activity | Resource |
|---|---|
| Query optimization | CMU 15-721 lectures 5–8 (free on YouTube) |
| Columnar and OLAP | DuckDB paper; read DuckDB execution engine source |
| Benchmarking | Run TPC-C and YCSB; read the benchmarking literature |
| Read 10 papers | Use the paper list from page 291 |
| Specialize | Pick storage, query processing, or distribution |

**Checkpoint:** You can design a benchmark methodology, read a systems paper critically, and explain the trade-offs in at least one production database engine.

---

### Stage 5 — Research Frontier (Ongoing)

**Goal:** Follow active research and contribute to open-source projects.

| Activity | Resource |
|---|---|
| Follow SIGMOD / VLDB | Conference proceedings (many papers are open access) |
| Read The Morning Paper | `blog.acolyer.org` (archived) |
| Contribute to OSS | File a bug, write a test, fix a small issue in PostgreSQL or RocksDB |
| Write about what you learn | Blog posts force clarity; teaching is the best test of understanding |
| Find a specialization | Storage engines, query optimization, distributed transactions, streaming |

---

## Practical Advice for Staying on Track

**Block time, don't find time.** Database internals require sustained attention. One two-hour block per week produces better results than five scattered 20-minute sessions.

**Work through exercises, not just reading.** For every concept, implement a minimal version or run a concrete experiment. Reading about compaction is different from watching compaction happen in a running RocksDB instance.

**Use the SQL widget below to practice query analysis** — a skill that bridges Stage 1 and Stage 2. Understanding `EXPLAIN` output is the gateway to understanding internals.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Query Analysis Practice</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX idx_customer ON orders(customer_id); CREATE INDEX idx_status ON orders(status); INSERT INTO orders VALUES (1,101,99.0,'completed',1700000001); INSERT INTO orders VALUES (2,102,250.0,'pending',1700000002); INSERT INTO orders VALUES (3,101,75.0,'completed',1700000010); INSERT INTO orders VALUES (4,103,500.0,'completed',1700000020); INSERT INTO orders VALUES (5,102,30.0,'cancelled',1700000030); INSERT INTO orders VALUES (6,101,120.0,'pending',1700000040);">-- Stage 1: write the query
SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS revenue
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
ORDER BY revenue DESC;

-- Stage 2: understand the plan (SQLite EXPLAIN QUERY PLAN)
EXPLAIN QUERY PLAN
SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS revenue
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
ORDER BY revenue DESC;</textarea>
  </div>
</div>

## Key Takeaways

- Database learning has a natural sequence: foundations → internals → distribution → advanced → research. Skipping stages creates confusion.
- Build something at every stage — reading without building produces knowledge that doesn't stick.
- Allocate time in blocks, not fragments; sustained attention is required.
- Stage 2 (internals) is the hardest transition and the most valuable — it unlocks the ability to reason about all the stages that follow.
- There is no end to Stage 5; the field moves continuously. The goal is to build the habits and community connections to keep learning efficiently.
