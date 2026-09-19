import { createContactHandler } from '../src/contact.js';

export default createContactHandler({ env: process.env, send: fetch });
