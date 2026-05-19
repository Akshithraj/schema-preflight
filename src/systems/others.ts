import type { SystemId, SchemaField, Issue, TypeMappingEntry } from '../types.js';

// ─── SNOWFLAKE ────────────────────────────────────────────────────────────────
// Source: docs.snowflake.com/en/sql-reference/reserved-keywords

const SNOWFLAKE_RESERVED = new Set([
  'ACCOUNT','ALL','ALTER','AND','ANY','AS','BETWEEN','BY','CASE','CAST',
  'CHECK','COLUMN','CONNECT','CONNECTION','CONSTRAINT','CREATE','CROSS',
  'CURRENT','CURRENT_DATE','CURRENT_TIME','CURRENT_TIMESTAMP','CURRENT_USER',
  'DATABASE','DELETE','DISTINCT','DROP','ELSE','EXISTS','FALSE','FOLLOWING',
  'FOR','FROM','FULL','GRANT','GROUP','GSCLUSTER','HAVING','ILIKE','IN',
  'INCREMENT','INNER','INSERT','INTERSECT','INTO','IS','ISSUE','JOIN',
  'LATERAL','LEFT','LIKE','LOCALTIME','LOCALTIMESTAMP','MINUS','NATURAL',
  'NOT','NULL','OF','ON','OR','ORDER','ORGANIZATION','QUALIFY','REGEXP',
  'REVOKE','RIGHT','RLIKE','ROW','ROWS','SAMPLE','SCHEMA','SELECT','SET',
  'SOME','START','TABLE','TABLESAMPLE','THEN','TO','TRIGGER','TRUE',
  'TRY_CAST','UNION','UNIQUE','UPDATE','USING','VALUES','VIEW','WHEN',
  'WHERE','WITH',
  // Extra commonly broken
  'VALUE','INDEX','OFFSET','LIMIT','REPLACE','TIMESTAMP','DATE','TIME',
]);

const SF_TYPE_MAP: Record<string, { target: string; safe: boolean; note?: string }> = {
  string:    { target: 'VARCHAR',          safe: true },
  integer:   { target: 'NUMBER(38,0)',     safe: true },
  int:       { target: 'NUMBER(38,0)',     safe: true },
  long:      { target: 'NUMBER(38,0)',     safe: true },
  float:     { target: 'FLOAT',           safe: true, note: 'Snowflake FLOAT is 64-bit double' },
  double:    { target: 'FLOAT',           safe: true },
  number:    { target: 'NUMBER',          safe: true, note: 'Specify precision/scale: NUMBER(p,s)' },
  boolean:   { target: 'BOOLEAN',         safe: true },
  bool:      { target: 'BOOLEAN',         safe: true },
  bytes:     { target: 'BINARY',          safe: true },
  date:      { target: 'DATE',            safe: true },
  time:      { target: 'TIME',            safe: true },
  datetime:  { target: 'TIMESTAMP_NTZ',   safe: true, note: 'TIMESTAMP_NTZ = no timezone. Use TIMESTAMP_TZ if timezone needed.' },
  timestamp: { target: 'TIMESTAMP_NTZ',   safe: true, note: 'TIMESTAMP_NTZ = no timezone. Use TIMESTAMP_TZ if timezone needed.' },
  array:     { target: 'ARRAY (VARIANT)', safe: true, note: 'Snowflake stores arrays as VARIANT — semi-structured' },
  object:    { target: 'OBJECT (VARIANT)',safe: true, note: 'Snowflake stores objects as VARIANT — semi-structured' },
  map:       { target: 'OBJECT (VARIANT)',safe: true, note: 'Map stored as VARIANT OBJECT in Snowflake' },
  enum:      { target: 'VARCHAR',         safe: true },
  decimal:   { target: 'NUMBER',          safe: true, note: 'Specify NUMBER(p,s) for exact precision' },
  null:      { target: 'NULL',            safe: true },
};

// ─── REDSHIFT ─────────────────────────────────────────────────────────────────
// Source: docs.aws.amazon.com/redshift/latest/dg/r_pg_keywords.html

