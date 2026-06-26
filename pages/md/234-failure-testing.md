High availability architecture means nothing if it has never been tested under real failure conditions. **Failure testing** — deliberately breaking things in production or in production-like environments — is the only reliable way to verify that your redundancy, monitoring, and runbooks actually work when you need them. This page covers the philosophy, techniques, and tooling behind systematic failure testing for databases.

## Why You Must Test Failures

Every untested failover is a mystery. When a real failure strikes at 3 AM, you will face:

- Unknown failover time (is it 30 seconds or 30 minutes?)
- Unclear whether applications reconnect automatically
- Unverified replica promotion procedures
- Possibly corrupt backup files you have never actually restored

Failure testing converts each of these unknowns into a known, documented, practised process. Teams that test regularly develop **muscle memory** — the operators have done the failover before and they know what normal looks like.

## Categories of Failure

Database failures fall into several distinct categories, each requiring a different test:

| Category | Examples | What to test |
|---|---|---|
| **Node failure** | Server crash, OS panic, power loss | Automatic failover, reconnect time, data integrity |
| **Network failure** | Partition between primary and replica | Split-brain prevention, timeout behaviour |
| **Disk failure** | Full disk, I/O errors, corrupt page | Error detection, backup restore, RAID rebuild |
| **Slow resource** | CPU/IO saturation, memory pressure | Query degradation, connection pool exhaustion |
| **Logical failure** | Accidental DELETE, bad migration | PITR restore accuracy, time to recover |
| **Process failure** | Database daemon crash | Process supervision restart, crash recovery |

<figure class="diagram">
<svg viewBox="0 0 680 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Failure testing loop: inject failure, observe detection, measure recovery time, verify data integrity, document and improve">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Circle steps -->
  <!-- Step 1: Inject -->
  <circle cx="340" cy="50" r="36" fill="var(--accent)" opacity="0.2" stroke="var(--accent)" stroke-width="2"/>
  <text x="340" y="44" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">1. Inject</text>
  <text x="340" y="60" text-anchor="middle" font-size="10" fill="var(--muted)">Failure</text>

  <!-- Step 2: Observe -->
  <circle cx="570" cy="130" r="36" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="570" y="124" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">2. Observe</text>
  <text x="570" y="140" text-anchor="middle" font-size="10" fill="var(--muted)">Detection</text>

  <!-- Step 3: Measure -->
  <circle cx="460" cy="230" r="36" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="460" y="224" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">3. Measure</text>
  <text x="460" y="240" text-anchor="middle" font-size="10" fill="var(--muted)">RTO / RPO</text>

  <!-- Step 4: Verify -->
  <circle cx="220" cy="230" r="36" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="220" y="224" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">4. Verify</text>
  <text x="220" y="240" text-anchor="middle" font-size="10" fill="var(--muted)">Integrity</text>

  <!-- Step 5: Improve -->
  <circle cx="110" cy="130" r="36" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="110" y="124" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">5. Document</text>
  <text x="110" y="140" text-anchor="middle" font-size="10" fill="var(--muted)">and Improve</text>

  <!-- Arrows between steps -->
  <line x1="372" y1="72" x2="538" y2="108" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="552" y1="164" x2="492" y2="196" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="424" y1="230" x2="256" y2="230" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="188" y1="200" x2="140" y2="164" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="118" y1="94" x2="306" y2="56" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr)"/>
  <text x="200" y="68" text-anchor="middle" font-size="10" fill="var(--muted)">iterate</text>
</svg>
<figcaption>The failure-testing loop: inject a controlled fault, observe detection time, measure RTO/RPO, verify data integrity, then document findings and iterate.</figcaption>
</figure>

## Chaos Engineering

**Chaos engineering**, popularised by Netflix's Chaos Monkey, formalises failure injection as an engineering discipline. The core idea:

1. Define "steady state" — a measurable baseline (error rate, latency p99, throughput)
2. Hypothesise that the system will maintain steady state under a specific failure
3. Inject the failure in a controlled way
4. Measure whether steady state holds
5. Fix any deviations; strengthen your hypothesis

For databases specifically:

