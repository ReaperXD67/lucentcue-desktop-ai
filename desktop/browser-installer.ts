import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FAILED = 'Chromium could not be installed. Check your internet connection and free disk space, then try again. Your system may also need Chromium runtime libraries.';
const CANCELLED = 'The browser installation was cancelled because LucentCue is closing.';
const TIMED_OUT = 'The Chromium download took longer than 10 minutes and was stopped. Check your connection and try again.';

/** Node processes need the physical path; they cannot execute a CLI inside ASAR. */
export function playwrightCLIPath(packageJsonPath: string): string {
  return join(dirname(packageJsonPath), 'cli.js').replace(/([\\/])app\.asar(?=[\\/])/i, '$1app.asar.unpacked');
}

async function killTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // Playwright can create a download worker. Kill only this helper's process tree.
    await new Promise<void>(resolve => {
      let ended = false;
      const finish = () => { if (ended) return; ended = true; clearTimeout(timer); resolve(); };
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill(); killer.kill(); finish(); }, 2000);
      killer.once('error', () => { child.kill(); finish(); });
      killer.once('close', finish);
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { child.kill('SIGKILL'); }
  }
}

export interface BrowserInstallerOptions {
  executable: string;
  resolvePackage(): string;
  /** Test seams; production uses the fixed Node/Electron child process implementation. */
  spawnProcess?: typeof spawn;
  checkAccess?: typeof access;
  verifyInstalled?: () => Promise<boolean>;
  terminate?: (child: ChildProcess) => Promise<void>;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export class BrowserInstaller {
  private task?: Promise<void>;
  private stopJob?: () => Promise<void>;
  private closed = false;
  constructor(private readonly options: BrowserInstallerOptions) {}

  install(): Promise<void> {
    if (this.closed) return Promise.reject(new Error(CANCELLED));
    // Repeated explicit clicks share the same download, never start parallel installers.
    if (!this.task) this.task = this.run().finally(() => { this.task = undefined; });
    return this.task;
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.stopJob?.();
  }

  private async run(): Promise<void> {
    let cli: string;
    try {
      cli = playwrightCLIPath(this.options.resolvePackage());
      await (this.options.checkAccess || access)(cli);
    } catch { throw new Error('The bundled browser installer is unavailable. Reinstall LucentCue or use a complete release build.'); }
    if (this.closed) throw new Error(CANCELLED);
    const launch = this.options.spawnProcess || spawn;
    let child: ChildProcess;
    try {
      child = launch(this.options.executable, [cli, 'install', 'chromium'], {
        cwd: dirname(cli), windowsHide: true, shell: false, stdio: 'ignore', detached: process.platform !== 'win32',
        env: { ...(this.options.environment || process.env), ELECTRON_RUN_AS_NODE: '1' },
      });
    } catch { throw new Error(FAILED); }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let termination: Promise<void> | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.stopJob = undefined;
        if (error) reject(error); else resolve();
      };
      const terminate = (error: Error): Promise<void> => {
        if (settled) return Promise.resolve();
        if (!termination) termination = (this.options.terminate || killTree)(child).catch(() => undefined).then(() => finish(error));
        return termination;
      };
      const timer = setTimeout(() => { void terminate(new Error(TIMED_OUT)); }, this.options.timeoutMs ?? 10 * 60_000);
      this.stopJob = () => terminate(new Error(CANCELLED));
      child.once('error', () => finish(new Error(FAILED)));
      child.once('close', code => { if (!termination) finish(code === 0 ? undefined : new Error(FAILED)); });
    });
    if (this.options.verifyInstalled && !await this.options.verifyInstalled()) throw new Error('The installer finished without a compatible Chromium executable. This build may not support the browser installer; use a complete supported release.');
  }
}