const REDSHIFT_RESERVED = new Set([
  'AES128','AES256','ALL','ALLOWOVERWRITE','ANALYSE','ANALYZE','AND','ANY',
  'ARRAY','AS','ASC','AUTHORIZATION','BACKUP','BETWEEN','BINARY','BLANKSASNULL',
  'BOTH','BYTEDICT','BZIP2','CASE','CAST','CHECK','COLLATE','COLUMN','CONSTRAINT',
  'CREATE','CREDENTIALS','CROSS','CURRENT_DATE','CURRENT_TIME','CURRENT_TIMESTAMP',
  'CURRENT_USER','CURRENT_USER_ID','DEFAULT','DEFERRABLE','DEFRAG','DELTA',
  'DELTA32K','DESC','DISABLE','DISTINCT','DO','ELSE','EMPTYASNULL','ENABLE',
  'ENCODE','ENCRYPT','ENCRYPTION','END','EXCEPT','EXPLICIT','FALSE','FOR',
  'FOREIGN','FREEZE','FROM','FULL','GLOBALDICT256','GLOBALDICT64K','GRANT',
  'GROUP','GZIP','HAVING','IDENTITY','IGNORE','ILIKE','IN','INITIALLY',
  'INNER','INSERT','INTERSECT','INTO','IS','ISNULL','JOIN','LEADING','LEFT',
  'LIKE','LIMIT','LOCALTIME','LOCALTIMESTAMP','LUN','LUNS','LZO','LZOP',
  'MINUS','MOSTLY13','MOSTLY32','MOSTLY8','NATURAL','NEW','NOT','NOTNULL',
  'NULL','NULLS','OFF','OFFLINE','OFFSET','OID','OLD','ON','ONLY','OPEN',
  'OR','ORDER','OUTER','OVERLAPS','PARALLEL','PARTITION','PERCENT','PERMISSIONS',
  'PIVOT','PLACING','PRIMARY','RAW','READRATIO','RECOVER','REFERENCES',
  'RESPECT','REJECTLOG','RESORT','RESTORE','RIGHT','SELECT','SESSION_USER',
  'SIMILAR','SNAPSHOT','SOME','SYSTEM','TABLE','TAG','TDES','TEXT255',
  'TEXT32K','THEN','TIMESTAMP','TO','TOP','TRAILING','TRUE','TRUNCATECOLUMNS',
  'UNION','UNIQUE','UNLOAD','UNNEST','UNPIVOT','UPDATE','USING','VERBOSE',
  'WALLET','WHEN','WHERE','WITH','WITHOUT',
]);

const RS_TYPE_MAP: Record<string, { target: string; safe: boolean; note?: string }> = {
  string:    { target: 'VARCHAR(65535)',  safe: true,  note: 'Default to VARCHAR(65535). Specify max length for better performance.' },
  integer:   { target: 'INTEGER',        safe: true },
  int:       { target: 'INTEGER',        safe: true },
  long:      { target: 'BIGINT',         safe: true },
  float:     { target: 'REAL',           safe: true },
  double:    { target: 'DOUBLE PRECISION',safe: true },
  number:    { target: 'DECIMAL',        safe: true, note: 'Specify DECIMAL(p,s)' },
  boolean:   { target: 'BOOLEAN',        safe: true },
  bool:      { target: 'BOOLEAN',        safe: true },
  bytes:     { target: 'VARBYTE',        safe: true },
  date:      { target: 'DATE',           safe: true },
  datetime:  { target: 'TIMESTAMP',      safe: true },
  timestamp: { target: 'TIMESTAMP',      safe: true },
  array:     { target: 'SUPER',          safe: false, note: 'Avro nested types in Redshift Spectrum NOT supported via AVRO format. Must use Parquet/ORC.' },
  object:    { target: 'SUPER',          safe: true,  note: 'SUPER type only supports CSV/PARQUET tempformat, not AVRO' },
  map:       { target: 'SUPER',          safe: false, note: 'MapType with non-StringType key causes exception in Redshift connector' },
  enum:      { target: 'VARCHAR',        safe: true },
  decimal:   { target: 'DECIMAL',        safe: true },
};

