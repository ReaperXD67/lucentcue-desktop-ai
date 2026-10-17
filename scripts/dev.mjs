import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const server = await createServer({ server: { host: '127.0.0.1', port: 5173 } });
await build({ entryPoints: ['desktop/main.ts', 'desktop/preload.ts'], outdir: 'dist-desktop',
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', outExtension: { '.js': '.cjs' },
  external: ['electron', 'playwright', 'playwright-core'], sourcemap: true });
await server.listen();
server.printUrls();
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' } });
let stopping = false;
async function stop(code = 0) { if (stopping) return; stopping = true; child.kill(); await server.close(); process.exit(code); }
child.on('exit', code => void stop(code ?? 0));
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
