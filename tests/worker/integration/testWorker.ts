import { env } from 'cloudflare:test';
import worker from '../../../worker/index.js';
import type { Env } from '../../../worker/types.js';

export const SELF = {
  fetch(request: Request): Promise<Response> {
    return worker.fetch(request, env as Env);
  },
};
