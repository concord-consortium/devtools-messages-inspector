import { test, expect, Page, Download } from '@playwright/test';

// Scope selectors to the log view to avoid conflicts with sources view
const logView = '.log-view';

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

    const view = page.locator(logView);
    const detailPane = view.locator('.detail-pane');

    // Detail pane panel should be collapsed initially
    await expect(detailPane).not.toBeVisible();

    // Click the row
    await page.locator('#message-table tbody tr').first().click();

    // Detail pane should now be visible
    await expect(detailPane).toBeVisible();

    // Should show the JSON data
    await expect(view.locator('.json-tree')).toContainText('detail-test');
  });

  test('close button hides the detail panel', async ({ page }) => {
    const view = page.locator(logView);
    const detailPane = view.locator('.detail-pane');

    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "close-test" })');
    await page.locator('#message-table tbody tr').first().click();
    await expect(detailPane).toBeVisible();

    await view.locator('.close-detail-btn').click();
    await expect(detailPane).not.toBeVisible();
  });
});

test.describe('filtering', () => {
  test('filter by message type narrows the table', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "keep" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "remove" })');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(2);

    await page.locator('.filter-input').fill('data.type:keep');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#message-table tbody tr td[data-column="messageType"]')).toHaveText('keep');
  });

  test('negative filter excludes matching messages', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "alpha" })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "beta" })');

    await page.locator('.filter-input').fill('-data.type:alpha');
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

    await page.locator('.filter-input').fill('data.type:one');
    await expect(page.locator('#message-table tbody tr')).toHaveCount(1);

    await page.locator('.filter-input').clear();
    await expect(page.locator('#message-table tbody tr')).toHaveCount(2);
  });
});

test.describe('filter help panel', () => {
  test('help button toggles the filter syntax panel', async ({ page }) => {
    const helpButton = page.locator('.filter-help-button');
    const helpPanel = page.locator('.filter-help-panel');

    // Panel is not visible initially
    await expect(helpPanel).not.toBeVisible();

    // Click help button opens the panel
    await helpButton.click();
    await expect(helpPanel).toBeVisible();
    await expect(helpPanel.locator('h1')).toHaveText('Filter Syntax');

    // Click help button again closes the panel
    await helpButton.click();
    await expect(helpPanel).not.toBeVisible();
  });

  test('clicking outside closes the help panel', async ({ page }) => {
    const helpButton = page.locator('.filter-help-button');
    const helpPanel = page.locator('.filter-help-panel');

    await helpButton.click();
    await expect(helpPanel).toBeVisible();

    // Click outside the panel (far left of viewport, below the filter bar)
    await page.mouse.click(5, 200);
    await expect(helpPanel).not.toBeVisible();
  });
});

