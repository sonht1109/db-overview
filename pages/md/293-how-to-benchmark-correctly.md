Benchmarking is one of the most frequently misunderstood activities in database engineering. It looks simple — run a workload, measure throughput, compare numbers — but nearly every benchmark published on a blog or in a vendor white paper contains at least one methodological flaw that invalidates the conclusion. This page explains how to design and execute a benchmark that actually tells you something true.

## Why Most Benchmarks Lie

The failure modes are consistent:

- **Wrong workload** — a read-heavy benchmark favors systems with large caches; a write-heavy benchmark favors LSM-trees. If your production workload is mixed, neither tells you the truth.
- **No warm-up** — the first minutes of a run show cold-start latency, not steady-state performance. Results from the first 30 seconds are almost always misleading.
- **Comparing apples to oranges** — measuring a fully-durable system (sync writes, `fsync` on commit) against a system with durability off (`innodb_flush_log_at_trx_commit=0`) is not a fair comparison.
- **Single-threaded numbers** — databases are concurrent systems. A single-connection benchmark misses contention, lock waits, and parallel query effects entirely.
- **Ignoring tail latency** — reporting average latency hides the p99 and p999 that real users experience. A system with a 5 ms average but a 2 s p99 is unusable for interactive applications.
- **Measuring the wrong thing** — measuring throughput when you care about latency, or vice versa.

## The Benchmark Design Checklist

Before running a single query, answer these questions:

| Question | Why it matters |
|---|---|
| What is my production workload? | Everything else follows from this |
| What hardware will I use? | Results don't transfer across hardware generations |
| Are all systems configured equivalently? | Same durability guarantees, same memory, same parallelism |
| What is my warm-up period? | Buffer pools and page caches need to fill |
| Will I measure throughput, latency, or both? | They require different measurement approaches |
| How many runs? | Single-run variance can be 10–30%; run at least 3–5 |
| What are the percentiles I care about? | p50, p95, p99, p999 |

## Configuring for Equivalence

The most common source of invalid comparisons is **mismatched durability settings**. Always check:

- **PostgreSQL:** `synchronous_commit`, `fsync`, `wal_sync_method`
- **MySQL/InnoDB:** `innodb_flush_log_at_trx_commit` (0/1/2), `sync_binlog`
- **SQLite:** `PRAGMA journal_mode`, `PRAGMA synchronous`
- **RocksDB:** `sync` flag on `WriteOptions`, `wal_dir`

A system running with `synchronous=OFF` will appear dramatically faster than one with `synchronous=FULL`, but they offer different crash-recovery guarantees. Compare only configurations that offer the same durability.

## Measuring Latency Correctly

Latency histograms should be collected at the **client**, not the server. Server-side timing misses network round trips and queuing delay that your application actually experiences.

