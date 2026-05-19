# Schema Preflight 🛫

**Check your schema against BigQuery, Snowflake, Redshift, Spark, Hive, and Postgres simultaneously — before a single byte of data is produced.**

> "A field named `timestamp` passed Kafka validation, produced 50 million messages, then silently broke every BigQuery query because `TIMESTAMP` is a reserved keyword there. We found out 6 hours later."
> — Real incident, confirmed by OSO engineering blog (2025)

Schema Preflight stops this. One API call. Every system. Zero surprises.

---

## The problem this solves

Every schema registry (Confluent, AWS Glue, Apicurio) validates schemas for **one system**.

- Confluent validates for Kafka/Avro
- AWS Glue validates for AWS services
- Databricks Unity Catalog validates for Spark/Delta

None of them tell you:

| Field name | Kafka ✅ | BigQuery ❌ | Snowflake ❌ | Hive ❌ | Postgres ❌ |
|---|---|---|---|---|---|
| `timestamp` | Valid | **RESERVED KEYWORD** | **RESERVED KEYWORD** | **RESERVED KEYWORD** | **RESERVED KEYWORD** |
| `select` | Valid | **RESERVED KEYWORD** | **RESERVED KEYWORD** | **RESERVED KEYWORD** | **RESERVED KEYWORD** |
| `value` | Valid | **RESERVED KEYWORD** | **RESERVED KEYWORD** | **RESERVED KEYWORD** | Valid |
| `2fa_enabled` | Valid | **INVALID** | **INVALID** | **INVALID** | **INVALID** |

Schema Preflight checks all of them **simultaneously**, before you deploy.

---

## Quick start — 60 seconds

```bash
git clone https://github.com/AmruthamAkshithraj/schema-preflight
cd schema-preflight
npm install
npm run dev
# Running at http://localhost:3000
```

### Check a schema

```bash
curl -X POST http://localhost:3000/preflight \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OrderEvent",
    "sourceFormat": "avro",
    "targetSystems": ["bigquery", "snowflake", "redshift", "spark", "hive", "postgres"],
    "fields": [
      {"name": "timestamp",   "type": "string"},
      {"name": "select",      "type": "integer"},
      {"name": "user_id",     "type": "string"},
      {"name": "order_total", "type": "number"},
      {"name": "metadata",    "type": "map"}
    ]
  }'
```

Response:
```json
{
  "overallSafe": false,
  "summary": {
    "systemsChecked": 6,
    "systemsPassed": 0,
    "systemsFailed": 6,
    "totalCriticals": 12,
    "totalWarnings": 2
  },
  "globalIssues": [
    {
      "field": "timestamp",
      "code": "RESERVED_KEYWORD",
      "severity": "CRITICAL",
      "message": "'timestamp' is a reserved keyword — affects ALL 6 systems",
      "suggestion": "Rename to 'event_timestamp' or 'ts'"
    },
    {
      "field": "select",
      "code": "RESERVED_KEYWORD",
      "severity": "CRITICAL",
      "message": "'select' is a reserved keyword — affects ALL 6 systems"
    }
  ],
  "suggestedFixes": [
    {"field": "timestamp", "suggestedName": "event_timestamp", "affectedSystems": ["bigquery","snowflake","redshift","spark","hive","postgres"]},
    {"field": "select",    "suggestedName": "select_value",    "affectedSystems": ["bigquery","snowflake","redshift","spark","hive","postgres"]}
  ]
}
```

---

## Python SDK

```bash
pip install requests
cp sdk/schema_preflight.py your_project/
```

```python
from schema_preflight import SchemaPreflight, PreflightFailed

pf = SchemaPreflight("https://your-render-url.onrender.com")

# Check before a Spark job writes to BigQuery
report = pf.check(
    name="ClickEvent",
    source_format="parquet",
    target_systems=["bigquery", "snowflake", "redshift", "spark"],
    fields=[
        {"name": "event_id",    "type": "string"},
        {"name": "timestamp",   "type": "integer"},  # ← will flag as reserved
        {"name": "user_id",     "type": "string"},
        {"name": "page_url",    "type": "string"},
    ],
)
report.print_summary()
report.raise_if_critical()  # Raises PreflightFailed if any CRITICAL issues
```

