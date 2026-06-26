This course covered the core of how databases are designed and why — storage engines, query processing, transactions, distribution, and the major database families. But the field is large and active. Entire sub-disciplines are not covered here, either because they require significant mathematical background, because they are evolving rapidly, or because they are specialized enough to warrant their own courses. This page maps the frontier.

## What This Course Did Not Cover

### Query Optimization (Deep)

This course introduced the query planner conceptually, but a full treatment of query optimization is its own field. The deep topics include:

- **Cardinality estimation** — how the optimizer guesses how many rows a filter will return; the source of most bad plans. Modern approaches use histograms, sketches (HyperLogLog, Count-Min Sketch), and ML-based estimation.
- **Join ordering** — the number of possible join orders grows factorially with the number of tables; dynamic programming (System R approach) and genetic algorithms are both used.
- **Physical properties** — the optimizer must track whether data is sorted or partitioned to avoid unnecessary sorts and hash redistributions.
- **Adaptive query processing** — reoptimizing a query mid-execution when estimates were wrong (Eddies, AQP in Spark).

**Resources:** "Database System Implementation" (Garcia-Molina et al.), Selinger et al. (1979), and the CMU 15-721 advanced database course.

### Database Theory

The theoretical foundations of databases are a separate discipline:

- **Relational algebra and calculus** — formal underpinnings of SQL; important for understanding query rewriting and equivalences.
- **Functional dependencies and normal forms** — BCNF, 4NF, 5NF; when to normalize and when not to.
- **Datalog** — a logic-based query language that underlies Datomic and modern Dedalus/Bloom research.
- **Complexity of queries** — which queries can be answered in polynomial time; the dichotomy conjecture.

**Resources:** "Foundations of Databases" (Abiteboul, Hull, Vianu) — the canonical theory text, free online.

### Hardware-Aware Database Design

Modern storage engines increasingly exploit hardware directly:

- **Non-volatile memory (NVDIMM / Optane)** — byte-addressable persistent memory blurs the boundary between DRAM and storage. WAL designs change fundamentally.
- **RDMA (Remote Direct Memory Access)** — bypassing the kernel for network I/O; used in FaRM, DrTM, and other research systems.
- **SIMD and vectorized execution** — using CPU vector registers to process 8–16 values in a single instruction; core to DuckDB and MonetDB.
- **NVMe and io_uring** — modern storage interfaces that allow asynchronous I/O without kernel involvement per operation.

<figure class="diagram">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of database topics beyond this book organized into five clusters: query optimization, theory, hardware, ML and databases, and emerging paradigms">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>
  <!-- center -->
  <rect x="255" y="100" width="130" height="60" rx="8" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="320" y="127" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">This Course</text>
  <text x="320" y="145" text-anchor="middle" font-size="10" fill="var(--muted)">Storage · Queries · Tx · Dist</text>

  <!-- top left: Query Optimization -->
  <rect x="20" y="20" width="150" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="95" y="47" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Query Optimization</text>
  <text x="95" y="65" text-anchor="middle" font-size="10" fill="var(--muted)">Cardinality · Join order</text>
  <line x1="170" y1="80" x2="255" y2="115" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>

  <!-- top right: DB Theory -->
  <rect x="470" y="20" width="150" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="545" y="47" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">DB Theory</text>
  <text x="545" y="65" text-anchor="middle" font-size="10" fill="var(--muted)">Algebra · Datalog · NF</text>
  <line x1="470" y1="80" x2="385" y2="115" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>

  <!-- bottom left: Hardware -->
  <rect x="20" y="180" width="150" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="95" y="207" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Hardware-Aware</text>
  <text x="95" y="225" text-anchor="middle" font-size="10" fill="var(--muted)">NVDIMM · SIMD · RDMA</text>
  <line x1="170" y1="200" x2="255" y2="148" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>

  <!-- bottom right: ML + DBs -->
  <rect x="470" y="180" width="150" height="60" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="545" y="207" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">ML + Databases</text>
  <text x="545" y="225" text-anchor="middle" font-size="10" fill="var(--muted)">Learned indexes · LLM+SQL</text>
  <line x1="470" y1="200" x2="385" y2="148" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>

  <!-- bottom center: Emerging -->
  <rect x="235" y="195" width="170" height="55" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="320" y="219" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Emerging Paradigms</text>
  <text x="320" y="237" text-anchor="middle" font-size="10" fill="var(--muted)">Lakehouse · Streaming · HTAP</text>
  <line x1="320" y1="195" x2="320" y2="162" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arr)"/>