Use **coordinated omission** correction (a concept from Gil Tene's work on HdrHistogram). If you send one request per second and a request takes 2 seconds, the *next* request was already overdue — a naive timer would show only the 2-second request as slow, but the next request was also effectively slow. Tools like `wrk2` and the `hdrhistogram` library handle this correctly.

<figure class="diagram">
<svg viewBox="0 0 640 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Latency percentile distribution: the gap between median and p99 and p999 grows dramatically, showing why average is misleading">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- Axes -->
  <line x1="60" y1="30" x2="60" y2="190" stroke="var(--border)" stroke-width="1.5"/>
  <line x1="60" y1="190" x2="610" y2="190" stroke="var(--border)" stroke-width="1.5"/>
  <!-- Y labels -->
  <text x="52" y="194" text-anchor="end" font-size="11" fill="var(--muted)">0</text>
  <text x="52" y="155" text-anchor="end" font-size="11" fill="var(--muted)">10ms</text>
  <text x="52" y="115" text-anchor="end" font-size="11" fill="var(--muted)">100ms</text>
  <text x="52" y="75" text-anchor="end" font-size="11" fill="var(--muted)">1s</text>
  <text x="52" y="35" text-anchor="end" font-size="11" fill="var(--muted)">10s</text>
  <!-- X labels -->
  <text x="130" y="208" text-anchor="middle" font-size="11" fill="var(--muted)">p50</text>
  <text x="250" y="208" text-anchor="middle" font-size="11" fill="var(--muted)">p90</text>
  <text x="370" y="208" text-anchor="middle" font-size="11" fill="var(--muted)">p99</text>
  <text x="490" y="208" text-anchor="middle" font-size="11" fill="var(--muted)">p99.9</text>
  <text x="590" y="208" text-anchor="middle" font-size="11" fill="var(--muted)">p99.99</text>
  <!-- Bar chart (log scale) -->
  <!-- p50: 2ms → near bottom -->
  <rect x="100" y="178" width="60" height="12" fill="var(--accent)" opacity="0.8" rx="2"/>
  <text x="130" y="173" text-anchor="middle" font-size="10" fill="var(--text)">2ms</text>
  <!-- p90: 8ms -->
  <rect x="220" y="170" width="60" height="20" fill="var(--accent)" opacity="0.8" rx="2"/>
  <text x="250" y="165" text-anchor="middle" font-size="10" fill="var(--text)">8ms</text>
  <!-- p99: 120ms -->
  <rect x="340" y="118" width="60" height="72" fill="var(--accent)" opacity="0.8" rx="2"/>
  <text x="370" y="113" text-anchor="middle" font-size="10" fill="var(--text)">120ms</text>
  <!-- p99.9: 1.1s -->
  <rect x="460" y="75" width="60" height="115" fill="var(--accent)" opacity="0.5" rx="2"/>
  <text x="490" y="70" text-anchor="middle" font-size="10" fill="var(--text)">1.1s</text>
  <!-- p99.99: 8s -->
  <rect x="560" y="34" width="40" height="156" fill="var(--accent)" opacity="0.3" rx="2"/>
  <text x="580" y="28" text-anchor="middle" font-size="10" fill="var(--text)">8s</text>
  <!-- avg line -->
  <line x1="60" y1="168" x2="610" y2="168" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="615" y="172" font-size="10" fill="var(--muted)">avg≈5ms</text>
  <text x="320" y="20" text-anchor="middle" font-size="12" fill="var(--text)">Latency percentiles (log scale) — average hides the tail</text>
</svg>
<figcaption>Tail latency grows dramatically: a system with a 5 ms average can have a 1-second p99.9. Report percentiles, not averages.</figcaption>
</figure>

## Standard Benchmark Suites

Rather than inventing your own workload, start with an established benchmark and customize it:

| Benchmark | Models | What it tests |
|---|---|---|
| **TPC-C** | Warehouse/order transactions | OLTP with conflicts, high contention |
| **TPC-H** | Analytical queries | OLAP, complex joins, aggregations |
| **YCSB** | Key-value / NoSQL workloads | Configurable read/write/scan mix |
| **Sysbench** | MySQL/PostgreSQL OLTP | Point reads, inserts, indexed ranges |
| **pgbench** | PostgreSQL built-in | TPC-B-like; easy to customize |
| **HammerDB** | Multi-database | TPC-C and TPC-H across engines |

> **Note:** Standard benchmarks test standard workloads. If your production queries are unusual — large batch inserts, heavy JSON processing, complex window functions — you must supplement with custom queries that reflect what you actually run.

## Interactive Exercise

The following widget simulates benchmark bookkeeping: storing raw latency samples and computing percentiles. This is the kind of result table you should produce from any benchmark run.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Benchmark Analysis</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE latency_samples (run_id INTEGER, latency_ms REAL); INSERT INTO latency_samples VALUES (1,1.2),(1,1.5),(1,1.8),(1,2.1),(1,2.3),(1,2.5),(1,2.8),(1,3.1),(1,3.5),(1,4.2),(1,5.1),(1,6.3),(1,8.1),(1,12.4),(1,45.2),(1,120.0),(1,1100.0),(1,8000.0); INSERT INTO latency_samples VALUES (2,0.9),(2,1.1),(2,1.3),(2,1.6),(2,1.9),(2,2.2),(2,2.6),(2,3.0),(2,3.8),(2,4.5),(2,5.8),(2,7.2),(2,9.9),(2,15.1),(2,38.0),(2,95.0),(2,820.0),(2,5500.0);">-- Compute summary statistics per run
-- (SQLite lacks a built-in percentile function; we approximate with ORDER BY + LIMIT)
SELECT
  run_id,
  COUNT(*) AS samples,
  ROUND(AVG(latency_ms), 2) AS avg_ms,
  ROUND(MIN(latency_ms), 2) AS min_ms,
  ROUND(MAX(latency_ms), 2) AS max_ms
FROM latency_samples
GROUP BY run_id;

-- Note: to get p99 properly, sort and pick the 99th percentile row.
-- Try: SELECT latency_ms FROM latency_samples WHERE run_id=1 ORDER BY latency_ms LIMIT 1 OFFSET 17;</textarea>
  </div>
</div>

## Reporting Results

A benchmark report should include:

1. **Hardware spec** — CPU model, RAM, storage type (NVMe / SSD / HDD), network
2. **Software versions** — exact version strings, not just "PostgreSQL 16"
3. **Configuration diff** — every non-default setting
4. **Workload description** — read/write ratio, data size, concurrency, key distribution
5. **Warm-up period** — how long before you started recording
6. **Number of runs** — and whether you report min, max, or median across runs
7. **Percentile table** — p50, p95, p99, p999, max for latency
8. **Throughput over time** — a time series showing stability (or the lack of it)

Results that omit any of these should be treated as incomplete.

## Key Takeaways

- Most published benchmarks are invalid — mismatched durability, no warm-up, single-threaded, or wrong workload.
- Always match durability settings when comparing systems.
- Measure latency percentiles (p99, p999), not averages.
- Use established benchmark suites as a starting point, then add workload-specific queries.
- Report hardware, software versions, configuration, and number of runs alongside every result.
