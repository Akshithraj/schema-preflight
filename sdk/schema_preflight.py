"""
Schema Preflight — Python SDK
==============================
Check your schema against BigQuery, Snowflake, Redshift, Spark, Hive,
Postgres simultaneously — before a single byte of data is produced.

Install:   pip install requests
Copy this file into your project.

Usage:
    from schema_preflight import SchemaPreflight

    pf = SchemaPreflight("https://your-render-url.onrender.com")
    report = pf.check(
        name="OrderEvent",
        fields=[
            {"name": "timestamp",  "type": "string"},
            {"name": "select",     "type": "integer"},
            {"name": "user_id",    "type": "string"},
            {"name": "total",      "type": "number"},
        ],
        target_systems=["bigquery", "snowflake", "redshift", "spark"],
    )
    report.print_summary()
    report.raise_if_critical()
"""

import json
import requests
from dataclasses import dataclass, field
from typing import Optional


SYSTEM_LABELS = {
    "bigquery":   "BigQuery",
    "snowflake":  "Snowflake",
    "redshift":   "Redshift",
    "spark":      "Spark",
    "hive":       "Hive",
    "postgres":   "Postgres",
    "mysql":      "MySQL",
    "kafka_avro": "Kafka/Avro",
}

ALL_SYSTEMS = list(SYSTEM_LABELS.keys())


class PreflightFailed(Exception):
    """Raised when critical issues are found and raise_if_critical() is called."""
    def __init__(self, report):
        self.report = report
        criticals = report.summary["totalCriticals"]
        systems_failed = report.summary["systemsFailed"]
        super().__init__(
            f"Schema '{report.schema_name}' has {criticals} critical issue(s) "
            f"across {systems_failed} system(s). Fix before deploying."
        )


@dataclass
class PreflightReport:
    raw: dict

    @property
    def schema_name(self) -> str:
        return self.raw.get("schemaName", "")

    @property
    def overall_safe(self) -> bool:
        return self.raw.get("overallSafe", False)

    @property
    def summary(self) -> dict:
        return self.raw.get("summary", {})

    @property
    def systems(self) -> list[dict]:
        return self.raw.get("systems", [])

    @property
    def global_issues(self) -> list[dict]:
        return self.raw.get("globalIssues", [])

    @property
    def suggested_fixes(self) -> list[dict]:
        return self.raw.get("suggestedFixes", [])

    def issues_for(self, system: str) -> list[dict]:
        for s in self.systems:
            if s["system"] == system:
                return s["issues"]
        return []

    def raise_if_critical(self):
        """Call this to abort your pipeline if critical issues found."""
        if not self.overall_safe:
            raise PreflightFailed(self)

    def print_summary(self):
        """Pretty-print the full report to stdout."""
        SEP = "─" * 64
        s = self.summary

        print(f"\n{'═'*64}")
        print(f"  Schema Preflight Report: {self.schema_name}")
        print(f"{'═'*64}")
        print(f"  Overall safe: {'✅ YES' if self.overall_safe else '❌ NO — FIX BEFORE DEPLOYING'}")
        print(f"  Systems checked: {s['systemsChecked']}  "
              f"Passed: {s['systemsPassed']}  "
              f"Failed: {s['systemsFailed']}")
        print(f"  Criticals: {s['totalCriticals']}  "
              f"Warnings: {s['totalWarnings']}  "
              f"Infos: {s['totalInfos']}")

        if self.global_issues:
            print(f"\n  🌍 Issues affecting ALL systems:")
            for issue in self.global_issues:
                icon = "🔴" if issue["severity"] == "CRITICAL" else "🟡"
                print(f"    {icon} [{issue['code']}] field '{issue['field']}': {issue['message']}")
                print(f"       → Fix: {issue['suggestion']}")

        for system_result in self.systems:
            sname = SYSTEM_LABELS.get(system_result["system"], system_result["system"])
            status = "✅ PASS" if system_result["compatible"] else "❌ FAIL"
            print(f"\n  {SEP}")
            print(f"  {sname} — {status}  "
                  f"({system_result['criticals']} critical, "
                  f"{system_result['warnings']} warning, "
                  f"{system_result['infos']} info)")

            for issue in system_result["issues"]:
                icon = {"CRITICAL": "🔴", "WARNING": "🟡", "INFO": "🔵"}.get(issue["severity"], "•")
                print(f"    {icon} {issue['field']}: {issue['message']}")
                print(f"       Detail: {issue['detail']}")
                print(f"       Fix:    {issue['suggestion']}")

            print(f"\n  Type mappings:")
            for m in system_result.get("typeMapping", []):
                safe_icon = "✅" if m["safe"] else "❌"
                print(f"    {safe_icon} {m['field']}: {m['sourceType']} → {m['targetType']}"
                      + (f"  ({m['note']})" if m.get("note") else ""))

        if self.suggested_fixes:
            print(f"\n  {'═'*64}")
            print(f"  💡 Suggested renames:")
            for fix in self.suggested_fixes:
                systems = ", ".join(SYSTEM_LABELS.get(s, s) for s in fix["affectedSystems"])
                print(f"    '{fix['currentName']}' → '{fix['suggestedName']}'")
                print(f"    Affects: {systems}")
                print(f"    Reason:  {fix['reason']}")

        print(f"\n{'═'*64}\n")