// ─── SPARK ────────────────────────────────────────────────────────────────────
// Source: spark.apache.org/docs/latest/sql-ref-identifier.html

const SPARK_RESERVED = new Set([
  'ALL','ALTER','AND','ANY','ARRAY','AS','AT','AUTHORIZATION','BETWEEN',
  'BOTH','BY','CASE','CAST','CHECK','COLLATE','COLUMN','COMMIT','CONDITION',
  'CONSTRAINT','CORRESPONDING','CREATE','CROSS','CUBE','CURRENT','CURRENT_DATE',
  'CURRENT_DEFAULT_TRANSFORM_GROUP','CURRENT_PATH','CURRENT_ROLE',
  'CURRENT_TIME','CURRENT_TIMESTAMP','CURRENT_TRANSFORM_GROUP_FOR_TYPE',
  'CURRENT_USER','CURSOR','CYCLE','DATE','DAY','DEALLOCATE','DEC','DECIMAL',
  'DECLARE','DEFAULT','DELETE','DESCRIBE','DETERMINISTIC','DISCONNECT',
  'DISTINCT','DOUBLE','DROP','DYNAMIC','EACH','ELEMENT','ELSE','END',
  'ESCAPE','EXCEPT','EXEC','EXECUTE','EXISTS','EXTERNAL','FALSE','FETCH',
  'FILTER','FOR','FOREIGN','FREE','FROM','FULL','FUNCTION','GET','GLOBAL',
  'GRANT','GROUP','GROUPING','HAVING','HOLD','HOUR','IDENTITY','ILIKE',
  'IN','INDICATOR','INNER','INOUT','INSENSITIVE','INSERT','INT','INTEGER',
  'INTERSECT','INTERVAL','INTO','IS','JOIN','LANGUAGE','LARGE','LATERAL',
  'LEADING','LEFT','LIKE','LOCAL','LOCALTIME','LOCALTIMESTAMP','MATCH',
  'MEMBER','MERGE','METHOD','MINUTE','MODIFIES','MONTH','MULTISET',
  'NATIONAL','NATURAL','NCHAR','NCLOB','NEW','NO','NONE','NOT','NULL',
  'NUMERIC','OF','OLD','ON','ONLY','OPEN','OR','ORDER','OUT','OUTER',
  'OUTPUT','OVER','OVERLAPS','PARAMETER','PARTITION','PRECISION','PREPARE',
  'PRIMARY','PROCEDURE','RANGE','READS','REAL','RECURSIVE','REF',
  'REFERENCES','REFERENCING','REGR_AVGX','REGR_AVGY','RELEASE','RESULT',
  'RETURN','RETURNS','REVOKE','RIGHT','ROLLBACK','ROLLUP','ROW','ROWS',
  'SAVEPOINT','SCROLL','SEARCH','SECOND','SELECT','SENSITIVE','SESSION_USER',
  'SET','SIMILAR','SMALLINT','SOME','SPECIFIC','SPECIFICTYPE','SQL',
  'SQLEXCEPTION','SQLSTATE','SQLWARNING','START','STATIC','SUBMULTISET',
  'SYMMETRIC','SYSTEM','SYSTEM_USER','TABLE','TABLESAMPLE','THEN','TIME',
  'TIMESTAMP','TIMEZONE_HOUR','TIMEZONE_MINUTE','TO','TRAILING','TRANSLATION',
  'TREAT','TRIGGER','TRUE','UNION','UNIQUE','UNKNOWN','UNNEST','UPDATE',
  'UPPER','USER','USING','VALUE','VALUES','VARCHAR','VARYING','WHEN',
  'WHENEVER','WHERE','WIDTH_BUCKET','WINDOW','WITH','WITHIN','WITHOUT',
  'YEAR',
  // Spark-specific extras confirmed broken
  'SELECT','INDEX','OFFSET','REPLACE','MAP','STRUCT','ARRAY',
]);

