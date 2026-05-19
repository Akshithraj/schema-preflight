import { randomUUID } from 'crypto';
import type {
  SchemaInput, PreflightReport, SystemResult, Issue, SuggestedFix, SystemId,
} from './types.js';
import { checkBigQuery } from './systems/bigquery.js';
import {
  checkSnowflake, checkRedshift, checkSpark,
  checkHive, checkPostgres, checkKafkaAvro,
} from './systems/others.js';

// ─── Pre-flight Engine ────────────────────────────────────────────────────────
//
// This is the core of the product.
// Given a schema + list of target systems, run all checks simultaneously
// and return a complete, actionable report.

const CHECKERS: Record<SystemId, (fields: any[]) => { issues: Issue[]; mapping: any[] }> = {
  bigquery:   checkBigQuery,
  snowflake:  checkSnowflake,
  redshift:   checkRedshift,
  spark:      checkSpark,
  hive:       checkHive,
  postgres:   checkPostgres,
  mysql:      checkPostgres, // MySQL reserved words are very similar to Postgres
  kafka_avro: checkKafkaAvro,
};

export function runPreflight(input: SchemaInput): PreflightReport {
  const systemResults: SystemResult[] = [];
  const allIssues: Issue[] = [];

  // Run every requested system in parallel (sync — all in-memory lookups)
  for (const system of input.targetSystems) {
    const checker = CHECKERS[system];
    if (!checker) continue;

    const { issues, mapping } = checker(input.fields);
    const criticals = issues.filter(i => i.severity === 'CRITICAL').length;
    const warnings  = issues.filter(i => i.severity === 'WARNING').length;
    const infos     = issues.filter(i => i.severity === 'INFO').length;

    systemResults.push({
      system,
      compatible: criticals === 0,
      issues,
      typeMapping: mapping,
      criticals,
      warnings,
      infos,
    });

    allIssues.push(...issues);
  }

  // Find issues that appear in ALL target systems (global issues)
  const fieldIssueCounts = new Map<string, number>();
  for (const issue of allIssues) {
    const key = `${issue.field}::${issue.code}`;
    fieldIssueCounts.set(key, (fieldIssueCounts.get(key) ?? 0) + 1);
  }

  const globalIssues = allIssues.filter(issue => {
    const key = `${issue.field}::${issue.code}`;
    return (fieldIssueCounts.get(key) ?? 0) >= input.targetSystems.length;
  });

  // De-duplicate global issues
  const seen = new Set<string>();
  const dedupedGlobal = globalIssues.filter(i => {
    const key = `${i.field}::${i.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Generate suggested fixes
  const suggestedFixes = buildSuggestedFixes(allIssues, input.targetSystems);

  const totalCriticals = systemResults.reduce((s, r) => s + r.criticals, 0);
  const totalWarnings  = systemResults.reduce((s, r) => s + r.warnings, 0);
  const totalInfos     = systemResults.reduce((s, r) => s + r.infos, 0);

  return {
    id: randomUUID(),
    schemaName: input.name,
    sourceFormat: input.sourceFormat,
    checkedAt: new Date(),
    overallSafe: totalCriticals === 0,
    summary: {
      systemsChecked: input.targetSystems.length,
      systemsPassed: systemResults.filter(r => r.compatible).length,
      systemsFailed: systemResults.filter(r => !r.compatible).length,
      totalCriticals,
      totalWarnings,
      totalInfos,
    },
    systems: systemResults,
    globalIssues: dedupedGlobal,
    suggestedFixes,
  };
}

// ─── Build suggested renames ──────────────────────────────────────────────────

function buildSuggestedFixes(issues: Issue[], targetSystems: SystemId[]): SuggestedFix[] {
  const fixMap = new Map<string, { affectedSystems: Set<SystemId>; reasons: string[] }>();

  for (const issue of issues) {
    if (issue.code !== 'RESERVED_KEYWORD' && issue.code !== 'NAMING_VIOLATION' && issue.code !== 'STARTS_WITH_NUMBER') continue;

    if (!fixMap.has(issue.field)) {
      fixMap.set(issue.field, { affectedSystems: new Set(), reasons: [] });
    }
    const entry = fixMap.get(issue.field)!;
    entry.affectedSystems.add(issue.system);
    entry.reasons.push(issue.message);
  }

  const fixes: SuggestedFix[] = [];

  for (const [field, { affectedSystems, reasons }] of fixMap) {
    const fieldName = field.split('.').pop() ?? field;

    // Generate safe alternatives
    const suggestions = [
      `${fieldName}_value`,
      `${fieldName}_col`,
      `event_${fieldName}`,
      `data_${fieldName}`,
    ].filter(s => isUniversallySafe(s, targetSystems));

    fixes.push({
      field,
      currentName: fieldName,
      suggestedName: suggestions[0] ?? `${fieldName}_field`,
      reason: [...new Set(reasons)][0] ?? 'Reserved keyword or naming violation',
      affectedSystems: [...affectedSystems],
    });
  }

  return fixes;
}

function isUniversallySafe(name: string, systems: SystemId[]): boolean {
  // Quick check — just verify it doesn't match common cross-system keywords
  const UNIVERSAL_RESERVED = new Set([
    'SELECT','FROM','WHERE','AND','OR','NOT','NULL','TRUE','FALSE',
    'TABLE','COLUMN','CREATE','DROP','ALTER','INSERT','UPDATE','DELETE',
    'INDEX','VALUE','VALUES','ORDER','GROUP','HAVING','LIMIT','OFFSET',
  ]);
  return !UNIVERSAL_RESERVED.has(name.toUpperCase());
}
