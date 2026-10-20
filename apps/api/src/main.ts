import 'reflect-metadata';
import { loadEnv } from './config/env.js';
import { createApp } from './bootstrap.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.API_PORT, '0.0.0.0');