const SPARK_TYPE_MAP: Record<string, { target: string; safe: boolean; note?: string }> = {
  string:    { target: 'StringType',     safe: true },
  integer:   { target: 'IntegerType',    safe: true },
  int:       { target: 'IntegerType',    safe: true },
  long:      { target: 'LongType',       safe: true },
  float:     { target: 'FloatType',      safe: true },
  double:    { target: 'DoubleType',     safe: true },
  number:    { target: 'DoubleType',     safe: true, note: 'Use DecimalType(p,s) for exact precision' },
  boolean:   { target: 'BooleanType',    safe: true },
  bool:      { target: 'BooleanType',    safe: true },
  bytes:     { target: 'BinaryType',     safe: true },
  date:      { target: 'DateType',       safe: true },
  datetime:  { target: 'TimestampType',  safe: true },
  timestamp: { target: 'TimestampType',  safe: true },
  array:     { target: 'ArrayType',      safe: true },
  object:    { target: 'StructType',     safe: true },
  record:    { target: 'StructType',     safe: true },
  map:       { target: 'MapType',        safe: true,  note: 'MapType key must be StringType for Redshift connector' },
  enum:      { target: 'StringType',     safe: true },
  decimal:   { target: 'DecimalType',    safe: true, note: 'Specify DecimalType(precision, scale)' },
  null:      { target: 'NullType',       safe: true },
};

// ─── HIVE ─────────────────────────────────────────────────────────────────────

const HIVE_RESERVED = new Set([
  'ALL','ALTER','AND','ARRAY','AS','AUTHORIZATION','BETWEEN','BIGINT',
  'BINARY','BOOLEAN','BOTH','BY','CASE','CAST','CHAR','COLUMN','CONF',
  'CREATE','CROSS','CUBE','CURRENT','CURRENT_DATE','CURRENT_TIMESTAMP',
  'CURSOR','DATABASE','DATE','DECIMAL','DELETE','DESCRIBE','DISTINCT',
  'DOUBLE','DROP','ELSE','END','EXCHANGE','EXISTS','EXTENDED','EXTERNAL',
  'FALSE','FETCH','FLOAT','FOLLOWING','FOR','FROM','FULL','FUNCTION',
  'GRANT','GROUP','GROUPING','HAVING','IF','IMPORT','IN','INNER',
  'INSERT','INT','INTERSECT','INTERVAL','INTO','IS','JOIN','LATERAL',
  'LEFT','LESS','LIKE','LOCAL','MACRO','MAP','MORE','NONE','NOT',
  'NULL','OF','ON','OR','ORDER','OUT','OUTER','OVER','PARTIALSCAN',
  'PARTITION','PERCENT','PRECEDING','PRESERVE','PRIMARY','PROCEDURE',
  'RANGE','READS','REDUCE','REFERENCES','REGEXP','REVOKE','RIGHT',
  'RLIKE','ROLLUP','ROW','ROWS','SELECT','SET','SMALLINT','TABLE',
  'TABLESAMPLE','THEN','TIMESTAMP','TO','TRANSFORM','TRIGGER','TRUE',
  'TRUNCATE','UNBOUNDED','UNION','UNIQUEJOIN','UPDATE','USER','USING',
  'UTC_TMESTAMP','VALUES','VARCHAR','VIEWS','WHEN','WHERE','WINDOW',
  'WITH',
  // Confirmed broken from community reports
  'USER','VALUES','INDEX','OFFSET','SELECT',
]);

// ─── POSTGRES ─────────────────────────────────────────────────────────────────

