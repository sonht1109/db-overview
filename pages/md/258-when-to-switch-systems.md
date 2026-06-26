No database lasts forever in the same role. Workloads grow, product requirements shift, team capabilities change, and a system that was the right choice at ten thousand users may be the wrong choice at ten million. Knowing when to switch — and, equally, when the pain is not yet severe enough to justify the disruption — is a skill that saves teams from both premature migrations and from staying far too long with a system that is actively harming them.

## The Cost of Switching Is Always Real

Before exploring the signals that indicate a switch is warranted, it's worth stating clearly: **database migrations are expensive**. A migration that sounds straightforward at the planning stage routinely reveals data quality issues, undetected schema inconsistencies, query patterns that don't translate cleanly, and cutover complexity that requires weeks of parallel operation. Teams that treat migration as a background task or a quick weekend project consistently underestimate the investment.

This is not an argument against switching — it's an argument for having a high bar. The pain of staying must be concretely worse than the pain of migrating.

## Signals That Warrant a Switch

### 1. Performance Has Hit a Structural Ceiling

The most unambiguous signal: you have exhausted the reasonable tuning options (indexes, query optimisation, hardware scaling, read replicas) and the system still cannot meet your latency or throughput requirements. This is a structural ceiling — the database's architecture simply cannot serve your workload efficiently.

Examples of structural ceilings:
- A relational database serving pure time-series writes at >50K events/second — the row-per-event model and B-tree index overhead make this painful regardless of hardware.
- A key-value store being asked to serve range queries and aggregates — the hash-based structure physically cannot do this efficiently.
- A single-node system where the dataset has grown beyond the memory and disk of any single machine.

> **Caution:** Distinguish structural ceilings from tuning problems. Many "the database is too slow" complaints are actually missing indexes, N+1 query patterns, or connection pool misconfiguration — problems that take days to fix, not months to migrate away from.

### 2. The Query Model Has Fundamentally Changed

A product that started as a simple CRUD application may evolve to need full-text search, graph traversal, or analytical aggregations across billions of rows. If these new query types are fundamental to the product — not edge cases — and the current database cannot serve them well, a switch (or an addition) is warranted.

The key question: is the new query type a core user-facing feature or an operational report? Core features justify architectural investment; operational reports often tolerate slower queries.

### 3. Operational Cost Has Become Unsustainable

If maintaining the database is consuming a disproportionate share of engineering time — incident response, complex upgrades, scaling gymnastics, workarounds for fundamental limitations — that operational burden has a measurable opportunity cost. The team is not building product features; they are fighting infrastructure.

This signal is often slow to appear. The cost accumulates gradually: one more workaround, one more migration script, one more three-day incident. The moment it becomes obvious often comes only when someone steps back and measures the cumulative hours.

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for when to switch databases">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>
  <!-- Start -->
  <rect x="240" y="10" width="160" height="38" rx="8" fill="var(--accent)" opacity="0.2" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="320" y="34" text-anchor="middle" font-size="12" fill="var(--text)">Performance / ops pain?</text>
  <!-- Arrow down -->
  <line x1="320" y1="50" x2="320" y2="80" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Tuning box -->
  <rect x="220" y="82" width="200" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="105" text-anchor="middle" font-size="12" fill="var(--text)">Exhaust tuning options</text>
  <!-- Branches -->
  <line x1="320" y1="120" x2="320" y2="150" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr2)"/>
  <text x="220" y="148" text-anchor="end" font-size="11" fill="var(--muted)">Pain resolved?</text>
  <!-- Yes branch -->
  <line x1="320" y1="150" x2="160" y2="150" stroke="var(--muted)" stroke-width="1.5"/>
  <line x1="160" y1="150" x2="160" y2="220" stroke="var(--muted)" stroke-width="1.5" marker-end="url(#arr2)"/>
  <text x="160" y="214" text-anchor="middle" font-size="11" fill="var(--muted)">Yes</text>
  <rect x="80" y="222" width="160" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="160" y="245" text-anchor="middle" font-size="12" fill="var(--muted)">Stay, document solution</text>
  <!-- No branch -->
  <line x1="320" y1="150" x2="480" y2="150" stroke="var(--accent)" stroke-width="1.5"/>
  <line x1="480" y1="150" x2="480" y2="190" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="405" y="145" text-anchor="middle" font-size="11" fill="var(--accent)">No (structural)</text>
  <rect x="390" y="192" width="180" height="36" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="480" y="215" text-anchor="middle" font-size="12" fill="var(--accent)">Plan migration</text>
  <!-- Sub-steps -->
  <line x1="480" y1="230" x2="480" y2="260" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="480" y="274" text-anchor="middle" font-size="11" fill="var(--muted)">proof of concept → pilot → cutover</text>