class SchemaPreflight:
    """
    Schema Preflight client.

    pf = SchemaPreflight("https://your-render-url.onrender.com")

    # Check a schema
    report = pf.check(
        name="MySchema",
        fields=[{"name": "timestamp", "type": "string"}],
        target_systems=["bigquery", "snowflake", "redshift", "spark"],
    )
    report.print_summary()

    # Use in a Spark job — raises PreflightFailed if critical issues found
    report.raise_if_critical()
    """

    def __init__(self, base_url: str = "http://localhost:3000", timeout: int = 15):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["Content-Type"] = "application/json"

    def health(self) -> dict:
        return self.session.get(f"{self.base_url}/health", timeout=self.timeout).json()

    def check(
        self,
        name: str,
        fields: list[dict],
        target_systems: Optional[list[str]] = None,
        source_format: str = "json",
        namespace: Optional[str] = None,
    ) -> PreflightReport:
        """
        Run pre-flight check on a schema.

        fields format:
            [
                {"name": "user_id",   "type": "string",  "nullable": False},
                {"name": "timestamp", "type": "integer"},
                {"name": "total",     "type": "number"},
                {"name": "items",     "type": "array",
                 "items": {"name": "item", "type": "string"}},
            ]

        target_systems: list of system IDs. Defaults to all systems.
            Options: bigquery, snowflake, redshift, spark, hive, postgres, mysql, kafka_avro
        """
        payload = {
            "name": name,
            "sourceFormat": source_format,
            "fields": fields,
            "targetSystems": target_systems or ALL_SYSTEMS,
        }
        if namespace:
            payload["namespace"] = namespace

        resp = self.session.post(
            f"{self.base_url}/preflight",
            json=payload,
            timeout=self.timeout,
        )

        if resp.status_code not in (200, 422):
            raise RuntimeError(f"Preflight API error {resp.status_code}: {resp.text}")

        return PreflightReport(resp.json())

    def check_name(self, name: str, systems: Optional[list[str]] = None) -> dict:
        """Quick check: is a single field name safe across all systems?"""
        resp = self.session.post(
            f"{self.base_url}/check-name",
            json={"name": name, "systems": systems or ALL_SYSTEMS},
            timeout=self.timeout,
        )
        return resp.json()

    def suggest_name(self, name: str) -> list[str]:
        """Get safe rename suggestions for a field name."""
        resp = self.session.post(
            f"{self.base_url}/suggest-name",
            json={"name": name},
            timeout=self.timeout,
        )
        return resp.json().get("safeSuggestions", [])

    def check_spark_schema(self, df, schema_name: str, target_systems=None) -> PreflightReport:
        """
        Check a PySpark DataFrame schema before writing to a warehouse.

        Usage in a Spark job:
            df = spark.read.json("s3://raw/events/")
            pf.check_spark_schema(df, "ClickEvent").raise_if_critical()
            df.write.parquet("s3://clean/events/")
        """
        try:
            fields = [
                {"name": f.name, "type": self._spark_type(str(f.dataType))}
                for f in df.schema.fields
            ]
        except Exception as e:
            raise RuntimeError(f"Cannot read Spark schema: {e}")

        return self.check(schema_name, fields, target_systems, "parquet")

    def check_pandas_schema(self, df, schema_name: str, target_systems=None) -> PreflightReport:
        """Check a pandas DataFrame schema."""
        import pandas as pd
        fields = [
            {"name": col, "type": self._pandas_type(str(dtype))}
            for col, dtype in df.dtypes.items()
        ]
        return self.check(schema_name, fields, target_systems, "csv")

    def _spark_type(self, spark_type: str) -> str:
        if "StringType" in spark_type: return "string"
        if "LongType" in spark_type:   return "long"
        if "IntegerType" in spark_type: return "integer"
        if "DoubleType" in spark_type:  return "double"
        if "FloatType" in spark_type:   return "float"
        if "BooleanType" in spark_type: return "boolean"
        if "TimestampType" in spark_type: return "timestamp"
        if "DateType" in spark_type:    return "date"
        if "ArrayType" in spark_type:   return "array"
        if "StructType" in spark_type:  return "object"
        if "MapType" in spark_type:     return "map"
        if "BinaryType" in spark_type:  return "bytes"
        if "DecimalType" in spark_type: return "decimal"
        return "string"

    def _pandas_type(self, dtype: str) -> str:
        if "int" in dtype:      return "integer"
        if "float" in dtype:    return "number"
        if "bool" in dtype:     return "boolean"
        if "datetime" in dtype: return "timestamp"
        if "object" in dtype:   return "string"
        return "string"


# ─── Quick demo — run this file directly ──────────────────────────────────────

if __name__ == "__main__":
    pf = SchemaPreflight("http://localhost:3000")

    print("Health:", pf.health()["status"])

    # This schema has real, well-known production problems
    report = pf.check(
        name="OrderEvent",
        source_format="avro",
        target_systems=["bigquery", "snowflake", "redshift", "spark", "hive", "postgres"],
        fields=[
            # 'timestamp' — reserved in BigQuery, Snowflake, Hive, Spark, Postgres, Redshift
            {"name": "timestamp",   "type": "string",  "nullable": False},
            # 'select' — reserved in EVERY SQL system — hardest failure possible
            {"name": "select",      "type": "integer", "nullable": False},
            # 'value' — reserved in multiple systems
            {"name": "value",       "type": "number"},
            # 'user_id' — safe everywhere ✅
            {"name": "user_id",     "type": "string"},
            # 'order_total' — safe everywhere ✅
            {"name": "order_total", "type": "number"},
            # Map type — unsupported in Redshift Spectrum with Avro
            {"name": "metadata",    "type": "map"},
            # Starts with number — invalid everywhere
            {"name": "2fa_enabled", "type": "boolean"},
        ],
    )

    report.print_summary()

    print("\nQuick name check:")
    result = pf.check_name("timestamp")
    print(f"  'timestamp' safe: {result['safe']} — affects: {result['affectedSystems']}")

    print("\nSuggested safe names for 'timestamp':")
    suggestions = pf.suggest_name("timestamp")
    for s in suggestions:
        print(f"  → {s}")