const POSTGRES_RESERVED = new Set([
  'ALL','ANALYSE','ANALYZE','AND','ANY','ARRAY','AS','ASC','ASYMMETRIC',
  'AUTHORIZATION','BETWEEN','BINARY','BOTH','CASE','CAST','CHECK',
  'COLLATE','COLLATION','COLUMN','CONCURRENTLY','CONSTRAINT','CREATE',
  'CROSS','CURRENT_CATALOG','CURRENT_DATE','CURRENT_ROLE',
  'CURRENT_SCHEMA','CURRENT_TIME','CURRENT_TIMESTAMP','CURRENT_USER',
  'DEFAULT','DEFERRABLE','DESC','DISTINCT','DO','ELSE','END','EXCEPT',
  'FALSE','FETCH','FOR','FOREIGN','FREEZE','FROM','FULL','GRANT',
  'GROUP','HAVING','ILIKE','IN','INITIALLY','INNER','INTERSECT','INTO',
  'IS','ISNULL','JOIN','LATERAL','LEADING','LEFT','LIKE','LIMIT',
  'LOCALTIME','LOCALTIMESTAMP','NATURAL','NOT','NOTNULL','NULL',
  'OFFSET','ON','ONLY','OR','ORDER','OUTER','OVERLAPS','PLACING',
  'PRIMARY','REFERENCES','RETURNING','RIGHT','SELECT','SESSION_USER',
  'SIMILAR','SOME','SYMMETRIC','TABLE','TABLESAMPLE','THEN','TO',
  'TRAILING','TRUE','UNION','UNIQUE','USER','USING','VARIADIC',
  'VERBOSE','WHEN','WHERE','WINDOW','WITH',
  // Extra confirmed broken
  'VALUE','VALUES','INDEX','TIMESTAMP','DATE','TIME','REPLACE',
]);

// ─── Universal checker ────────────────────────────────────────────────────────

function buildChecker(
  system: SystemId,
  reserved: Set<string>,
  typeMap: Record<string, { target: string; safe: boolean; note?: string }>,
) {
  return function check(fields: SchemaField[]): { issues: Issue[]; mapping: TypeMappingEntry[] } {
    const issues: Issue[] = [];
    const mapping: TypeMappingEntry[] = [];

    function checkField(field: SchemaField, path = '') {
      const fullPath = path ? `${path}.${field.name}` : field.name;
      const upper = field.name.toUpperCase();

      if (reserved.has(upper)) {
        issues.push({
          system,
          field: fullPath,
          code: 'RESERVED_KEYWORD',
          severity: 'CRITICAL',
          message: `'${field.name}' is a reserved keyword in ${system}`,
          detail: `Using reserved keywords as column names causes query failures, broken BI dashboards, and silent ETL errors.`,
          suggestion: `Rename to '${field.name}_value', '${field.name}_col', or prefix with domain context.`,
        });
      }

      if (/^[0-9]/.test(field.name)) {
        issues.push({
          system,
          field: fullPath,
          code: 'STARTS_WITH_NUMBER',
          severity: 'CRITICAL',
          message: `'${field.name}' starts with a digit — invalid in ${system}`,
          detail: `Column names must start with a letter or underscore in ${system}.`,
          suggestion: `Rename to '_${field.name}' or 'col_${field.name}'`,
        });
      }

      const sourceType = field.type.toLowerCase();
      const mapped = typeMap[sourceType];
      if (!mapped) {
        issues.push({
          system,
          field: fullPath,
          code: 'UNSUPPORTED_TYPE',
          severity: 'WARNING',
          message: `Type '${field.type}' unknown in ${system}`,
          detail: `No known mapping for '${field.type}' in ${system}.`,
          suggestion: 'Use STRING as fallback or check system documentation.',
        });
        mapping.push({ field: fullPath, sourceType: field.type, targetType: 'UNKNOWN', safe: false });
      } else {
        if (!mapped.safe) {
          issues.push({
            system,
            field: fullPath,
            code: 'UNSUPPORTED_TYPE',
            severity: 'CRITICAL',
            message: `Type '${field.type}' → '${mapped.target}' in ${system} is UNSAFE`,
            detail: mapped.note ?? `This type causes runtime failures in ${system}.`,
            suggestion: 'Restructure the field or use a safer type.',
          });
        } else if (mapped.note) {
          issues.push({
            system,
            field: fullPath,
            code: 'TYPE_PRECISION_LOSS',
            severity: 'INFO',
            message: `'${field.type}' → '${mapped.target}' in ${system}`,
            detail: mapped.note,
            suggestion: 'Review precision requirements.',
          });
        }
        mapping.push({ field: fullPath, sourceType: field.type, targetType: mapped.target, safe: mapped.safe, note: mapped.note });
      }

      // Recurse
      if (field.fields) field.fields.forEach(f => checkField(f, fullPath));
      if (field.items?.fields) field.items.fields.forEach(f => checkField(f, `${fullPath}[]`));
    }

    fields.forEach(f => checkField(f));
    return { issues, mapping };
  };
}

