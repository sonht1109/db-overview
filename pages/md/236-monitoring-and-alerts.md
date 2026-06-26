You cannot fix what you cannot see. **Database monitoring** is the continuous measurement of database health, performance, and resource usage — and **alerting** is the automated escalation when those measurements breach defined thresholds. Together they close the gap between a problem forming and a human taking action. This page covers what to measure, how to structure alerts, and the common pitfalls that cause monitoring to fail when you need it most.

## The Four Golden Signals (Applied to Databases)

Google's Site Reliability Engineering book defines four signals that, together, describe the health of almost any service. Applied to databases:

| Signal | Database meaning | Example metric |
|---|---|---|
| **Latency** | How long queries take | p50/p95/p99 query duration |
| **Traffic** | How much work the database is doing | Queries per second (QPS), transactions/sec |
| **Errors** | Failed queries, rejected connections | Connection errors, deadlock rate, replication errors |
| **Saturation** | How close to limits the database is | CPU%, memory%, connections used / max, disk I/O wait |

Monitoring fewer than these four leaves blind spots. Monitoring only one (e.g., just CPU) gives false confidence — a database can be dying from connection exhaustion while CPU is idle.

## What to Measure

### Query Performance

```sql
-- PostgreSQL: long-running queries (adapt to your threshold)
SELECT pid, now() - pg_stat_activity.query_start AS duration,
       state, left(query, 80) AS query_snippet
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '30 seconds'
ORDER BY duration DESC;
```

Key query metrics to track:
- **p99 query latency** — 99th percentile; reveals tail latency invisible in averages
- **Slow query rate** — queries exceeding a threshold (e.g., 1 second)
- **Cache hit ratio** — `shared_blks_hit / (shared_blks_hit + shared_blks_read)` in PostgreSQL; below 95% indicates insufficient `shared_buffers`

### Connection Pool

```
Connections used / max_connections: alert at 80%
Connection wait time: alert if any connection waits > 500ms
Idle connections: high idle count wastes server memory
```

Exhausted connections are among the most common database outage triggers. Applications that open connections on every request without pooling regularly hit the limit under modest traffic.

### Replication Health

- **Replica lag** — bytes or seconds behind primary; alert if lag > 30 seconds (or whatever your RPO demands)
- **Replication slot bloat** — unused logical replication slots hold back WAL and can fill the disk
- **Replica count** — alert if fewer than expected replicas are connected

### Disk

- **Disk usage %** — alert at 75%, page at 90%
- **WAL directory size** — unchecked WAL archiving failures can fill the disk
- **IOPS utilisation** — sustained 100% IOPS saturates the disk queue

<figure class="diagram">
<svg viewBox="0 0 680 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monitoring stack: database exports metrics to exporter, Prometheus scrapes, Grafana visualises, Alertmanager fires alerts to PagerDuty and Slack">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Database -->
  <rect x="20" y="100" width="110" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="75" y="126" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">Database</text>
  <text x="75" y="145" text-anchor="middle" font-size="10" fill="var(--muted)">pg_stat_* views</text>

  <!-- Exporter -->
  <rect x="175" y="100" width="110" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="230" y="126" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">Exporter</text>
  <text x="230" y="145" text-anchor="middle" font-size="10" fill="var(--muted)">postgres_exporter</text>

  <!-- Prometheus -->
  <rect x="330" y="100" width="110" height="60" rx="6" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="385" y="126" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">Prometheus</text>
  <text x="385" y="145" text-anchor="middle" font-size="10" fill="var(--muted)">scrapes + stores</text>

  <!-- Grafana -->
  <rect x="175" y="200" width="110" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="230" y="222" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Grafana</text>
  <text x="230" y="238" text-anchor="middle" font-size="10" fill="var(--muted)">dashboards</text>

  <!-- Alertmanager -->
  <rect x="490" y="100" width="120" height="60" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="550" y="122" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">Alert</text>
  <text x="550" y="138" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">Manager</text>
  <text x="550" y="153" text-anchor="middle" font-size="10" fill="var(--muted)">routes + dedupes</text>

  <!-- PagerDuty / Slack -->
  <rect x="490" y="195" width="55" height="40" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="517" y="212" text-anchor="middle" font-size="10" fill="var(--text)">Pager</text>
  <text x="517" y="226" text-anchor="middle" font-size="10" fill="var(--text)">Duty</text>
  <rect x="555" y="195" width="55" height="40" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1"/>
  <text x="582" y="212" text-anchor="middle" font-size="10" fill="var(--text)">Slack</text>
  <text x="582" y="226" text-anchor="middle" font-size="10" fill="var(--text)">/ Teams</text>

  <!-- Arrows -->
  <line x1="130" y1="130" x2="173" y2="130" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="285" y1="130" x2="328" y2="130" stroke="var(--border)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="440" y1="130" x2="488" y2="130" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="385" y1="160" x2="300" y2="198" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arr)"/>
  <line x1="530" y1="160" x2="517" y2="193" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="570" y1="160" x2="577" y2="193" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