</svg>
<figcaption>Before deciding to switch, exhaust tuning options; switch only when the pain is structural and measurable, not just frustrating.</figcaption>
</figure>

## How to Execute a Migration Safely

Once the decision to switch is made, the migration pattern that minimises risk follows a consistent sequence:

1. **Proof of concept with real data.** Before committing, validate that the target database can serve your workload at realistic scale and query patterns. Use a representative subset of production data, not synthetic benchmarks.

2. **Build the new system in parallel.** Run the new database alongside the old one. Write new data to both (dual write), with the old system as the authoritative source.

3. **Backfill historical data.** Migrate historical data to the new system in batches, with validation at each step.

4. **Shadow reads.** Route a percentage of read traffic to the new system and compare results. Surface discrepancies before they affect users.

5. **Cut over reads, then writes.** Switch reads to the new system first; keep the old system warm as a fallback. Once confident, switch writes and retire the old system's primary role.

6. **Keep the old system available for rollback.** Define a rollback point. The old system should remain operational and capable of serving traffic for a defined period (days to weeks) after cutover.

## When NOT to Switch

- **The workload fits but performance is below expectations:** Tune first. An unindexed column or a missing connection pool is not a reason to migrate.
- **The team wants to use a newer, more interesting technology:** Technical interest is legitimate but is not a workload signal.
- **A single large query is slow:** Fix the query or add an index. Do not redesign the data layer for one problematic query.
- **A vendor published a benchmark that makes your database look bad:** Vendor benchmarks use ideal conditions. Your workload is not ideal conditions.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Migration Readiness Checklist</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE migration_checklist (category TEXT, item TEXT, completed INTEGER); INSERT INTO migration_checklist VALUES ('Signal','Structural ceiling confirmed (not a tuning problem)',0); INSERT INTO migration_checklist VALUES ('Signal','Pain quantified: ops hours/month or latency impact',0); INSERT INTO migration_checklist VALUES ('Signal','Business cost of staying exceeds migration cost',0); INSERT INTO migration_checklist VALUES ('Preparation','Target DB validated with production-representative data',0); INSERT INTO migration_checklist VALUES ('Preparation','Migration timeline and rollback plan documented',0); INSERT INTO migration_checklist VALUES ('Preparation','Dual-write infrastructure in place',0); INSERT INTO migration_checklist VALUES ('Execution','Historical data backfill complete and validated',0); INSERT INTO migration_checklist VALUES ('Execution','Shadow reads running, discrepancy rate &lt; 0.01%',0); INSERT INTO migration_checklist VALUES ('Execution','Rollback window defined and old system warm',0);">-- Track migration readiness (set completed = 1 as items are done)
SELECT
  category,
  item,
  CASE completed WHEN 1 THEN 'Done' ELSE 'Pending' END AS status
FROM migration_checklist
ORDER BY category, completed DESC;

-- Count completion by category
-- SELECT category, SUM(completed) || '/' || COUNT(*) AS progress
-- FROM migration_checklist GROUP BY category;</textarea>
  </div>
</div>

## Key Takeaways

- Database migrations are expensive; the pain of staying must be worse than the pain of migrating.
- Switch when performance has hit a structural ceiling (not a tuning problem), the query model has fundamentally changed, or operational cost is unsustainable.
- Execute migrations through a proof-of-concept, parallel operation, dual writes, shadow reads, and a defined rollback window.
- Resist the urge to switch for novelty, a single slow query, or a competitor's architecture.