```python
# PySpark integration — check schema metadata, not data
df = spark.read.json("s3://raw/events/")
pf.check_spark_schema(df, "ClickEvent").raise_if_critical()
df.write.parquet("s3://clean/events/")
```

```python
# Pandas
df = pd.read_csv("data.csv")
pf.check_pandas_schema(df, "Orders").raise_if_critical()
```

```python
# Quick single field check
result = pf.check_name("timestamp")
# {"safe": False, "affectedSystems": ["bigquery","snowflake","redshift","spark","hive","postgres"]}

# Get safe suggestions
suggestions = pf.suggest_name("timestamp")
# ["timestamp_value", "timestamp_col", "event_timestamp"]
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/preflight` | **Full schema pre-flight check** |
| POST | `/check-name` | Check a single field name |
| POST | `/suggest-name` | Get safe rename suggestions |
| GET | `/reserved-keywords/:system` | List all reserved keywords for a system |

### `/preflight` request body

```json
{
  "name": "MySchema",
  "sourceFormat": "json",
  "targetSystems": ["bigquery", "snowflake", "redshift", "spark", "hive", "postgres", "mysql", "kafka_avro"],
  "fields": [
    {
      "name": "field_name",
      "type": "string",
      "nullable": true,
      "description": "optional",
      "maxLength": 255,
      "fields": [],
      "items": {}
    }
  ]
}
```

### Supported types
`string` `integer` `long` `float` `double` `number` `boolean` `bytes` `date` `time` `datetime` `timestamp` `array` `object` `map` `enum` `decimal` `null`

### Supported systems
`bigquery` `snowflake` `redshift` `spark` `hive` `postgres` `mysql` `kafka_avro`

---

## What it checks

### Reserved keywords
Field names that are valid SQL identifiers but reserved by specific systems.
`timestamp`, `select`, `value`, `index`, `offset`, `replace`, `date`, `time` — all break silently in one or more systems.

### Naming violations
- Names starting with digits (`2fa_enabled` → invalid in all SQL systems)
- Special characters in field names
- Avro name regex violations

### Type incompatibilities
- `map` type with Avro format → Redshift Spectrum throws exception
- `array` of `array` → BigQuery hard limit
- Complex Avro union types → breaks Hive, Spark external tables
- `map` with non-string key → Redshift connector exception

### Type precision warnings
- `float` → BigQuery `FLOAT64` (64-bit, no precision loss — but noted)
- `timestamp` → Snowflake `TIMESTAMP_NTZ` vs `TIMESTAMP_TZ`
- `number` → Redshift `DECIMAL` (requires precision/scale spec)

---

## Deploy to Render (free)

```
1. Push to GitHub (commands below)
2. Go to render.com → New Web Service
3. Connect your GitHub repo
4. Runtime: Docker
5. Deploy
```

---

## Push to GitHub

```bash
cd schema-preflight
git init
git config user.name "Amrutham Akshithraj"
git config user.email "your@email.com"
git add -A
git commit -m "feat: Schema Preflight — cross-system schema validator"
git remote add origin https://github.com/AmruthamAkshithraj/schema-preflight.git
git branch -M main
git push -u origin main
```

---

## Why this matters to the data community

- **Confluent Schema Registry** — validates Avro for Kafka only
- **AWS Glue Schema Registry** — validates for AWS ecosystem only
- **buf.build** — validates Protobuf only
- **DataHub Data Contracts** — validates one asset at a time, no cross-system pre-flight

**Schema Preflight** is the only tool that runs your schema through every target system's rules simultaneously, before deployment, with field-level explanations and suggested fixes.

It was built because OSO engineers documented in 2025 that developers repeatedly register schemas with Kafka's registry, produce millions of messages, then discover weeks later that ETL processes fail because Kafka validated the schema but downstream systems had different rules — reserved keywords, union types, type incompatibilities — and the resulting data migration takes months to resolve.

---

## Contributing

Issues and PRs welcome. Especially:
- Additional reserved keyword lists (Databricks, ClickHouse, DuckDB, Trino)
- Type mapping corrections
- Real-world field name patterns that cause failures

---

## License

MIT © Amrutham Akshithraj
