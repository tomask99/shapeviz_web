import path from 'node:path';
import { createPresentationEventHandler } from '../src/presentations/events.js';

const handler = createPresentationEventHandler({ presentationsRoot: path.resolve('presentations') });
export default handler;
