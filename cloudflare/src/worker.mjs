// Cloudflare entry point exports only the Worker handler.
import { createWorker } from './core.mjs';
export default createWorker();
