import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { runPreflight } from '../engine.js';
import type { SchemaInput, SystemId } from '../types.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Schema Preflight',
    version: '1.0.0',
    description: 'Pre-flight schema validator for BigQuery, Snowflake, Redshift, Spark, Hive, Postgres',
    supportedSystems: ['bigquery','snowflake','redshift','spark','hive','postgres','mysql','kafka_avro'],
    timestamp: new Date().toISOString(),
  });
});

// ─── Main endpoint: preflight check ──────────────────────────────────────────

app.post('/preflight', (req, res) => {
  try {
    const input = req.body as SchemaInput;

    if (!input.name)   return res.status(400).json({ error: 'schema name is required' });
    if (!input.fields?.length) return res.status(400).json({ error: 'fields array is required and must not be empty' });
    if (!input.targetSystems?.length) return res.status(400).json({ error: 'targetSystems array is required' });

    // Default sourceFormat
    if (!input.sourceFormat) input.sourceFormat = 'json';

    const report = runPreflight(input);
    const status  = report.overallSafe ? 200 : 422;
    res.status(status).json(report);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Quick field name check ───────────────────────────────────────────────────

app.post('/check-name', (req, res) => {
  try {
    const { name, systems } = req.body as { name: string; systems: SystemId[] };
    if (!name) return res.status(400).json({ error: 'name is required' });

    const targetSystems = systems ?? ['bigquery','snowflake','redshift','spark','hive','postgres'];

    const report = runPreflight({
      name: 'QuickCheck',
      sourceFormat: 'json',
      targetSystems,
      fields: [{ name, type: 'string' }],
    });

    const issues = report.systems.flatMap(s => s.issues);
    res.json({
      name,
      safe: issues.length === 0,
      issues,
      affectedSystems: [...new Set(issues.map(i => i.system))],
      suggestion: report.suggestedFixes[0]?.suggestedName,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── List all reserved keywords per system ────────────────────────────────────

app.get('/reserved-keywords/:system', async (req, res) => {
  try {
    const system = req.params.system as SystemId;
    const { BIGQUERY_RESERVED_KEYWORDS } = await import('../systems/bigquery.js');
    const { checkSnowflake } = await import('../systems/others.js');

    const keywordMap: Record<string, string[]> = {
      bigquery: [...BIGQUERY_RESERVED_KEYWORDS],
    };

    const keywords = keywordMap[system];
    if (!keywords) return res.status(404).json({ error: `System '${system}' not found or keywords not exposed` });

    res.json({ system, count: keywords.length, keywords: keywords.sort() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Suggest safe names ───────────────────────────────────────────────────────

app.post('/suggest-name', (req, res) => {
  try {
    const { name } = req.body as { name: string };
    if (!name) return res.status(400).json({ error: 'name is required' });

    const allSystems: SystemId[] = ['bigquery','snowflake','redshift','spark','hive','postgres','mysql','kafka_avro'];

    const report = runPreflight({
      name: 'SuggestCheck',
      sourceFormat: 'json',
      targetSystems: allSystems,
      fields: [{ name, type: 'string' }],
    });

    const suggestions = [
      `${name}_value`,
      `${name}_col`,
      `${name}_field`,
      `event_${name}`,
      `data_${name}`,
      `${name.toLowerCase()}_attr`,
    ];

    const safeSuggestions = suggestions.map(s => {
      const r = runPreflight({
        name: 'Check',
        sourceFormat: 'json',
        targetSystems: allSystems,
        fields: [{ name: s, type: 'string' }],
      });
      return {
        name: s,
        universallySafe: r.overallSafe,
        criticals: r.summary.totalCriticals,
      };
    }).filter(s => s.universallySafe);

    res.json({
      originalName: name,
      safe: report.overallSafe,
      affectedSystems: [...new Set(report.systems.flatMap(s => s.issues.map(i => i.system)))],
      safeSuggestions: safeSuggestions.map(s => s.name),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│        Schema Preflight is running 🛫              │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  API:      http://localhost:${PORT}                   │`);
  console.log(`│  Health:   http://localhost:${PORT}/health            │`);
  console.log(`│  Preflight:http://localhost:${PORT}/preflight         │`);
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│  Systems: BigQuery Snowflake Redshift Spark         │');
  console.log('│           Hive Postgres MySQL Kafka/Avro            │');
  console.log('└─────────────────────────────────────────────────────┘\n');
});

export default app;
