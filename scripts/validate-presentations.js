import path from 'node:path';
import { discoverProjects } from '../src/presentations/registry.js';

const root = path.resolve('presentations');
const projects = await discoverProjects(root);
for (const project of projects) console.log(`${project.slug}: ${project.status}, ${project.access.mode}, ${project.analytics.enabled ? 'analytics on' : 'analytics off'}`);
console.log(`Validated ${projects.length} presentation project${projects.length === 1 ? '' : 's'}.`);
