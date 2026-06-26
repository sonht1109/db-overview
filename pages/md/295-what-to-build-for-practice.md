Reading about databases and reading their source code are both valuable — but nothing cements understanding like building something yourself. Implementation forces you to resolve every ambiguity: you can't hand-wave over "the buffer pool manages pages" when you have to actually write the eviction logic. This page describes a set of progressively more ambitious projects, from a weekend build to a multi-month effort, each designed to teach a specific cluster of concepts.

## Why Build Instead of Just Read?

When you build, you encounter the same problems the original authors encountered:

- You think page IDs are simple until you realize you need to handle overflow pages.
- You think MVCC is a clean concept until you have to decide what "visible" means for a partially-committed transaction.
- You think consensus is well-defined until you have to handle a leader that crashes mid-log-write.

These are the problems that produce real understanding. Every bug you hunt in your implementation is a concept that is now permanently clear.

## Project Ladder

### Level 1 — Weekend Projects (8–16 hours)

**1a. Key-value store over a flat file**
Build a key-value store that persists to a file using an append-only log. Support `SET`, `GET`, and `DELETE`. Add a compaction step that rewrites the log, removing overwritten keys.

Concepts taught: append-only writes, log compaction, crash recovery (what happens if you crash mid-write?), an index built in memory from the log on startup.

**1b. In-memory SQL interpreter**
Write a tiny SQL parser and evaluator for `SELECT`, `FROM`, `WHERE`, and `ORDER BY` over in-memory tables. No storage, no indexes.

Concepts taught: parsing, the relational algebra behind SQL, iterator model for query evaluation.

---

### Level 2 — One-Month Projects

**2a. B-tree on disk**
Implement a B-tree that stores key-value pairs in fixed-size pages written to a file. Support insert, point lookup, and range scan. Handle page splits.

Concepts taught: page layout, the split algorithm, pointer management, why B-trees are shallow, why fan-out matters.

**2b. Write-ahead log**
Add a WAL to your key-value store. Before writing any data page, write the operation to the log. Implement crash recovery by replaying the log on startup.

Concepts taught: redo vs. undo logging, the LSN (log sequence number), what "durable" actually means, why the log must be flushed before the page.

**2c. Simple LSM-tree**
Implement a MemTable + one level of SSTables with a compaction step. Support `Put`, `Get`, and `Scan`. Write a bloom filter to skip SSTables that cannot contain a key.

Concepts taught: write amplification vs. read amplification, bloom filter false positive rate, SSTable format, why LSM-trees are good for write-heavy workloads.

<figure class="diagram">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Project difficulty ladder from weekend (key-value log, tiny SQL) through one month (B-tree, WAL, LSM) to multi-month (MVCC, distributed KV, query optimizer)">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- Level 1 box -->
  <rect x="20" y="30" width="180" height="160" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="110" y="55" text-anchor="middle" font-size="13" font-weight="600" fill="var(--accent)">Level 1 · Weekend</text>
  <text x="110" y="78" text-anchor="middle" font-size="11" fill="var(--text)">KV store on a log</text>
  <text x="110" y="96" text-anchor="middle" font-size="11" fill="var(--text)">Tiny SQL interpreter</text>
  <text x="110" y="178" text-anchor="middle" font-size="10" fill="var(--muted)">8–16 hours</text>
  <!-- Arrow -->
  <line x1="202" y1="110" x2="238" y2="110" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- Level 2 box -->
  <rect x="240" y="30" width="160" height="160" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="55" text-anchor="middle" font-size="13" font-weight="600" fill="var(--accent)">Level 2 · Month</text>
  <text x="320" y="78" text-anchor="middle" font-size="11" fill="var(--text)">B-tree on disk</text>
  <text x="320" y="96" text-anchor="middle" font-size="11" fill="var(--text)">Write-ahead log</text>
  <text x="320" y="114" text-anchor="middle" font-size="11" fill="var(--text)">Simple LSM-tree</text>
  <text x="320" y="178" text-anchor="middle" font-size="10" fill="var(--muted)">~1 month each</text>
  <!-- Arrow -->
  <line x1="402" y1="110" x2="438" y2="110" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <!-- Level 3 box -->
  <rect x="440" y="30" width="180" height="160" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="530" y="55" text-anchor="middle" font-size="13" font-weight="600" fill="var(--accent)">Level 3 · Months</text>
  <text x="530" y="78" text-anchor="middle" font-size="11" fill="var(--text)">MVCC transaction layer</text>
  <text x="530" y="96" text-anchor="middle" font-size="11" fill="var(--text)">Distributed KV (Raft)</text>
  <text x="530" y="114" text-anchor="middle" font-size="11" fill="var(--text)">Query optimizer</text>
  <text x="530" y="178" text-anchor="middle" font-size="10" fill="var(--muted)">2–6+ months each</text>
