Technical knowledge about B-trees, LSM-trees, and two-phase locking is necessary but not sufficient for doing database engineering well. The engineers who design great systems share a set of habits and ways of thinking that are harder to teach from first principles but recognizable in practice. This page describes the mindset — the mental posture that separates practitioners who use databases from those who understand them.

## Think in Workloads, Not Features

The most important habit is **workload-first thinking**. Every database design decision is a trade-off, and trade-offs only make sense relative to a specific workload. An LSM-tree is not "better" than a B-tree — it is better for write-heavy workloads with compressible values. A hash index is not "worse" than a B-tree — it is better for point lookups and worse for range scans.

When you encounter any database technology, the first question is always: **what workload was this designed for?** The second question is: **does my workload match?** If the answer to the second question is no, the technology's benchmark numbers are irrelevant to you.

This also means resisting the pressure to adopt a tool because it is popular or new. Hype cycles in databases are real. Column-family stores, document databases, graph databases, time-series databases, and now vector databases each had (or are having) a moment where they were presented as general-purpose replacements for relational databases. In almost every case, the right answer was: "for the workload it was designed for, it is excellent; for general use, a relational database is usually better."

## Measure Before Optimizing

The second foundational habit is **never assume the bottleneck**. Database performance problems are reliably counterintuitive. The slow query is usually not the most complex one. The index that seems most useful often isn't used. The bottleneck that appears to be CPU is often I/O waiting dressed up as CPU utilization.

Before optimizing anything, measure:

1. **Which query is actually slow?** Use `pg_stat_statements`, slow query logs, or distributed tracing.
2. **Why is it slow?** Use `EXPLAIN ANALYZE`, not just `EXPLAIN`. Look at actual rows vs. estimated rows — a large gap indicates stale statistics.
3. **Where is the time going?** I/O wait vs. CPU vs. lock wait. These require different solutions.
4. **What happens at scale?** A query that takes 1 ms with 10,000 rows may take 100 ms with 10,000,000. Measure with production-representative data volumes.

The optimization you decide on after measurement is almost always different from what you would have guessed beforehand.

<figure class="diagram">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mindset feedback loop: observe the workload, measure the actual bottleneck, understand the trade-offs, make the targeted change, and measure again">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- Circle of steps -->
  <!-- Observe -->
  <rect x="240" y="10" width="160" height="48" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="320" y="34" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">1. Observe the workload</text>
  <text x="320" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">What queries? What data size?</text>
  <!-- Arrow down-right -->
  <line x1="400" y1="34" x2="490" y2="80" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Measure -->
  <rect x="470" y="80" width="155" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="548" y="104" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">2. Measure</text>
  <text x="548" y="120" text-anchor="middle" font-size="10" fill="var(--muted)">EXPLAIN ANALYZE, profiles</text>
  <!-- Arrow down-left -->
  <line x1="490" y1="130" x2="400" y2="175" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Change -->
  <rect x="240" y="162" width="160" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="186" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">3. Make targeted change</text>
  <text x="320" y="202" text-anchor="middle" font-size="10" fill="var(--muted)">Index? Rewrite? Schema?</text>
  <!-- Arrow up-left -->
  <line x1="240" y1="186" x2="150" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Understand trade-offs -->
  <rect x="15" y="80" width="155" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="92" y="104" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">4. Understand trade-off</text>
  <text x="92" y="120" text-anchor="middle" font-size="10" fill="var(--muted)">What does this cost?</text>
  <!-- Arrow back to observe -->
  <line x1="150" y1="80" x2="240" y2="34" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
</svg>
<figcaption>The engineering mindset as a feedback loop: observe, measure, understand the trade-off, make a targeted change, and repeat.</figcaption>
</figure>

## Understand the Trade-Offs, Not Just the Features

Every database feature has a cost. Indexing speeds up reads and slows down writes. MVCC enables concurrent reads without blocking writes but requires garbage collection. Replication increases durability and read throughput but adds write latency and complexity. Partitioning enables horizontal scale but complicates cross-partition queries.

A practitioner's habit is to **complete the sentence**: "This feature speeds up X at the cost of Y." If you can't complete the sentence for a feature you're using, you don't fully understand it yet.

This also means being suspicious of claims that something is "free." Write-ahead logging is sometimes presented as having no throughput cost — but WAL writes consume disk bandwidth and introduce fsync latency. Compression is sometimes presented as obviously good — but CPU cost increases and write amplification changes. There is always a trade-off; sometimes it is worth it, but it is never zero.

## Respect Operational Complexity

Systems that are brilliant in design are often painful in production. A distributed database with strong consistency guarantees requires understanding network partitions, leader elections, and split-brain scenarios. A system with aggressive compaction uses more I/O than a simpler design. A database with many configuration knobs requires expertise to tune.

**Operational complexity is a real cost.** The best database for a given workload is not always the most technically sophisticated one — it is the one that solves the problem with the minimum complexity your team can sustain. SQLite has won many production deployments precisely because it eliminates an entire class of operational overhead.

## Build Mental Models, Not Checklists

A checklist of "when to use an index" is fragile — it breaks the moment you encounter a situation the list didn't anticipate. A mental model of how an index works (it costs a random I/O per row for low-selectivity queries, but high-selectivity queries amortize that cost) lets you reason about new situations you've never seen.

This course aimed to give you mental models, not checklists. The reward for mental models is that they compound: understanding how an LSM-tree manages compaction helps you reason about both write amplification *and* space amplification *and* read latency, in combinations you haven't seen before.

## Calibrate Your Humility

Finally: **databases are hard, and they accumulate surprises**. Engineers who work on them for decades still encounter unexpected behavior from subtle interactions between MVCC, vacuum, autovacuum, toast tables, partial indexes, and query planning decisions. This is not a reason to be intimidated — it is a reason to stay curious and resist the temptation to think you understand a system fully.

The best database engineers share a specific kind of humility: they have strong opinions (because they have built mental models) and they hold those opinions loosely (because they have been surprised enough times to know that reality is more complex than any model).

## Key Takeaways

- Think in workloads first: every trade-off is workload-relative.
- Measure before optimizing: the bottleneck is almost never what you expect.
- Complete the sentence: "This feature speeds up X at the cost of Y."
- Operational complexity is a real cost; the simplest system that works is usually the right system.
- Build mental models, not checklists — models generalize; checklists don't.
- Stay curious and calibrate humility: surprises in database behavior are a feature of the domain, not a sign you missed something.