</svg>
<figcaption>Five active research and engineering frontiers beyond the core material in this course — each is a substantial field in its own right.</figcaption>
</figure>

### Machine Learning and Databases

This intersection is growing fast in both directions:

- **Learned indexes** — replacing B-trees with ML models that predict the position of a key. "The Case for Learned Index Structures" (Kraska et al., 2018) is the landmark paper.
- **Learned query optimization** — using RL or supervised learning to replace the cost-based optimizer. Bao (Learned Knobs), Neo, and similar projects.
- **Vector databases** — storing high-dimensional embeddings and answering approximate nearest-neighbor queries. Used for semantic search, RAG pipelines, and recommendation. Examples: pgvector, Weaviate, Pinecone, Milvus.
- **LLM + SQL** — text-to-SQL systems (DAIL-SQL, DIN-SQL), natural-language interfaces over structured data.

### Streaming and Real-Time Databases

Databases that process data as it arrives rather than in batches:

- **Apache Flink** — stateful stream processing; exactly-once semantics over unbounded streams.
- **Apache Kafka** — a distributed, replicated log; often used as the transport layer between streaming systems.
- **Materialize / Risingwave** — streaming SQL that maintains views incrementally as new data arrives.
- **ksqlDB** — SQL over Kafka streams.

The theoretical foundation is **datastream processing**: how do you compute aggregates over an unbounded stream with finite memory? Sliding windows, tumbling windows, and watermarks are the key concepts.

### Lakehouse Architecture

The convergence of data lakes (cheap object storage) and data warehouses (structured queries):

- **Apache Iceberg / Delta Lake / Apache Hudi** — table formats that bring ACID semantics, schema evolution, and time travel to object storage (S3/GCS/Azure Blob).
- **Apache Parquet / ORC** — columnar file formats that enable predicate pushdown even in a file system.
- **Query engines:** Trino, Spark, Dask, DuckDB — all can query Parquet files on S3 directly.

This architecture is now the dominant pattern for large-scale analytical workloads, replacing traditional data warehouses for many use cases.

### Security and Privacy

- **Row-level security** — ensuring users can only see rows they own; implemented in PostgreSQL with row security policies.
- **Encryption at rest** — transparent data encryption (TDE); how keys are managed.
- **Differential privacy** — answering aggregate queries without leaking individual records; Apple, Google, and the US Census Bureau use this.
- **Homomorphic encryption** — computing on encrypted data without decrypting (mostly research-stage for databases).

## Courses and Books to Go Deeper

| Resource | What it covers |
|---|---|
| CMU 15-721 (free online) | Advanced database internals: OLAP, vectorization, HTAP |
| "Database System Implementation" — Garcia-Molina | Storage, indexing, query processing in depth |
| "Designing Data-Intensive Applications" — Kleppmann | Distributed systems concepts with database focus |
| "Streaming Systems" — Akidau et al. | Stream processing theory and practice |
| "Readings in Database Systems" (Red Book) | Curated foundational papers with commentary |
| VLDB / SIGMOD / OSDI proceedings | Where new database research is published |

## Key Takeaways

- Query optimization, database theory, hardware-aware design, ML-database intersection, streaming, and lakehouse architecture are each substantial fields beyond this course.
- Vector databases and LLM-integrated query systems are the fastest-moving area right now.
- The "Red Book" (Readings in Database Systems) and CMU 15-721 are the highest-leverage next steps for engineering depth.
- Streaming and lakehouse architecture are increasingly the dominant patterns for analytical workloads in production.
