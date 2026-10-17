import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BrowserInstaller, playwrightCLIPath } from '../desktop/browser-installer';
import type { BrowserInstallerOptions } from '../desktop/browser-installer';

const packagePath = join(tmpdir(), 'lucentcue', 'node_modules', 'playwright', 'package.json');
function fixture(overrides: Partial<BrowserInstallerOptions> = {}) {
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    kill: vi.fn(),
  }) as unknown as ChildProcess;
  const launch = vi.fn(() => child);
  const terminate = vi.fn(async () => undefined);
  const verifyInstalled = vi.fn(async () => true);
  const installer = new BrowserInstaller({
    executable: 'electron.exe',
    resolvePackage: () => packagePath,
    spawnProcess: launch as unknown as BrowserInstallerOptions['spawnProcess'],
    checkAccess: vi.fn(async () => undefined),
    terminate,
    verifyInstalled,
    environment: { PATH: 'example-system-path' },
    ...overrides,
  });
  return { child, launch, terminate, verifyInstalled, installer };
}
afterEach(() => vi.useRealTimers());

describe('optional browser installer', () => {
  it('resolves physical development and unpacked packaged CLI paths', () => {
    expect(playwrightCLIPath(packagePath)).toBe(
      join(tmpdir(), 'lucentcue', 'node_modules', 'playwright', 'cli.js'),
    );
    expect(
      playwrightCLIPath(
        join(tmpdir(), 'resources', 'app.asar', 'node_modules', 'playwright', 'package.json'),
      ),
    ).toBe(
      join(tmpdir(), 'resources', 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js'),
    );
  });
  it('downloads only after explicit invocation, with fixed arguments and no shell or visible console', async () => {
    const { installer, child, launch, verifyInstalled } = fixture();
    expect(launch).not.toHaveBeenCalled();
    const result = installer.install();
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    const [executable, args, options] = launch.mock.calls[0] as unknown as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(executable).toBe('electron.exe');
    expect(args).toEqual([playwrightCLIPath(packagePath), 'install', 'chromium']);
    expect(options).toMatchObject({
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: { ELECTRON_RUN_AS_NODE: '1', PATH: 'example-system-path' },
    });
    child.emit('close', 0);
    await result;
    expect(verifyInstalled).toHaveBeenCalledOnce();
  });
  it('shares one active download across simultaneous requests', async () => {
    const { installer, child, launch } = fixture();
    const first = installer.install();
    const second = installer.install();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    child.emit('close', 0);
    await Promise.all([first, second]);
  });
  it('does not expose raw child process errors', async () => {
    const { installer, child, launch } = fixture();
    const result = installer.install();
    const assertion = expect(result).rejects.toThrow('Chromium could not be installed');
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    child.emit('error', new Error('private secret from an OS failure'));
    await assertion;
  });
  it('kills a timed-out helper and permits an explicit retry', async () => {
    vi.useFakeTimers();
    const { installer, launch, terminate } = fixture({ timeoutMs: 100 });
    const result = installer.install();
    const assertion = expect(result).rejects.toThrow('longer than 10 minutes');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(terminate).toHaveBeenCalledOnce();
    const second = installer.install();
    const retryAssertion = expect(second).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(1);
    await installer.stop();
    await retryAssertion;
    expect(launch).toHaveBeenCalledTimes(2);
  });
  it('kills an installation on Quit and rejects later starts', async () => {
    const { installer, launch, terminate } = fixture();
    const result = installer.install();
    const assertion = expect(result).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    await installer.stop();
    await assertion;
    expect(terminate).toHaveBeenCalledOnce();
    await expect(installer.install()).rejects.toThrow('cancelled');
    expect(launch).toHaveBeenCalledOnce();
  });
  it('fails clearly when the bundle omits the physical CLI', async () => {
    const { installer, launch } = fixture({
      checkAccess: async () => {
        throw new Error('missing');
      },
    });
    await expect(installer.install()).rejects.toThrow('bundled browser installer is unavailable');
    expect(launch).not.toHaveBeenCalled();
  });
  it('does not report success when a packaged runtime did not install Chromium', async () => {
    const { installer, child, launch } = fixture({ verifyInstalled: async () => false });
    const result = installer.install();
    const assertion = expect(result).rejects.toThrow('without a compatible Chromium executable');
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    child.emit('close', 0);
    await assertion;
  });
});