</svg>
<figcaption>A typical monitoring stack: postgres_exporter exposes metrics, Prometheus scrapes and evaluates alert rules, Grafana visualises dashboards, and Alertmanager routes notifications to on-call channels.</figcaption>
</figure>

## Structuring Alerts

The most common monitoring failure is **alert fatigue**: too many alerts that fire too often, training on-call engineers to ignore them. Good alerts are rare, actionable, and urgent.

### Alert Severity Levels

| Level | Meaning | Response |
|---|---|---|
| **Critical / Page** | Revenue-impacting or data-loss risk right now | Wake someone up immediately |
| **Warning / Ticket** | Trend heading toward a problem | Fix within business hours |
| **Info / Log** | Interesting event, no action needed | Review in daily standup |

Only page for **critical** alerts. Paging for warnings trains on-call engineers to silence alerts without reading them.

### Alert Design Rules

1. **Alert on symptoms, not causes** — "p99 latency > 2s" affects users; "CPU > 80%" may not. Prefer user-visible outcomes.
2. **Include a runbook link** — every alert should link directly to the procedure for handling it
3. **Set a `for` duration** — do not alert on a single data point; alert only if the condition persists for 5 minutes
4. **Deduplicate and group** — if 10 replicas all lag at once, send one grouped alert, not 10 individual ones

### Example Prometheus Alert Rules

```yaml
groups:
- name: database
  rules:
  - alert: DatabaseHighConnectionUsage
    expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Connection pool near capacity ({{ $value | humanizePercentage }})"
      runbook: "https://wiki.internal/runbooks/db-connections"

  - alert: ReplicaLagHigh
    expr: pg_replication_lag_seconds > 30
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Replica {{ $labels.instance }} is {{ $value }}s behind primary"
```

## Interactive: Alert Threshold Simulation

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Alert Evaluation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE db_metrics (ts TEXT, metric TEXT, value REAL, instance TEXT); INSERT INTO db_metrics VALUES ('2024-06-24 14:00','connections_pct',62.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:05','connections_pct',71.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:10','connections_pct',83.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:15','connections_pct',91.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:00','replica_lag_sec',0.8,'replica-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:05','replica_lag_sec',5.2,'replica-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:10','replica_lag_sec',38.1,'replica-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:15','replica_lag_sec',62.4,'replica-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:00','p99_latency_ms',18.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:05','p99_latency_ms',240.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:10','p99_latency_ms',1800.0,'db-1'); INSERT INTO db_metrics VALUES ('2024-06-24 14:15','p99_latency_ms',3200.0,'db-1');">-- Evaluate which metrics are in alert state
SELECT ts, instance, metric, ROUND(value, 1) AS value,
  CASE
    WHEN metric = 'connections_pct' AND value &gt; 90 THEN 'CRITICAL'
    WHEN metric = 'connections_pct' AND value &gt; 80 THEN 'WARNING'
    WHEN metric = 'replica_lag_sec' AND value &gt; 30 THEN 'CRITICAL'
    WHEN metric = 'p99_latency_ms'  AND value &gt; 2000 THEN 'CRITICAL'
    WHEN metric = 'p99_latency_ms'  AND value &gt; 500  THEN 'WARNING'
    ELSE 'OK'
  END AS alert_state
FROM db_metrics
ORDER BY ts, metric;</textarea>
  </div>
</div>

## Key Takeaways

- Monitor the four golden signals: latency, traffic, errors, saturation — all four, not just CPU
- Page only for critical, user-visible problems; route warnings to tickets to prevent alert fatigue
- Every alert needs a runbook link, a `for` duration, and a clear description of the symptom
- Track replica lag actively — a drifting replica is often the first sign of a coming incident
- Use a proven stack (postgres_exporter → Prometheus → Grafana → Alertmanager) to get started quickly
