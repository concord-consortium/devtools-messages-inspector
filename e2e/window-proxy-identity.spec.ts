import { test, expect } from '@playwright/test';

// Test whether WindowProxy identity persists across iframe navigations.
// This is important for understanding if the WeakMap-based sourceId mapping
// in content-core.ts would return the same sourceId after a child frame navigates.

test.describe('WindowProxy identity across navigations', () => {

  test('same-origin navigation: iframe.src change', async ({ page }) => {
    await page.goto('/test/test-page.html');

    // Wait for iframe to load
    const iframe = page.locator('#iframe1');
    await iframe.waitFor();
    await page.waitForTimeout(500); // ensure iframe content loads

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('iframe1') as HTMLIFrameElement;
      const ref1 = iframe.contentWindow;

      // Navigate to the same page with different query param (same-origin)
      iframe.src = 'iframe.html?v=2';
      await new Promise(resolve => iframe.onload = resolve);

      const ref2 = iframe.contentWindow;
      return {
        sameIdentity: ref1 === ref2,
        ref1Type: typeof ref1,
        ref2Type: typeof ref2,
      };
    });

    console.log('Same-origin navigation result:', result);
    // Report the result - we're investigating, not asserting a particular value
    console.log(`WindowProxy identity persists across same-origin navigation: ${result.sameIdentity}`);
  });

  test('WeakMap lookup persists across same-origin navigation', async ({ page }) => {
    await page.goto('/test/test-page.html');

    const iframe = page.locator('#iframe1');
    await iframe.waitFor();
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('iframe1') as HTMLIFrameElement;
      const weakMap = new WeakMap();
      const testValue = { sourceId: 'test-123', type: 'child' };

      // Store in WeakMap using contentWindow as key
      weakMap.set(iframe.contentWindow!, testValue);

      // Verify it works before navigation
      const beforeNav = weakMap.get(iframe.contentWindow!);

      // Navigate the iframe (same-origin)
      iframe.src = 'iframe.html?v=2';
      await new Promise(resolve => iframe.onload = resolve);

      // Try to retrieve from WeakMap after navigation
      const afterNav = weakMap.get(iframe.contentWindow!);

      return {
        beforeNav: beforeNav ? beforeNav.sourceId : null,
        afterNav: afterNav ? afterNav.sourceId : null,
        weakMapRetained: afterNav === testValue,
      };
    });

    console.log('WeakMap same-origin result:', result);
    console.log(`WeakMap lookup works after same-origin navigation: ${result.weakMapRetained}`);
  });

  test('about:blank navigation', async ({ page }) => {
    await page.goto('/test/test-page.html');

    const iframe = page.locator('#iframe1');
    await iframe.waitFor();
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('iframe1') as HTMLIFrameElement;
      const weakMap = new WeakMap();
      const testValue = { sourceId: 'test-456', type: 'child' };

      weakMap.set(iframe.contentWindow!, testValue);

      // Navigate to about:blank (different origin context)
      iframe.src = 'about:blank';
      await new Promise(resolve => iframe.onload = resolve);

      const afterNav = weakMap.get(iframe.contentWindow!);

      return {
        afterNav: afterNav ? afterNav.sourceId : null,
        weakMapRetained: afterNav === testValue,
      };
    });

    console.log('about:blank navigation result:', result);
    console.log(`WeakMap lookup works after about:blank navigation: ${result.weakMapRetained}`);
  });

  test('cross-origin navigation via second server', async ({ page, browser }) => {
    // Create a second page on a different origin to serve as cross-origin target
    // We'll use a data: URI approach since we don't have a second server

    await page.goto('/test/test-page.html');

    const iframe = page.locator('#iframe1');
    await iframe.waitFor();
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('iframe1') as HTMLIFrameElement;
      const weakMap = new WeakMap();
      const testValue = { sourceId: 'test-789', type: 'child' };

      weakMap.set(iframe.contentWindow!, testValue);
      const ref1 = iframe.contentWindow;

      // Navigate to a cross-origin URL (example.com won't actually load in test,
      // but the navigation itself is what we care about)
      // Use a data: URI instead - it has a unique opaque origin
      iframe.src = 'data:text/html,<h1>Cross-origin test</h1>';
      await new Promise(resolve => iframe.onload = resolve);

      const afterNav = weakMap.get(iframe.contentWindow!);
      const ref2 = iframe.contentWindow;

      return {
        sameIdentity: ref1 === ref2,
        afterNav: afterNav ? afterNav.sourceId : null,
        weakMapRetained: afterNav === testValue,
      };
    });

    console.log('Cross-origin (data: URI) navigation result:', result);
    console.log(`WindowProxy identity persists: ${result.sameIdentity}`);
    console.log(`WeakMap lookup works: ${result.weakMapRetained}`);
  });

  test('message event.source identity across navigation', async ({ page }) => {
    await page.goto('/test/test-page.html');

    const iframe = page.locator('#iframe1');
    await iframe.waitFor();
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const iframe = document.getElementById('iframe1') as HTMLIFrameElement;

      // Collect event.source from a message before navigation
      const getMessageSource = () => new Promise<MessageEventSource | null>(resolve => {
        const handler = (e: MessageEvent) => {
          if (e.data?.type === 'ready' || e.data?.type === 'ack') {
            window.removeEventListener('message', handler);
            resolve(e.source);
          }
        };
        window.addEventListener('message', handler);
        // Trigger a message from the iframe
        iframe.contentWindow!.postMessage({ type: 'ping' }, '*');
      });

      const source1 = await getMessageSource();

      // Navigate the iframe (same-origin)
      iframe.src = 'iframe.html?v=3';
      await new Promise(resolve => iframe.onload = resolve);
      // Wait for the new iframe to initialize
      await new Promise(resolve => setTimeout(resolve, 200));

      const source2 = await getMessageSource();

      // Also compare with contentWindow
      return {
        source1EqualsSource2: source1 === source2,
        source1EqualsContentWindow: source1 === iframe.contentWindow,
        source2EqualsContentWindow: source2 === iframe.contentWindow,
      };
    });

    console.log('event.source identity result:', result);
    console.log(`event.source same across navigations: ${result.source1EqualsSource2}`);
    console.log(`event.source === contentWindow (before): ${result.source1EqualsContentWindow}`);
    console.log(`event.source === contentWindow (after): ${result.source2EqualsContentWindow}`);
  });
});
