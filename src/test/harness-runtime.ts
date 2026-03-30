// HarnessRuntime — bridges the hierarchy module (applyAction) with the test
// harness (ChromeExtensionEnv + harness models). All topology changes flow
// through hierarchy actions, and the runtime materializes the correct harness
// objects and fires the correct Chrome events.

import { makeObservable, observable, runInAction } from 'mobx';
import { ChromeExtensionEnv } from './chrome-extension-env';
import {
  HarnessTab, HarnessFrame, HarnessDocument, HarnessWindow, createProxyPair,
} from './harness-models';
import { applyAction } from '../hierarchy/action-effects';
import type { ActionResult } from '../hierarchy/action-effects';
import { initState } from '../hierarchy/reducer';
import type { HierarchyState } from '../hierarchy/reducer';
import type { HierarchyAction } from '../hierarchy/actions';
import type { HierarchyEvent } from '../hierarchy/events';
import type { TabNode, FrameNode, DocumentNode, IframeNode } from '../hierarchy/types';

/** Composite key for frames: "tabId:frameId" */
function frameKey(tabId: number, frameId: number): string {
  return `${tabId}:${frameId}`;
}

export class HarnessRuntime {
  readonly env: ChromeExtensionEnv;
  hierarchyState: HierarchyState = initState([]);
  actionLog: Array<{ action: HierarchyAction; events: HierarchyEvent[] }> = [];

  private tabs = new Map<number, HarnessTab>();
  // Keyed by "tabId:frameId" to support multiple tabs with frameId 0
  private frames = new Map<string, HarnessFrame>();

  constructor(env: ChromeExtensionEnv) {
    this.env = env;
    makeObservable(this, {
      hierarchyState: observable.ref,
      actionLog: observable.ref,
    });
  }

  /** Materialize an initial tree into harness objects. Call once before dispatch(). */
  materializeTree(tree: TabNode | TabNode[]): void {
    const roots = Array.isArray(tree) ? tree : [tree];
    runInAction(() => {
      this.hierarchyState = initState(roots);
    });

    for (const tabNode of roots) {
      this.materializeTab(tabNode);
    }

    // Wire opener proxies for tabs that have openerTabId/openerFrameId
    for (const tabNode of roots) {
      if (tabNode.openerTabId != null && tabNode.openerFrameId != null) {
        const openerFrame = this.lookupFrame(tabNode.openerTabId, tabNode.openerFrameId);
        const popupFrameId = tabNode.frames?.[0]?.frameId ?? 0;
        const popupFrame = this.lookupFrame(tabNode.tabId, popupFrameId);
        if (openerFrame?.window && popupFrame?.window) {
          const { aForB: openerProxyForPopup, bForA: popupProxyForOpener } =
            createProxyPair(openerFrame, popupFrame);
          popupFrame.window.setOpenerProxy(openerFrame, openerProxyForPopup);
          openerFrame.window.registerOpenedWindowProxy(popupFrame, popupProxyForOpener);
          popupFrame._openerFrame = openerFrame;
          popupFrame._openerProxyForSelf = openerProxyForPopup;
        }
      }
    }
  }

  /** Dispatch a hierarchy action: update state, create objects, fire events. */
  dispatch(action: HierarchyAction): ActionResult {
    const result = applyAction(this.hierarchyState, action);
    runInAction(() => {
      this.hierarchyState = result.state;
      this.actionLog = [...this.actionLog, { action, events: result.events }];
    });

    for (const event of result.events) {
      this.materializeEvent(event);
    }

    return result;
  }

  /** Accessors */
  getTab(tabId: number): HarnessTab | undefined {
    return this.tabs.get(tabId);
  }

  getFrame(frameId: number): HarnessFrame | undefined {
    // Search all tabs for this frameId; return first match
    for (const [key, frame] of this.frames) {
      if (frame.frameId === frameId) return frame;
    }
    return undefined;
  }

  getWindow(frameId: number): HarnessWindow | undefined {
    return this.getFrame(frameId)?.window;
  }

  // ---------------------------------------------------------------------------
  // Private: frame lookup helpers
  // ---------------------------------------------------------------------------

  private lookupFrame(tabId: number, frameId: number): HarnessFrame | undefined {
    return this.frames.get(frameKey(tabId, frameId));
  }

