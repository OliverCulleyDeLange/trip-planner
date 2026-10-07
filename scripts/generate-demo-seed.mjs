import { writeFileSync } from 'node:fs';
import { buildDemoTrip } from '../src/lib/trip-planner/demo.ts';
import { relationalTableColumns, tripColumns, tripRelationalRows, tripRow } from '../src/lib/server/database.ts';

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, columns, rows) {
  if (!rows.length) return '';
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${rows.map(row => `  (${row.map(sqlLiteral).join(', ')})`).join(',\n')};\n`;
}

const timestamp = '2026-10-04T00:00:00.000Z';
const trip = buildDemoTrip('demo');
trip.revision = 1;
trip.createdAt = timestamp;
trip.updatedAt = timestamp;
const rows = tripRelationalRows(trip);
const seed = [insert('trips', tripColumns, [tripRow(trip)])]
  .concat(Object.entries(relationalTableColumns).map(([table, columns]) => insert(table, columns, rows[table])))
  .filter(Boolean)
  .join('\n');

writeFileSync(new URL('./demo-seed.sql', import.meta.url), seed);