```
Hypothesis: "If the primary crashes, Patroni will promote a replica
             within 30 seconds and applications will reconnect within
             5 seconds after that."

Experiment:  kill -9 <postgres primary PID>

Metrics:     - Time from kill to replica promotion (monitor Patroni logs)
             - Time from promotion to application reconnect (application error rate)
             - Row count match between old primary and new primary
```

### Tooling

| Tool | What it does |
|---|---|
| **Chaos Monkey** | Randomly terminates EC2 instances |
| **Chaos Mesh** | Kubernetes-native: injects network partitions, disk failures, pod kills |
| **Pumba** | Docker container chaos: kills, delays, packet loss |
| **tc / iptables** | Linux traffic control for manual network partition simulation |
| **Gremlin** | Commercial SaaS; broad failure catalog, scheduling |

For database testing specifically, you can use OS-level tools without any special framework:

```bash
# Simulate primary crash
systemctl stop postgresql

# Simulate network partition (block replication port)
iptables -A INPUT -p tcp --dport 5432 -s 10.0.1.11 -j DROP

# Simulate disk full
fallocate -l 100G /var/lib/postgresql/fake_fill

# Simulate slow disk (add 50ms latency to all I/O)
tc qdisc add dev eth0 root netem delay 50ms
```

## Gameday and Disaster Recovery Drills

A **gameday** is a scheduled event where the engineering team deliberately causes production (or staging) incidents and practises the response. Gamedays:

- Validate runbooks under realistic time pressure
- Reveal gaps in on-call knowledge
- Build confidence and reduce cognitive load during real incidents
- Surface hidden dependencies (e.g., the backup job that emails an address no one monitors)

A **DR drill** specifically exercises the full restore path: shut down the production database, restore from backup, verify data, and measure RTO. Many teams run DR drills quarterly.

## Interactive: Failure Experiment Log

Track each chaos experiment's outcome to build institutional knowledge.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Failure Experiment Log</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE failure_experiments (id INTEGER PRIMARY KEY, run_date TEXT, failure_type TEXT, target TEXT, detection_sec INTEGER, failover_sec INTEGER, data_loss_rows INTEGER, result TEXT, follow_up TEXT); INSERT INTO failure_experiments VALUES (1,'2024-03-15','primary crash','db-primary-1',8,24,0,'pass','none'); INSERT INTO failure_experiments VALUES (2,'2024-03-15','network partition','replica link',12,45,0,'pass','tune timeout from 60s to 30s'); INSERT INTO failure_experiments VALUES (3,'2024-04-02','disk full','db-primary-1',180,0,0,'fail','add disk-full alert at 85% threshold'); INSERT INTO failure_experiments VALUES (4,'2024-05-10','primary crash','db-primary-2',9,28,0,'pass','none'); INSERT INTO failure_experiments VALUES (5,'2024-06-01','backup restore','staging',NULL,NULL,0,'pass','RTO was 47 min — acceptable'); ">-- Show experiment history with pass/fail and areas needing improvement
SELECT run_date, failure_type, target,
       detection_sec || 's' AS detect_time,
       COALESCE(CAST(failover_sec AS TEXT), 'N/A') || 's' AS failover_time,
       result,
       follow_up
FROM failure_experiments
ORDER BY run_date;

-- Uncomment to see average detection/failover times for passing experiments:
-- SELECT failure_type, AVG(detection_sec) AS avg_detect, AVG(failover_sec) AS avg_failover
-- FROM failure_experiments WHERE result='pass' GROUP BY failure_type;</textarea>
  </div>
</div>

## What Good Looks Like

After a mature failure-testing programme, a team should be able to answer these questions from documented data:

- What is our measured failover time (p50, p95)?
- Does our application reconnect automatically, or does it require a restart?
- What is our measured RTO from backup restore?
- Have we tested a network partition? Did split-brain occur?
- When did we last perform a full DR drill?

> **Key principle:** Anything you haven't tested in the last 90 days should be considered untested. Configurations drift, dependencies change, and teams turn over. Regular testing is the only antidote.

## Key Takeaways

- Failure testing is the only way to convert assumed HA into verified HA
- Chaos engineering provides a scientific framework: define steady state, inject fault, measure deviation
- OS tools (`kill`, `iptables`, `tc`, `fallocate`) are sufficient for most database failure injections
- Run gamedays to validate runbooks and DR drills to measure real RTO
- Log every experiment: detection time, failover time, data loss, and follow-up actions