  private storeFrame(tabId: number, frameId: number, frame: HarnessFrame): void {
    this.frames.set(frameKey(tabId, frameId), frame);
  }

  // ---------------------------------------------------------------------------
  // Private: materialize tree nodes
  // ---------------------------------------------------------------------------

  private materializeTab(tabNode: TabNode): void {
    const tab = new HarnessTab(tabNode.tabId);
    this.env.registerTab(tab);
    this.tabs.set(tabNode.tabId, tab);

    if (tabNode.frames) {
      for (const frameNode of tabNode.frames) {
        this.materializeFrame(tab, frameNode, -1);
      }
    }
  }

  private materializeFrame(tab: HarnessTab, frameNode: FrameNode, parentFrameId: number): void {
    const doc = this.findActiveDocument(frameNode);
    const url = doc?.url ?? '';
    const origin = url ? new URL(url).origin : '';

    const frame = new HarnessFrame(tab, frameNode.frameId, parentFrameId);
    frame.currentDocument = new HarnessDocument(
      doc?.documentId ?? `doc-f${frameNode.frameId}`,
      url,
      doc?.title,
    );
    frame.window = new HarnessWindow({
      location: { href: url, origin },
      title: doc?.title,
    });
    tab.addFrame(frame);
    this.storeFrame(tab.id, frameNode.frameId, frame);

    // Fire onCommitted for the initial load
    this.env.bgOnCommitted.fire({ tabId: tab.id, frameId: frameNode.frameId, url, transitionType: 'link', transitionQualifiers: [] });

    // Materialize iframes in the active document
    if (doc?.iframes) {
      for (const iframeNode of doc.iframes) {
        if (iframeNode.frame) {
          this.materializeIframe(tab, frame, iframeNode);
        }
      }
    }
  }

