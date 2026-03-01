import { test, expect, Page } from '@playwright/test';

// Scope selectors to the messages view to avoid conflicts with hierarchy view
const messagesView = '.messages-view';

// Helper: send a message through the harness and wait for it to appear in the table.
// postMessage uses setTimeout(0) internally, so we need a short real delay
// plus flushPromises for the async chrome.runtime plumbing.
async function sendAndWait(page: Page, expr: string) {
  await page.evaluate(expr);
  // Let setTimeout(0) fire + async message routing settle
  await page.evaluate('new Promise(r => setTimeout(r, 50))');
  await page.evaluate('window.harness.flushPromises()');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test.html');
  // Wait for the panel to render and harness to be available
  await page.waitForFunction('window.harness');
  await page.waitForSelector('#message-table');
});

test.describe('message capture and display', () => {
  test('child-to-parent message appears in the table', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "hello", value: 42 })');

    const rows = page.locator('#message-table tbody tr');
    await expect(rows).toHaveCount(1);

    // Direction column uses arrow icons with CSS classes like dir-child
    const direction = rows.first().locator('td[data-column="direction"]');
    await expect(direction).toHaveClass(/dir-child/);

    // Check message type
    const msgType = rows.first().locator('td[data-column="messageType"]');
    await expect(msgType).toHaveText('hello');
  });

  test('parent-to-child message appears in the table', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "greet" })');

    const rows = page.locator('#message-table tbody tr');
    await expect(rows).toHaveCount(1);

    const direction = rows.first().locator('td[data-column="direction"]');
    await expect(direction).toHaveClass(/dir-parent/);

    const msgType = rows.first().locator('td[data-column="messageType"]');
    await expect(msgType).toHaveText('greet');
  });

  test('multiple messages appear in order', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "first" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "second" })');

    const rows = page.locator('#message-table tbody tr');
    await expect(rows).toHaveCount(2);

    await expect(rows.nth(0).locator('td[data-column="messageType"]')).toHaveText('first');
    await expect(rows.nth(1).locator('td[data-column="messageType"]')).toHaveText('second');
  });
});

test.describe('detail panel', () => {
  test('clicking a row opens the detail panel', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "detail-test", payload: [1, 2, 3] })');

    const view = page.locator(messagesView);

    const detailPane = view.locator('.detail-pane');

    // Detail pane should be hidden initially
    await expect(detailPane).toHaveClass(/hidden/);

    // Click the row
    await page.locator('#message-table tbody tr').first().click();

    // Detail pane should now be visible
    await expect(detailPane).not.toHaveClass(/hidden/);

    // Should show the JSON data
    await expect(view.locator('.json-tree')).toContainText('detail-test');
  });

  test('close button hides the detail panel', async ({ page }) => {
    const view = page.locator(messagesView);

    const detailPane = view.locator('.detail-pane');

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "close-test" })');
    await page.locator('#message-table tbody tr').first().click();
    await expect(detailPane).not.toHaveClass(/hidden/);

    await view.locator('.close-detail-btn').click();
    await expect(detailPane).toHaveClass(/hidden/);
  });
});

test.describe('filtering', () => {
  test('filter by message type narrows the table', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "keep" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "remove" })');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(2);

    await page.locator('.filter-input').fill('type:keep');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#message-table tbody tr td[data-column="messageType"]')).toHaveText('keep');
  });

  test('negative filter excludes matching messages', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "alpha" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "beta" })');

    await page.locator('.filter-input').fill('-type:alpha');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#message-table tbody tr td[data-column="messageType"]')).toHaveText('beta');
  });

  test('sourceType filter works', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "from-child" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "from-parent" })');

    await page.locator('.filter-input').fill('sourceType:child');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#message-table tbody tr td[data-column="direction"]')).toHaveClass(/dir-child/);
  });

  test('clearing filter restores all messages', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "one" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "two" })');

    await page.locator('.filter-input').fill('type:one');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);

    await page.locator('.filter-input').clear();
    await expect(page.locator('#message-table tbody tr')).toHaveCount(2);
  });
});