export const checkSnowflake = buildChecker('snowflake', SNOWFLAKE_RESERVED, SF_TYPE_MAP);
export const checkRedshift  = buildChecker('redshift',  REDSHIFT_RESERVED,  RS_TYPE_MAP);
export const checkSpark     = buildChecker('spark',     SPARK_RESERVED,     SPARK_TYPE_MAP);
export const checkHive      = buildChecker('hive',      HIVE_RESERVED,      SPARK_TYPE_MAP); // Hive types ≈ Spark types
export const checkPostgres  = buildChecker('postgres',  POSTGRES_RESERVED,  {
  string:    { target: 'TEXT',        safe: true },
  integer:   { target: 'INTEGER',     safe: true },
  int:       { target: 'INTEGER',     safe: true },
  long:      { target: 'BIGINT',      safe: true },
  float:     { target: 'REAL',        safe: true },
  double:    { target: 'DOUBLE PRECISION', safe: true },
  number:    { target: 'NUMERIC',     safe: true, note: 'Specify NUMERIC(p,s)' },
  boolean:   { target: 'BOOLEAN',     safe: true },
  bool:      { target: 'BOOLEAN',     safe: true },
  bytes:     { target: 'BYTEA',       safe: true },
  date:      { target: 'DATE',        safe: true },
  datetime:  { target: 'TIMESTAMP',   safe: true },
  timestamp: { target: 'TIMESTAMP',   safe: true },
  array:     { target: 'ARRAY',       safe: true, note: 'Postgres supports typed arrays e.g. TEXT[]' },
  object:    { target: 'JSONB',       safe: true, note: 'Use JSONB for queryable nested objects' },
  map:       { target: 'JSONB',       safe: true },
  enum:      { target: 'TEXT',        safe: true },
  decimal:   { target: 'NUMERIC',     safe: true },
});

// Kafka Avro specific checks
export function checkKafkaAvro(fields: SchemaField[]): { issues: Issue[]; mapping: TypeMappingEntry[] } {
  const issues: Issue[] = [];
  const mapping: TypeMappingEntry[] = [];

  function checkField(field: SchemaField, path = '') {
    const fullPath = path ? `${path}.${field.name}` : field.name;

    // Avro names must match [A-Za-z_][A-Za-z0-9_]*
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name)) {
      issues.push({
        system: 'kafka_avro',
        field: fullPath,
        code: 'NAMING_VIOLATION',
        severity: 'CRITICAL',
        message: `'${field.name}' is not a valid Avro name`,
        detail: 'Avro names must match [A-Za-z_][A-Za-z0-9_]*. Special chars, spaces, and leading digits are not allowed.',
        suggestion: `Rename to '${field.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, '_$&')}'`,
        docUrl: 'https://avro.apache.org/docs/current/specification/#names',
      });
    }

    // Union type with more than null + one type is problematic for many consumers
    if (field.type === 'union' && field.fields && field.fields.length > 2) {
      issues.push({
        system: 'kafka_avro',
        field: fullPath,
        code: 'AVRO_UNION_UNSUPPORTED',
        severity: 'WARNING',
        message: `Complex union type in '${field.name}' may break downstream consumers`,
        detail: 'Avro unions with more than [null, T] are valid in Kafka but unsupported by Hive, Spark external tables, and many ETL tools.',
        suggestion: 'Simplify to ["null", "string"] or use a RECORD type instead.',
      });
    }

    mapping.push({ field: fullPath, sourceType: field.type, targetType: field.type, safe: true });

    if (field.fields) field.fields.forEach(f => checkField(f, fullPath));
    if (field.items?.fields) field.items.fields.forEach(f => checkField(f, `${fullPath}[]`));
  }

  fields.forEach(f => checkField(f));
  return { issues, mapping };
}
