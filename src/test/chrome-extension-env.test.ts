import { describe, it, expect } from 'vitest';
import { ChromeExtensionEnv } from './chrome-extension-env';
import { HarnessRuntime } from './harness-runtime';
import { HarnessActions } from './harness-actions';

describe('ChromeExtensionEnv extensions', () => {
  it('executeScript with func runs the function with self bound to the frame window', async () => {
    const env = new ChromeExtensionEnv();
    const runtime = new HarnessRuntime(env);
    const actions = new HarnessActions(runtime);
    const frame = actions.createTab({ url: 'https://a.example/', title: 'A' });
    const bg = env.createBackgroundChrome();

    const origSelf = (globalThis as any).self;

    await bg.scripting.executeScript({
      target: { tabId: frame.tab.id, frameIds: [0] },
      func: (id: string) => { (self as any).__test_marker__ = id; },
      args: ['HELLO'],
    });

    expect((frame.window as any).__test_marker__).toBe('HELLO');
    // self was restored to its original value
    expect((globalThis as any).self).toBe(origSelf);
    // the test runner's own self was NOT mutated
    expect((origSelf as any).__test_marker__).toBeUndefined();
  });

  it('storage.session.get returns persisted values; set persists them', async () => {
    const env = new ChromeExtensionEnv();
    const bg = env.createBackgroundChrome();
    await bg.storage.session.set({ swStartupId: 'abc' });
    const result = await bg.storage.session.get(['swStartupId']);
    expect(result).toEqual({ swStartupId: 'abc' });
  });
});