  private materializeIframe(tab: HarnessTab, parentFrame: HarnessFrame, iframeNode: IframeNode): void {
    const childFrameNode = iframeNode.frame!;
    const childDoc = this.findActiveDocument(childFrameNode);
    const url = childDoc?.url ?? iframeNode.src ?? '';
    const origin = url ? new URL(url).origin : '';

    const childFrame = new HarnessFrame(tab, childFrameNode.frameId, parentFrame.frameId);
    childFrame.currentDocument = new HarnessDocument(
      childDoc?.documentId ?? `doc-f${childFrameNode.frameId}`,
      url,
      childDoc?.title,
    );
    const childWin = new HarnessWindow({
      location: { href: url, origin },
      title: childDoc?.title,
    });
    childFrame.window = childWin;

    // Proxy pair — targeting frames (stable across navigations)
    const parentWin = parentFrame.window!;
    const { aForB: parentProxyForChild, bForA: childProxyForParent } =
      createProxyPair(parentFrame, childFrame);
    childWin.setParentProxy(parentFrame, parentProxyForChild);
    parentWin.registerChildProxy(childFrame, childProxyForParent);
    childFrame._parentFrame = parentFrame;
    childFrame._parentProxyForSelf = parentProxyForChild;

    // Iframe DOM element
    parentWin.addIframeElement({
      src: url,
      id: iframeNode.id ?? '',
      contentWindow: childProxyForParent,
    });

    tab.addFrame(childFrame);
    this.storeFrame(tab.id, childFrameNode.frameId, childFrame);

    // Fire onCommitted
    this.env.bgOnCommitted.fire({ tabId: tab.id, frameId: childFrameNode.frameId, url, transitionType: 'auto_subframe', transitionQualifiers: [] });

    // Recurse into nested iframes
    if (childDoc?.iframes) {
      for (const nestedIframe of childDoc.iframes) {
        if (nestedIframe.frame) {
          this.materializeIframe(tab, childFrame, nestedIframe);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: materialize events from dispatch()
  // ---------------------------------------------------------------------------

  private materializeEvent(event: HierarchyEvent): void {
    switch (event.type) {
      case 'iframeAdded':
        this.materializeIframeAdded(event);
        break;
      case 'onCommitted':
        this.materializeOnCommitted(event);
        break;
      case 'onCreatedNavigationTarget':
        this.materializeOnCreatedNavTarget(event);
        break;
      case 'onTabCreated':
        this.materializeOnTabCreated(event);
        break;
      case 'onTabRemoved':
        this.env.bgOnTabRemoved.fire(event.tabId);
        break;
      case 'iframeRemoved':
        this.materializeIframeRemoved(event);
        break;
      case 'message':
        this.materializeMessage(event);
        break;
    }
  }

  private materializeIframeAdded(event: Extract<HierarchyEvent, { type: 'iframeAdded' }>): void {
    const { tabId, parentFrameId, frameId, src } = event;
    const tab = this.tabs.get(tabId)!;
    const parentFrame = this.lookupFrame(tabId, parentFrameId)!;
    const parentWin = parentFrame.window!;

    // Create frame only — window and document are created by materializeOnCommitted
    const childFrame = new HarnessFrame(tab, frameId, parentFrameId);

    // Proxy pair targets frames (stable across navigations)
    const { aForB: parentProxyForChild, bForA: childProxyForParent } =
      createProxyPair(parentFrame, childFrame);
    childFrame._parentFrame = parentFrame;
    childFrame._parentProxyForSelf = parentProxyForChild;
    parentWin.registerChildProxy(childFrame, childProxyForParent);

    parentWin.addIframeElement({
      src,
      id: '',
      contentWindow: childProxyForParent,
    });

    tab.addFrame(childFrame);
    this.storeFrame(tabId, frameId, childFrame);
  }

  private materializeIframeRemoved(event: Extract<HierarchyEvent, { type: 'iframeRemoved' }>): void {
    const { tabId, parentFrameId, iframeId } = event;
    const parentFrame = this.lookupFrame(tabId, parentFrameId);
    if (!parentFrame?.window) return;

    // The iframe is still in the hierarchy state (marked stale). Find its child frameId.
    const iframeNode = this.findIframeInHierarchyState(iframeId);
    if (!iframeNode?.frame) return;

    const childFrame = this.lookupFrame(tabId, iframeNode.frame.frameId);
    if (!childFrame) return;

    // Find the proxy that the parent window uses for this child frame
    const proxy = parentFrame.window.getChildProxy(childFrame);
    if (proxy) {
      parentFrame.window.removeIframeElement(proxy);
    }
  }

  private materializeOnCommitted(event: Extract<HierarchyEvent, { type: 'onCommitted' }>): void {
    const { tabId, frameId, url } = event;
    const frame = this.lookupFrame(tabId, frameId);

    if (frame) {
      const tabNode = this.hierarchyState.root.find(t => t.tabId === tabId);
      const frameNode = tabNode ? this.findFrameInTabNode(tabNode, frameId) : undefined;
      const doc = frameNode ? this.findActiveDocument(frameNode) : undefined;

      frame.currentDocument = new HarnessDocument(
        doc?.documentId ?? `doc-f${frameId}`,
        url,
        doc?.title,
      );

      const origin = url ? new URL(url).origin : '';
      const newWin = new HarnessWindow({
        location: { href: url, origin },
        title: doc?.title,
      });

      // Wire parent proxy from frame (set during materializeIframeAdded or materializeIframe)
      if (frame._parentFrame && frame._parentProxyForSelf) {
        newWin.setParentProxy(frame._parentFrame, frame._parentProxyForSelf);
      }

      // Wire opener proxy only for top-level frames
      const isTopFrame = frame.parentFrameId < 0;
      if (isTopFrame && tabNode?.openerTabId != null && tabNode.openerFrameId != null) {
        if (!frame._openerFrame) {
          // First commit — create opener proxy pair
          const openerFrame = this.lookupFrame(tabNode.openerTabId, tabNode.openerFrameId);
          if (openerFrame?.window) {
            const { aForB: openerProxyForPopup, bForA: popupProxyForOpener } =
              createProxyPair(openerFrame, frame);
            frame._openerFrame = openerFrame;
            frame._openerProxyForSelf = openerProxyForPopup;
            openerFrame.window.registerOpenedWindowProxy(frame, popupProxyForOpener);
          }
        }
        if (frame._openerFrame && frame._openerProxyForSelf) {
          newWin.setOpenerProxy(frame._openerFrame, frame._openerProxyForSelf);
        }
      }

      frame.window = newWin;
    }

    this.env.bgOnCommitted.fire({ tabId, frameId, url, transitionType: 'link', transitionQualifiers: [] });
  }

  private materializeOnTabCreated(event: Extract<HierarchyEvent, { type: 'onTabCreated' }>): void {
    const { tabId } = event;

    const tab = new HarnessTab(tabId);
    this.env.registerTab(tab);
    this.tabs.set(tabId, tab);

    // Create the frame only — window and document are created by
    // materializeOnCommitted when the onCommitted event fires.
    const newTabNode = this.hierarchyState.root.find(t => t.tabId === tabId);
    const frameNode = newTabNode?.frames?.[0];
    const frameId = frameNode?.frameId ?? 0;

    const frame = new HarnessFrame(tab, frameId, -1);
    tab.addFrame(frame);
    this.storeFrame(tabId, frameId, frame);
  }

  private materializeOnCreatedNavTarget(event: Extract<HierarchyEvent, { type: 'onCreatedNavigationTarget' }>): void {
    const { sourceTabId, sourceFrameId, tabId, url } = event;
    // Opener proxies are wired by materializeOnCommitted using the hierarchy
    // state's openerTabId/openerFrameId. This just fires the Chrome event.
    this.env.bgOnCreatedNavTarget.fire({ sourceTabId, sourceFrameId, tabId, url });
  }

  private materializeMessage(event: Extract<HierarchyEvent, { type: 'message' }>): void {
    const { sourceTabId, sourceFrameId, targetTabId, targetFrameId, data, origin } = event;
    const sourceWin = this.lookupFrame(sourceTabId, sourceFrameId)?.window;
    const targetWin = this.lookupFrame(targetTabId, targetFrameId)?.window;
    if (!sourceWin || !targetWin) return;

    targetWin.dispatchMessage(data, origin, sourceWin);
  }

  // ---------------------------------------------------------------------------
  // Private: helpers
  // ---------------------------------------------------------------------------

  private findActiveDocument(frameNode: FrameNode): DocumentNode | undefined {
    return frameNode.documents?.find(d => !d.stale);
  }

  /** Find a frame node in the hierarchy state by frameId (searches all tabs). */
  findFrameInHierarchyState(frameId: number): FrameNode | undefined {
    for (const tab of this.hierarchyState.root) {
      const found = this.findFrameInTabNode(tab, frameId);
      if (found) return found;
    }
    return undefined;
  }

  private findFrameInTabNode(tab: TabNode, frameId: number): FrameNode | undefined {
    if (!tab.frames) return undefined;
    for (const frame of tab.frames) {
      const found = this.findFrameRecursive(frame, frameId);
      if (found) return found;
    }
    return undefined;
  }

  private findIframeInHierarchyState(iframeId: number): IframeNode | undefined {
    for (const tab of this.hierarchyState.root) {
      const found = this.findIframeInTabNode(tab, iframeId);
      if (found) return found;
    }
    return undefined;
  }

  private findIframeInTabNode(tab: TabNode, iframeId: number): IframeNode | undefined {
    if (!tab.frames) return undefined;
    for (const frame of tab.frames) {
      const found = this.findIframeRecursive(frame, iframeId);
      if (found) return found;
    }
    return undefined;
  }

  private findIframeRecursive(frame: FrameNode, iframeId: number): IframeNode | undefined {
    if (!frame.documents) return undefined;
    for (const doc of frame.documents) {
      if (!doc.iframes) continue;
      for (const iframe of doc.iframes) {
        if (iframe.iframeId === iframeId) return iframe;
        if (iframe.frame) {
          const found = this.findIframeRecursive(iframe.frame, iframeId);
          if (found) return found;
        }
      }
    }
    return undefined;
  }

  private findFrameRecursive(frame: FrameNode, frameId: number): FrameNode | undefined {
    if (frame.frameId === frameId) return frame;
    if (!frame.documents) return undefined;
    for (const doc of frame.documents) {
      if (!doc.iframes) continue;
      for (const iframe of doc.iframes) {
        if (iframe.frame) {
          const found = this.findFrameRecursive(iframe.frame, frameId);
          if (found) return found;
        }
      }
    }
    return undefined;
  }
}
