import { describe, it, expect, vi } from 'vitest';
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

    await bg.scripting.executeScript({
      target: { tabId: frame.tab.id, frameIds: [0] },
      func: ((id: string) => { (self as any).__test_marker__ = id; }) as any,
      args: ['HELLO'] as any,
    } as any);

    expect((frame.window as any).__test_marker__).toBe('HELLO');
  });

  it('storage.session.get returns persisted values; set persists them', async () => {
    const env = new ChromeExtensionEnv();
    const bg = env.createBackgroundChrome();
    await (bg as any).storage.session.set({ swStartupId: 'abc' });
    const result = await (bg as any).storage.session.get(['swStartupId']);
    expect(result).toEqual({ swStartupId: 'abc' });
  });
});