</svg>
<figcaption>Build progressively: each level teaches a new cluster of concepts and builds on the previous one.</figcaption>
</figure>

---

### Level 3 — Multi-Month Projects

**3a. MVCC transaction layer**
Add MVCC to your B-tree or LSM-tree. Each write creates a new version with a transaction ID; reads see the snapshot at the start of their transaction. Implement garbage collection to remove old versions.

Concepts taught: version chains, snapshot isolation, the visibility function, GC overhead, why vacuum in PostgreSQL exists.

**3b. Distributed key-value store with Raft**
Build a replicated key-value store where a Raft consensus group agrees on every write. Implement leader election, log replication, and log compaction (snapshots).

Concepts taught: leader election, the Raft log, commit vs. apply, split-brain prevention, network partitions, linearizability.

**3c. Cost-based query optimizer**
Add statistics (column histograms) to your SQL interpreter and build a dynamic programming optimizer that chooses join order based on estimated cardinality.

Concepts taught: the optimizer's problem, selectivity estimation, join ordering combinatorics, why the optimizer is one of the hardest parts of a database.

## Canonical Learning Projects in the Wild

These are established implementations you can study or use as a starting point:

| Project | What it is | Link |
|---|---|---|
| **CMU 15-445 Bustub** | A teaching RDBMS you extend across the course | `github.com/cmu-db/bustub` |
| **Talent Plan TinyKV** | A Raft-based KV store built incrementally | `github.com/talent-plan/tinykv` |
| **Talent Plan TiDB** | SQL implementation exercises | `github.com/talent-plan/tidb` |
| **Mini-LSM** | A step-by-step LSM-tree tutorial in Rust | `skyzh.github.io/mini-lsm` |
| **chidb** | A teaching SQLite-like DB | `chi.cs.uchicago.edu/chidb/` |
| **go-db-hell** | Collection of small DB implementations | `github.com/eatonphil/godbms` |

> **Note:** The CMU 15-445 course (available free on YouTube) assigns Bustub as its lab project. If you follow the course alongside the labs, you build a buffer pool manager, B+ tree index, query executor, and concurrency control layer in a single semester.

## Practice Exercise: Schema Design

The widget below lets you practice an important skill: designing schemas that serve multiple query patterns efficiently. Try the queries, then modify the schema to add an index and see the query plan change.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Schema Design Exercise</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, event_type TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL); INSERT INTO events VALUES (1,101,'click','button=submit',1700000001); INSERT INTO events VALUES (2,102,'view','page=home',1700000002); INSERT INTO events VALUES (3,101,'purchase','item=42',1700000010); INSERT INTO events VALUES (4,103,'click','button=cancel',1700000020); INSERT INTO events VALUES (5,101,'view','page=checkout',1700000030); INSERT INTO events VALUES (6,102,'purchase','item=99',1700000040); CREATE INDEX idx_user_type ON events(user_id, event_type);">-- Query 1: all events for a specific user, newest first
SELECT event_type, payload, created_at
FROM events
WHERE user_id = 101
ORDER BY created_at DESC;

-- Query 2: count purchases per user
SELECT user_id, COUNT(*) AS purchase_count
FROM events
WHERE event_type = 'purchase'
GROUP BY user_id;

-- Try adding: CREATE INDEX idx_type ON events(event_type);
-- Then re-run query 2 and observe the plan with EXPLAIN QUERY PLAN</textarea>
  </div>
</div>

## Getting the Most from a Build Project

- **Write tests first.** Before implementing an operation, write a test that describes the expected behavior. This forces you to clarify edge cases before the code complicates your thinking.
- **Simulate crashes.** After every write, close the file and reopen it, verifying the data is intact. This is the only way to verify crash safety.
- **Measure before optimizing.** Instrument your implementation with counters (number of I/Os, number of comparisons) before adding any optimization. Many optimizations that seem obviously necessary turn out not to matter for your workload.
- **Compare to a reference.** SQLite is the perfect reference implementation. If your B-tree returns different results than SQLite for the same data, you have a bug.

## Key Takeaways

- Building is the highest-leverage learning activity: it forces you to resolve every ambiguity.
- Start small: a key-value log and a tiny SQL interpreter are achievable in a weekend and teach foundational concepts.
- The CMU Bustub project provides a structured, guided path through building a complete storage engine.
- Test for crash safety explicitly — it's the most commonly skipped aspect of storage engine development.