test.describe('dynamic frames', () => {
  test('messages from a dynamically added iframe appear', async ({ page }) => {
    // Add a new iframe at runtime
    await page.evaluate(`
      window.harness.topFrame.addIframe({ url: 'https://dynamic.example.com/', iframeId: 'dynamic' });
    `);
    await page.evaluate('window.harness.flushPromises()');

    // The new iframe's window is the last child; send a message from it to the parent
    await page.evaluate(`
      const frames = window.harness.topFrame.tab.getAllFrames();
      const dynamicFrame = frames.find(f => f.currentDocument?.url === 'https://dynamic.example.com/');
      dynamicFrame.window.parent.postMessage({ type: 'from-dynamic' }, '*');
    `);
    await page.evaluate('new Promise(r => setTimeout(r, 50))');
    await page.evaluate('window.harness.flushPromises()');

    const rows = page.locator('#message-table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td[data-column="messageType"]')).toHaveText('from-dynamic');
  });
});

// Helper: select a focused frame via the dropdown
async function selectFocusedFrame(page: Page, value: string) {
  const dropdown = page.locator('.frame-focus-selector select');
  await dropdown.selectOption(value);
}

test.describe('focused frame', () => {
  test('dropdown defaults to None', async ({ page }) => {
    const dropdown = page.locator('.frame-focus-selector select');
    await expect(dropdown).toHaveValue('');
  });

  test('dropdown lists all frames from hierarchy', async ({ page }) => {
    // Send a message to trigger frame hierarchy population
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');

    const dropdown = page.locator('.frame-focus-selector select');
    const options = dropdown.locator('option');
    // "None" + frame[0] + frame[1]
    await expect(options).toHaveCount(3);
  });

  test('dropdown shows dynamically added frames', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');

    // Add a third frame
    await page.evaluate(`
      window.harness.topFrame.addIframe({ url: 'https://third.example.com/', iframeId: 'third' });
    `);
    await page.evaluate('window.harness.flushPromises()');

    // Request hierarchy refresh after adding new frame
    await page.evaluate('window.harness.requestFrameHierarchy()');

    await page.evaluate('window.harness.flushPromises()');

    const options = page.locator('.frame-focus-selector select option');
    // "None" + frame[0] + frame[1] + frame[2]
    await expect(options).toHaveCount(4);
  });

  test('direction icons have no focus indicator when no frame focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "test" })');

    const dirCell = page.locator('#message-table tbody tr').first().locator('td[data-column="direction"]');
    const indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(0);
  });

  test('parent-to-child shows source focus indicator when parent focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');
    await selectFocusedFrame(page, '1:0');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "p2c" })');

    // Find the parent-to-child message row
    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'p2c' }) });
    const dirCell = row.locator('td[data-column="direction"]');
    await expect(dirCell).toHaveClass(/dir-parent/);
    const indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(1);
  });

  test('child-to-parent shows target focus indicator when parent focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');
    await selectFocusedFrame(page, '1:0');
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "c2p" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'c2p' }) });
    const dirCell = row.locator('td[data-column="direction"]');
    await expect(dirCell).toHaveClass(/dir-child/);
    const indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(1);
  });

  test('child-to-parent shows source focus indicator when child focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');
    await selectFocusedFrame(page, '1:1');
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "c2p-child" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'c2p-child' }) });
    const dirCell = row.locator('td[data-column="direction"]');
    const indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(1);
  });

  test('messages not involving focused frame show gray dot', async ({ page }) => {
    // Add a third frame
    await page.evaluate(`
      window.harness.topFrame.addIframe({ url: 'https://third.example.com/', iframeId: 'third' });
    `);
    await page.evaluate('window.harness.flushPromises()');
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');

    // Request hierarchy refresh so frame[2] appears in dropdown
    await page.evaluate('window.harness.requestFrameHierarchy()');

    await page.evaluate('window.harness.flushPromises()');

    // Focus on frame[2] (the third frame, not involved in child↔parent messages)
    await selectFocusedFrame(page, '1:2');

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "uninvolved-test" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'uninvolved-test' }) });
    const dirCell = row.locator('td[data-column="direction"]');
    await expect(dirCell).toHaveClass(/dir-uninvolved/);
    // Should not have a focus indicator, just a gray dot (circle element)
    const indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(0);
  });

  test('setting focus after messages are captured updates direction icons', async ({ page }) => {
    // Send messages first (no focus set)
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "retro-test" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'retro-test' }) });
    const dirCell = row.locator('td[data-column="direction"]');

    // No focus indicator yet
    let indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(0);

    // Now select focus
    await selectFocusedFrame(page, '1:0');

    // MobX reactivity should update existing rows
    indicator = dirCell.locator('.focus-indicator');
    await expect(indicator).toHaveCount(1);
  });

  test('detail pane shows (focused) on target heading when target is focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "detail-focus" })');
    // Focus parent (frame 0) which is the target of child-to-parent messages
    await selectFocusedFrame(page, '1:0');

    // Click the row and switch to context tab
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(messagesView);
    const headings = view.locator('.section-heading');
    await expect(headings.nth(0)).toHaveText('Target (focused)');
    await expect(headings.nth(1)).toHaveText('Source');
  });

  test('detail pane shows (focused) on source heading when source is focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "detail-focus2" })');
    // Focus child (frame 1) which is the source of child-to-parent messages
    await selectFocusedFrame(page, '1:1');

    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(messagesView);
    const headings = view.locator('.section-heading');
    await expect(headings.nth(0)).toHaveText('Target');
    await expect(headings.nth(1)).toHaveText('Source (focused)');
  });

  test('partner columns show correct values when focused frame is source', async ({ page }) => {
    // Enable partner columns
    await page.evaluate(`
      window.harness.store.setColumnVisible('partnerFrame', true);
      window.harness.store.setColumnVisible('partnerType', true);
    `);

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');
    await selectFocusedFrame(page, '1:0');
    // Parent sends to child: sourceType="parent", focus is source
    // Partner (target) is a child from parent's perspective → inverted: "child"
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "partner-test" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'partner-test' }) });
    await expect(row.locator('td[data-column="partnerFrame"]')).toHaveText('frame[1]');
    await expect(row.locator('td[data-column="partnerType"]')).toHaveText('child');
  });

  test('partner columns show type as-is when focused frame is target', async ({ page }) => {
    await page.evaluate(`
      window.harness.store.setColumnVisible('partnerFrame', true);
      window.harness.store.setColumnVisible('partnerType', true);
    `);

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');
    // Focus parent (frame 0), which is the target of child-to-parent messages
    await selectFocusedFrame(page, '1:0');
    // Child sends to parent: sourceType="child", focus is target
    // Partner (source) is a child → sourceType as-is: "child"
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "partner-inv" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'partner-inv' }) });
    await expect(row.locator('td[data-column="partnerType"]')).toHaveText('child');
    await expect(row.locator('td[data-column="partnerFrame"]')).toHaveText('frame[1]');
  });

  test('partner columns are empty for uninvolved messages', async ({ page }) => {
    await page.evaluate(`
      window.harness.store.setColumnVisible('partnerFrame', true);
      window.harness.store.setColumnVisible('partnerType', true);
    `);

    // Add third frame and focus it
    await page.evaluate(`
      window.harness.topFrame.addIframe({ url: 'https://third.example.com/', iframeId: 'third' });
    `);
    await page.evaluate('window.harness.flushPromises()');
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "trigger" })');

    // Request hierarchy refresh so frame[2] appears in dropdown
    await page.evaluate('window.harness.requestFrameHierarchy()');

    await page.evaluate('window.harness.flushPromises()');

    await selectFocusedFrame(page, '1:2');

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "empty-partner" })');

    const row = page.locator('#message-table tbody tr', { has: page.locator('td[data-column="messageType"]', { hasText: 'empty-partner' }) });
    await expect(row.locator('td[data-column="partnerFrame"]')).toHaveText('');
    await expect(row.locator('td[data-column="partnerType"]')).toHaveText('');
  });
});
