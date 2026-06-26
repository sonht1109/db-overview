Every storage structure makes trade-offs. B-trees are fast for point reads but impose overhead on writes; LSM-trees (Log-Structured Merge-trees) absorb writes cheaply but do extra work at read time. The two metrics that capture these trade-offs with precision are **read amplification** and **write amplification** — ratios that measure how much extra I/O the engine does compared to what the application logically requested.

## The Two Amplification Factors

**Read amplification (RA)** is the number of disk pages (or I/O operations) the engine reads to satisfy a single logical read.

**Write amplification (WA)** is the number of bytes (or I/O operations) actually written to disk for every one byte the application asked to write.

A ratio of 1 is the theoretical minimum. Real systems always exceed it.

| Structure | Read amplification | Write amplification |
|---|---|---|
| Heap file (no index) | High — full table scan possible | Low — append only |
| B-tree (with index) | Low — O(log N) pages | Moderate — splits and WAL |
| LSM-tree | Moderate — multi-level merge | Low at ingestion, high during compaction |
| Sorted file (static) | Very low — binary search | Very high — full rewrite on change |

Neither amplification can be driven to 1 simultaneously. This is a hard limit sometimes called the **read-write-space amplification trilemma**: optimise any two and the third gets worse.

## Read Amplification in Practice

Consider a B-tree index on a table with one million rows. To fetch one row by primary key, the engine traverses from the root down to a leaf — say, 3–4 levels — then reads the actual heap page. That is 4–5 I/Os for a single logical row. If the row is not in the buffer pool, each level is a separate disk read.

An LSM-tree can be worse: because data lives in multiple immutable sorted files (called SSTables or segments) across several levels, a point read may have to check every level before finding the key. Bloom filters reduce this in practice, but the worst case is proportional to the number of levels.

Sequential scans flip the picture. A heap file scanned top-to-bottom has near-zero read amplification — every byte read is a byte the query needs. An index-driven random scan of many rows, on the other hand, can trigger one random I/O per row, making amplification extremely high.

> **Note:** Read amplification is why databases add covering indexes. A covering index stores all the columns a query needs right in the index leaf, eliminating the extra heap page fetch entirely (no "table lookup" step).

## Write Amplification in Practice

When you `INSERT` a row, the database does more than write those bytes once:

1. Write the row to the WAL (write-ahead log) — so it can be replayed on crash.
2. Modify the B-tree index page in the buffer pool — possibly triggering a page split that rewrites two or more pages.
3. Eventually flush dirty pages from the buffer pool to the data file.
4. Periodically checkpoint, rewriting WAL records to the main file.

Each step multiplies the original write. On write-heavy OLTP with many indexes, total WA of 5–10× is common. On NVMe SSDs, WA is a critical concern because every SSD cell has a finite write endurance — high WA wears out the drive faster and reduces throughput.

LSM-trees trade high read amplification for low write amplification at ingestion time. Writes go into a sorted in-memory buffer (the memtable). When it fills, it flushes as a new immutable file. The catch: background **compaction** merges and rewrites those files repeatedly, so the long-run write amplification of an LSM-tree is not zero — it is simply deferred and made sequential, which is friendlier to SSDs.

## Measuring Amplification with a Model

The query below models a simplified B-tree read path. It shows how many page reads are needed to find one row as the table grows, based on the tree height formula `ceil(log_b(N))` where `b` is the branching factor and `N` is the number of rows.

Run it as-is, then try changing `branching_factor` and `rows` to see how height — and therefore read amplification — changes.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · B-tree read amplification model</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE btree_params (
  label           TEXT,
  rows            INTEGER,
  branching_factor INTEGER
);
INSERT INTO btree_params VALUES
  ('Small table',    10000,   100),
  ('Medium table',   1000000, 100),
  ('Large table',    100000000, 100),
  ('Low branching',  1000000,  10),
  ('High branching', 1000000, 500);">-- Pages read per point lookup = tree height + 1 heap page fetch
SELECT
  label,
  rows,
  branching_factor,
  CAST(CEIL(LOG(CAST(rows AS REAL)) / LOG(CAST(branching_factor AS REAL))) AS INTEGER) AS tree_height,
  CAST(CEIL(LOG(CAST(rows AS REAL)) / LOG(CAST(branching_factor AS REAL))) AS INTEGER) + 1 AS read_amplification
FROM btree_params
ORDER BY rows, branching_factor;
</textarea>
  </div>
</div>

Notice that doubling the row count barely moves the amplification number — logarithmic growth is very flat. This is why B-trees remain practical even at hundreds of millions of rows.

> **Note:** Real read amplification is lower when pages are already in the buffer pool. The numbers above are worst-case (cold cache). A warm cache turns many of those I/Os into cheap RAM reads, effectively reducing amplification to 1 for hot data.

Understanding amplification helps you reason about index design, storage engine choice, and hardware sizing. The right trade-off depends on whether your workload is read-heavy (minimise RA), write-heavy (minimise WA), or space-constrained (minimise space amplification — a third factor worth exploring on its own).
