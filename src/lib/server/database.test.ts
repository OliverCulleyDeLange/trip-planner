import { describe, expect, it } from 'vitest';
import { guardedInsertSql, relationalTableColumns } from './database';

describe('D1 guarded inserts', () => {
  it('uses a VALUES CTE instead of a compound SELECT for multiple participants', () => {
    const rowCount = 5;
    const sql = guardedInsertSql('participants', rowCount);

    expect(sql).toContain('WITH input');
    expect(sql).toContain('VALUES');
    expect(sql).not.toContain('UNION');
    expect(sql.match(/\?/g)).toHaveLength(relationalTableColumns.participants.length * rowCount + 2);
  });
});
