import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const directory = new URL('../supabase/migrations/', import.meta.url);

test('active migrations have unique versions and retain the reconciled production baseline', async () => {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql'));
  const versions = files.map((file) => file.split('_')[0]);
  assert.ok(files.every((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file)));
  assert.equal(new Set(versions).size, versions.length);
  for (const file of [
    '20260921085329_presentation_audio_formats.sql',
    '20260921112515_telegram_visit_notifications.sql',
    '20260921144920_presentation_cta_clicks.sql',
    '20260922133053_telegram_website_click_notifications.sql',
  ]) assert.ok(files.includes(file), `Missing reconciled migration: ${file}`);
  for (const version of ['20260921082743', '20260921085314', '20260921112336', '20260922132801']) {
    assert.ok(!versions.includes(version), `Retired or superseded version returned: ${version}`);
  }
});

test('historical presentation wipe stays outside the executable migration directory', async () => {
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql'))) {
    const sql = (await readFile(new URL(file, directory), 'utf8')).replace(/--[^\r\n]*/g, '');
    // Regression guard for the retired statement, not a general SQL safety parser.
    assert.doesNotMatch(sql, /delete\s+from\s+(?:public\.)?presentation_projects\s*;/i, file);
  }
  const archived = await readFile(new URL('../supabase/retired-migrations/20260921082743_remove_all_presentation_data.sql.disabled', import.meta.url), 'utf8');
  assert.match(archived, /RETIRED/);
});
