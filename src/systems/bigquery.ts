import type { SystemId, SchemaField, Issue, TypeMappingEntry } from '../types.js';

export const BIGQUERY_RESERVED_KEYWORDS = new Set([
  'ALL','AND','ANY','ARRAY','AS','ASC','ASSERT_ROWS_MODIFIED','AT',
  'BETWEEN','BY','CASE','CAST','COLLATE','CONTAINS','CREATE','CROSS',
  'CUBE','CURRENT','DEFAULT','DEFINE','DESC','DISTINCT','ELSE','END',
  'ENUM','ESCAPE','EXCEPT','EXCLUDE','EXISTS','EXTRACT','FALSE','FETCH',
  'FOLLOWING','FOR','FROM','FULL','GROUP','GROUPING','GROUPS','HASH',
  'HAVING','IF','IGNORE','IN','INNER','INTERSECT','INTERVAL','INTO',
  'IS','JOIN','LATERAL','LEFT','LIKE','LIMIT','LOOKUP','MERGE','NATURAL',
  'NEW','NO','NOT','NULL','NULLS','OF','ON','OR','ORDER','OUTER','OVER',
  'PARTITION','PRECEDING','PROTO','QUALIFY','RANGE','RECURSIVE','RESPECT',
  'RIGHT','ROLLUP','ROWS','SELECT','SET','SOME','STRUCT','TABLESAMPLE',
  'THEN','TO','TREAT','TRUE','UNBOUNDED','UNION','UNNEST','USING',
  'WHEN','WHERE','WINDOW','WITH','WITHIN',
  // Commonly problematic extras confirmed by community reports
  'TIMESTAMP','DATE','TIME','DATETIME','VALUE','VALUES','INDEX',
  'TABLE','COLUMN','SCHEMA','DATABASE','OFFSET','LIMIT','REPLACE',
]);

// BigQuery type mapping from common source types
// Source: cloud.google.com/bigquery/docs/reference/standard-sql/data-types
export const BQ_TYPE_MAP: Record<string, { target: string; safe: boolean; note?: string }> = {
  string:    { target: 'STRING',    safe: true },
  integer:   { target: 'INT64',     safe: true },
  int:       { target: 'INT64',     safe: true },
  long:      { target: 'INT64',     safe: true },
  float:     { target: 'FLOAT64',   safe: true, note: 'float32 precision may be lost in FLOAT64' },
  double:    { target: 'FLOAT64',   safe: true },
  number:    { target: 'NUMERIC',   safe: true, note: 'Consider BIGNUMERIC for high precision' },
  boolean:   { target: 'BOOL',      safe: true },
  bool:      { target: 'BOOL',      safe: true },
  bytes:     { target: 'BYTES',     safe: true },
  date:      { target: 'DATE',      safe: true },
  time:      { target: 'TIME',      safe: true },
  datetime:  { target: 'DATETIME',  safe: true },
  timestamp: { target: 'TIMESTAMP', safe: true },
  array:     { target: 'ARRAY',     safe: true, note: 'Nested arrays not supported in BigQuery' },
  object:    { target: 'STRUCT',    safe: true },
  record:    { target: 'STRUCT',    safe: true },
  map:       { target: 'UNSUPPORTED', safe: false, note: 'MAP type not supported — flatten to STRUCT or use JSON STRING' },
  null:      { target: 'NULL',      safe: true,  note: 'Standalone null type rarely useful; use nullable fields' },
  enum:      { target: 'STRING',    safe: true,  note: 'Avro enums map to STRING in BigQuery' },
  decimal:   { target: 'NUMERIC',   safe: true,  note: 'Check precision/scale: NUMERIC supports up to 29 digits' },
  uuid:      { target: 'STRING',    safe: true },
};

const SYSTEM: SystemId = 'bigquery';

