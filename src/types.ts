// ─── Schema Preflight — Core Types ───────────────────────────────────────────

export type SystemId =
  | 'bigquery'
  | 'snowflake'
  | 'redshift'
  | 'spark'
  | 'hive'
  | 'postgres'
  | 'mysql'
  | 'kafka_avro';

export type SourceFormat = 'json' | 'avro' | 'protobuf' | 'parquet' | 'csv';

export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type IssueCode =
  | 'RESERVED_KEYWORD'
  | 'UNSUPPORTED_TYPE'
  | 'TYPE_PRECISION_LOSS'
  | 'NAMING_VIOLATION'
  | 'NESTED_TYPE_UNSUPPORTED'
  | 'NULL_HANDLING_DIFFERENCE'
  | 'CASE_SENSITIVITY_CONFLICT'
  | 'LENGTH_LIMIT_EXCEEDED'
  | 'AVRO_UNION_UNSUPPORTED'
  | 'AVRO_NESTED_UNSUPPORTED'
  | 'STARTS_WITH_NUMBER'
  | 'SPECIAL_CHARACTER'
  | 'MAX_COLUMNS_EXCEEDED';

// ─── Schema input — what the user defines ────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string;            // 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'bytes' | 'enum' | 'null'
  nullable?: boolean;
  description?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  items?: SchemaField;    // for arrays
  fields?: SchemaField[]; // for nested objects/records
  symbols?: string[];     // for enums
  logicalType?: string;   // 'date', 'timestamp-millis', 'decimal', etc.
}

export interface SchemaInput {
  name: string;
  namespace?: string;
  sourceFormat: SourceFormat;
  fields: SchemaField[];
  targetSystems: SystemId[];
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export interface Issue {
  system: SystemId;
  field: string;
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  detail: string;
  suggestion: string;
  docUrl?: string;
}

// ─── Per-system result ────────────────────────────────────────────────────────

export interface SystemResult {
  system: SystemId;
  compatible: boolean;
  issues: Issue[];
  typeMapping: TypeMappingEntry[];
  warnings: number;
  criticals: number;
  infos: number;
}

export interface TypeMappingEntry {
  field: string;
  sourceType: string;
  targetType: string;
  safe: boolean;
  note?: string;
}

// ─── Full preflight report ────────────────────────────────────────────────────

export interface PreflightReport {
  id: string;
  schemaName: string;
  sourceFormat: SourceFormat;
  checkedAt: Date;
  overallSafe: boolean;
  summary: {
    systemsChecked: number;
    systemsPassed: number;
    systemsFailed: number;
    totalCriticals: number;
    totalWarnings: number;
    totalInfos: number;
  };
  systems: SystemResult[];
  globalIssues: Issue[];   // issues that affect ALL systems
  suggestedFixes: SuggestedFix[];
}

export interface SuggestedFix {
  field: string;
  currentName: string;
  suggestedName: string;
  reason: string;
  affectedSystems: SystemId[];
}
