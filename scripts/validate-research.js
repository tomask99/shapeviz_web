import {readFile,stat} from 'node:fs/promises';
import {validateResearchImport} from '../src/research/validation.js';
import {MAX_RESEARCH_BYTES} from '../src/research/schema.js';

try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run research:validate -- <research.json>');
  const file = process.argv[2];
  if ((await stat(file)).size > MAX_RESEARCH_BYTES) throw new Error(`Research import exceeds ${MAX_RESEARCH_BYTES} bytes.`);
  const result = validateResearchImport(await readFile(file,'utf8'));
  console.log(`${result.valid_count}/${result.count} valid research candidates. Validation only; nothing was saved.`);
  for (const row of result.rows) {
    for (const error of row.errors) console.error(`Row ${row.row} ERROR [${error.code}] ${error.message}`);
    for (const warning of row.warnings) console.warn(`Row ${row.row} WARNING [${warning.code}] ${warning.message}`);
  }
  if (result.valid_count !== result.count) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