test.describe('dynamic frames', () => {
  test('messages from a dynamically added iframe appear', async ({ page }) => {
    // Add a new iframe at runtime
    await page.evaluate(`
      window.harness.actions.addIframe(window.harness.topFrame, { url: 'https://dynamic.example.com/', iframeId: 'dynamic' });
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
      window.harness.actions.addIframe(window.harness.topFrame, { url: 'https://third.example.com/', iframeId: 'third' });
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
      window.harness.actions.addIframe(window.harness.topFrame, { url: 'https://third.example.com/', iframeId: 'third' });
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
    await expect(dirCell).toHaveClass(/dir-child/);
    await expect(dirCell).toHaveClass(/dir-uninvolved/);
    // Should not have a focus indicator (uses normal unfocused icon)
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

    const view = page.locator(logView);
    const headings = view.locator('.section-heading--top');
    await expect(headings.nth(0)).toHaveText('Target (focused)');
    await expect(headings.nth(1)).toHaveText('Source');
  });

  test('detail pane shows (focused) on source heading when source is focused', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "detail-focus2" })');
    // Focus child (frame 1) which is the source of child-to-parent messages
    await selectFocusedFrame(page, '1:1');

    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(logView);
    const headings = view.locator('.section-heading--top');
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
      window.harness.actions.addIframe(window.harness.topFrame, { url: 'https://third.example.com/', iframeId: 'third' });
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

// Helper: read a Playwright Download as parsed JSON
async function downloadToJson(download: Download): Promise<unknown> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

test.describe('export', () => {
  test('export button downloads JSON with all captured messages', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "export-a", value: 1 })');
    await sendAndWait(page, 'window.harness.sendParentToChild({ type: "export-b", value: 2 })');

    // Click export and capture the download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.icon-btn[title="Export messages"]').click(),
    ]);

    // Check filename format
    expect(download.suggestedFilename()).toMatch(/^messages-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);

    // Parse and verify content
    const envelope = await downloadToJson(download) as {
      version: number;
      exportedAt: string;
      messageCount: number;
      messages: Array<{
        id: string;
        timestamp: number;
        data: unknown;
        source: { type: string; origin: string; sourceId: string | null };
        target: { origin: string; frameId: number };
      }>;
    };

    expect(envelope.version).toBe(1);
    expect(envelope.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(envelope.messageCount).toBe(2);
    expect(envelope.messages).toHaveLength(2);

    // Verify message content matches what was sent
    const types = envelope.messages.map(m => (m.data as { type: string }).type);
    expect(types).toEqual(['export-a', 'export-b']);

    // Verify internal fields are present
    for (const msg of envelope.messages) {
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.source.type).toBeTruthy();
      expect(msg.source.sourceId).toBeDefined();
      expect(msg.target.origin).toBeTruthy();
    }
  });
});

test.describe('cross-pane navigation', () => {
  test('context pane shows frame action buttons on section headers', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "nav-test" })');

    // Click the row and switch to Context tab
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(logView);
    const headings = view.locator('.section-heading--top');

    // Target heading (index 0) should contain frame action buttons
    await expect(headings.nth(0).locator('.frame-action-buttons')).toHaveCount(1);
    // Source heading (index 1) should contain frame action buttons
    await expect(headings.nth(1).locator('.frame-action-buttons')).toHaveCount(1);
  });

  test('filter button sets filter to frames filter for that frame', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "filter-nav" })');

    // Click the row and switch to Context tab
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(logView);
    const targetHeading = view.locator('.section-heading--top').nth(0);

    // Click the filter action button (first .frame-action-btn) on the Target heading
    // For child-to-parent, target is frame[0] in tab 1
    await targetHeading.locator('.frame-action-btn').nth(0).click();

    const filterInput = page.locator('.filter-input');
    await expect(filterInput).toHaveValue('frames:"tab[1].frame[0]"');
  });

  test('view in endpoints button switches to endpoints view with frame selected', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "sources-nav" })');

    // Click the row and switch to Context tab
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    const view = page.locator(logView);
    const sourceHeading = view.locator('.section-heading--top').nth(1);

    // Click the "View in Endpoints" button (third .frame-action-btn) on Source heading
    // For child-to-parent, source is frame[1] in tab 1
    await sourceHeading.locator('.frame-action-btn').nth(2).click();
    await page.evaluate('window.harness.flushPromises()');

    // Endpoints view should now be active
    await expect(page.locator('.endpoints-view')).toHaveClass(/active/);

    // A node should be selected in the tree view
    const selectedNode = page.locator('.tree-node--selected');
    await expect(selectedNode).toHaveCount(1);
  });

  test('show messages button in endpoints navigates to log with filter', async ({ page }) => {
    // Send a message to populate frame hierarchy
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "show-msg" })');

    // Switch to Endpoints view
    await page.locator('.sidebar-item', { hasText: 'Endpoints' }).click();
    await page.evaluate('window.harness.flushPromises()');

    // Wait for tree to have nodes
    await expect(page.locator('.tree-node').first()).toBeVisible();

    // Click the first Tab node to select it
    await page.locator('.tree-node').first().click();

    // Verify a node is selected
    await expect(page.locator('.tree-node--selected')).toHaveCount(1);

    // Click "Show messages" button
    await page.locator('.show-messages-btn').click();
    await page.evaluate('window.harness.flushPromises()');

    // Should switch to Log view
    await expect(page.locator('.log-view')).toHaveClass(/active/);

    // Filter should be set for the selected tab (frame[0])
    const filterInput = page.locator('.filter-input');
    await expect(filterInput).toHaveValue('frames:"tab[1].frame[0]"');

    // Focused frame should be set
    const dropdown = page.locator('.frame-focus-selector select');
    await expect(dropdown).toHaveValue('1:0');
  });
});

// Helper: check if a field with the given label exists in the source section of the context table
function sourceSectionHasField(label: string): boolean {
  const rows = document.querySelectorAll('.log-view .context-table tr');
  let inSourceSection = false;
  for (const row of rows) {
    const th = row.querySelector('th');
    if (th?.classList.contains('section-heading') && th.textContent?.includes('Source')) {
      inSourceSection = true;
      continue;
    }
    if (inSourceSection && th && th.textContent?.trim() === label) {
      return true;
    }
  }
  return false;
}

test.describe('detail pane resize', () => {
  test('resize handle tracks mouse position during drag', async ({ page }) => {
    // Open the detail pane by clicking a row
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "resize-test" })');
    await page.locator('#message-table tbody tr').first().click();

    const view = page.locator(logView);
    await expect(view.locator('.detail-pane')).toBeVisible();

    const handle = view.locator('.resize-handle');
    const handleBox = (await handle.boundingBox())!;

    // Start dragging from the center of the handle
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;

    // Move the handle 100px to the left (making detail pane wider)
    const dragDeltaX = -100;
    const targetX = startX + dragDeltaX;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 10 });

    // The resize handle should now be near the mouse position.
    const handleBoxAfter = (await handle.boundingBox())!;
    const handleCenterAfter = handleBoxAfter.x + handleBoxAfter.width / 2;

    // Allow 10px tolerance for rounding, but large offsets (e.g. sidebar width) should fail
    expect(Math.abs(handleCenterAfter - targetX)).toBeLessThan(10);

    await page.mouse.up();
  });
});

test.describe('late registration reactivity', () => {
  test('source frame info visible in context pane after registration', async ({ page }) => {
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "early-msg" })');

    // Wait for registration to complete (500ms delay + routing)
    await page.evaluate('new Promise(r => setTimeout(r, 800))');
    await page.evaluate('window.harness.flushPromises()');

    // Open detail pane and switch to Context tab
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    // Source section should show Frame info since registration linked sourceId → frame
    expect(await page.evaluate(sourceSectionHasField, 'Frame')).toBe(true);
  });

  test('source frame reactively appears when source.frameId column is visible', async ({ page }) => {
    // Reproduce the user's exact scenario: source.frameId column visible causes
    // msg.sourceFrame to be evaluated during table render (caching undefined).
    // After registration links the frame, the context pane should reactively update.
    await page.evaluate('window.harness.store.setColumnVisible("source.frameId", true)');

    // Send a child→parent message — arrives before the 500ms registration delay
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "early-msg" })');

    // Open detail pane and switch to Context tab BEFORE registration
    await page.locator('#message-table tbody tr').first().click();
    await page.locator('.tab-btn', { hasText: 'Context' }).click();

    // Source section should NOT yet have a "Frame" row
    expect(await page.evaluate(sourceSectionHasField, 'Frame')).toBe(false);

    // Wait for registration to arrive (500ms delay + routing) — should reactively update
    await page.waitForFunction(sourceSectionHasField, 'Frame', { timeout: 3000 });
  });
});

test.describe('endpoints tree after navigation', () => {
  test('navigated-away document does not show child iframes from old page under new document', async ({ page }) => {
    // Send a message to establish the hierarchy (parent has child iframe)
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "before-nav" })');

    // Wait for registration to complete
    await page.evaluate('new Promise(r => setTimeout(r, 800))');
    await page.evaluate('window.harness.flushPromises()');

    // Navigate the top frame to a new URL (no iframes in new page)
    await page.evaluate(`
      window.harness.actions.navigate(window.harness.topFrame, {
        url: 'https://parent.example.com/new-page',
        title: 'New Page'
      });
    `);
    await page.evaluate('window.harness.flushPromises()');

    // Switch to Endpoints view
    await page.locator('.sidebar-item', { hasText: 'Endpoints' }).click();
    await page.evaluate('window.harness.flushPromises()');

    // Wait for tree nodes to appear
    await expect(page.locator('.tree-node').first()).toBeVisible();

    // The new document (most recent, rendered first) should NOT have any IFrame children.
    // Bug: after navigation, old child frames still have parentFrameId=0, so
    // getUnknownChildFrames incorrectly finds them under the new document.
    //
    // Expected tree:
    //   Tab [1]
    //     Doc  https://parent.example.com/new-page        ← new doc (no iframes)
    //     Doc  https://parent.example.com/ (navigated away) ← old doc (has iframes)
    //       IFrame ...
    //         Doc  https://child.example.com/
    //
    // With the bug, an IFrame node incorrectly appears under the new document too.

    // Find the new document's tree-node-group (contains "new-page" in label)
    const newDocGroup = page.locator('.tree-node-group').filter({
      has: page.locator('> .tree-node .tree-node-label', { hasText: 'new-page' }),
    });
    await expect(newDocGroup).toHaveCount(1);

    // The new document's group should contain NO iframe children
    const iframesUnderNewDoc = newDocGroup.locator('.tree-node-type--iframe');
    await expect(iframesUnderNewDoc).toHaveCount(0);
  });

  test('removed iframe is dimmed and shows removed status in details', async ({ page }) => {
    // Send a message to establish the hierarchy (parent has child iframe)
    await sendAndWait(page, 'window.harness.sendChildToParent({ type: "before-remove" })');

    // Wait for registration to complete
    await page.evaluate('new Promise(r => setTimeout(r, 800))');
    await page.evaluate('window.harness.flushPromises()');

    // Remove the iframe via the harness sidebar "Remove" button
    const iframeNode = page.locator('.harness-sidebar .node-box').filter({
      has: page.locator('> .node-header > .node-type-badge', { hasText: 'iframe' }),
    });
    await iframeNode.locator('.node-action-btn', { hasText: 'Remove' }).click();
    await page.evaluate('window.harness.flushPromises()');

    // Switch to Endpoints view
    await page.locator('.sidebar-item', { hasText: 'Endpoints' }).click();
    await page.evaluate('window.harness.flushPromises()');

    // Click refresh to get updated hierarchy
    await page.locator('button[title="Refresh"]').click();
    await page.evaluate('window.harness.flushPromises()');

    // Wait for tree nodes to appear
    await expect(page.locator('.tree-node').first()).toBeVisible();

    // The IFrame node should be dimmed
    const iframeTreeNode = page.locator('.tree-node').filter({
      has: page.locator('.tree-node-type--iframe'),
    });
    await expect(iframeTreeNode).toHaveClass(/tree-node--dimmed/);

    // The IFrame node should show "(removed)" suffix
    await expect(iframeTreeNode.locator('.tree-node-suffix')).toHaveText('(removed)');

    // Click the iframe node to select it and see details
    await iframeTreeNode.click();
    await page.evaluate('window.harness.flushPromises()');

    // The detail pane should show "Removed from page" status
    const detailPane = page.locator('.detail-pane');
    await expect(detailPane.locator('td', { hasText: 'Removed from page' })).toBeVisible();
  });
});