export function checkBigQuery(fields: SchemaField[]): { issues: Issue[]; mapping: TypeMappingEntry[] } {
  const issues: Issue[] = [];
  const mapping: TypeMappingEntry[] = [];

  function checkField(field: SchemaField, path = '') {
    const fullPath = path ? `${path}.${field.name}` : field.name;
    const upperName = field.name.toUpperCase();

    // 1. Reserved keyword check
    if (BIGQUERY_RESERVED_KEYWORDS.has(upperName)) {
      issues.push({
        system: SYSTEM,
        field: fullPath,
        code: 'RESERVED_KEYWORD',
        severity: 'CRITICAL',
        message: `'${field.name}' is a BigQuery reserved keyword`,
        detail: `BigQuery will reject queries referencing this column unless backtick-quoted everywhere. Most BI tools and Looker do NOT auto-quote — this will silently break reports.`,
        suggestion: `Rename to '${field.name}_value' or '${field.name}_field' or prefix with your domain: 'order_${field.name.toLowerCase()}'`,
        docUrl: 'https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical#reserved_keywords',
      });
    }

    // 2. Naming: must start with letter or underscore
    if (/^[0-9]/.test(field.name)) {
      issues.push({
        system: SYSTEM,
        field: fullPath,
        code: 'STARTS_WITH_NUMBER',
        severity: 'CRITICAL',
        message: `'${field.name}' starts with a number — invalid in BigQuery`,
        detail: 'BigQuery column names must begin with a letter (a-z, A-Z) or underscore (_).',
        suggestion: `Rename to '_${field.name}' or 'col_${field.name}'`,
        docUrl: 'https://cloud.google.com/bigquery/docs/schemas#column_names',
      });
    }

    // 3. Special characters
    if (/[^a-zA-Z0-9_]/.test(field.name)) {
      issues.push({
        system: SYSTEM,
        field: fullPath,
        code: 'SPECIAL_CHARACTER',
        severity: 'CRITICAL',
        message: `'${field.name}' contains special characters not allowed in BigQuery`,
        detail: 'BigQuery standard mode only allows letters, numbers, and underscores. Flexible column names are an opt-in feature requiring special API handling.',
        suggestion: `Replace special chars with underscores: '${field.name.replace(/[^a-zA-Z0-9_]/g, '_')}'`,
      });
    }

    // 4. Type mapping
    const sourceType = field.type.toLowerCase();
    const mapped = BQ_TYPE_MAP[sourceType];
    if (!mapped) {
      issues.push({
        system: SYSTEM,
        field: fullPath,
        code: 'UNSUPPORTED_TYPE',
        severity: 'WARNING',
        message: `Type '${field.type}' has no direct BigQuery equivalent`,
        detail: `BigQuery does not have a '${field.type}' type. Data may need manual mapping.`,
        suggestion: `Map to STRING or BYTES as a fallback. Review BigQuery type docs.`,
        docUrl: 'https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types',
      });
      mapping.push({ field: fullPath, sourceType: field.type, targetType: 'UNKNOWN', safe: false });
    } else {
      if (!mapped.safe) {
        issues.push({
          system: SYSTEM,
          field: fullPath,
          code: 'UNSUPPORTED_TYPE',
          severity: 'CRITICAL',
          message: `Type '${field.type}' is not supported in BigQuery`,
          detail: mapped.note ?? '',
          suggestion: 'Use STRING or flatten the structure.',
        });
      } else if (mapped.note) {
        issues.push({
          system: SYSTEM,
          field: fullPath,
          code: 'TYPE_PRECISION_LOSS',
          severity: 'INFO',
          message: `Type '${field.type}' maps to '${mapped.target}' — note: ${mapped.note}`,
          detail: mapped.note,
          suggestion: 'Verify precision requirements.',
        });
      }
      mapping.push({ field: fullPath, sourceType: field.type, targetType: mapped.target, safe: mapped.safe, note: mapped.note });
    }

    // 5. Nested array-of-array — BigQuery doesn't support
    if (field.type === 'array' && field.items?.type === 'array') {
      issues.push({
        system: SYSTEM,
        field: fullPath,
        code: 'NESTED_TYPE_UNSUPPORTED',
        severity: 'CRITICAL',
        message: `Nested arrays (array of arrays) not supported in BigQuery`,
        detail: 'BigQuery ARRAYs cannot contain other ARRAYs. This is a hard limitation.',
        suggestion: 'Flatten the structure or use a STRUCT wrapper between the two array levels.',
        docUrl: 'https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types#array_type',
      });
    }

    // Recurse into nested fields
    if (field.fields) field.fields.forEach(f => checkField(f, fullPath));
    if (field.items?.fields) field.items.fields.forEach(f => checkField(f, `${fullPath}[]`));
  }

  fields.forEach(f => checkField(f));
  return { issues, mapping };
}
