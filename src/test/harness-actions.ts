import { HarnessRuntime } from './harness-runtime';
import type { HarnessFrame } from './harness-models';

export class HarnessActions {
  constructor(private runtime: HarnessRuntime) {}

  /** Create an independent tab. Returns the top HarnessFrame. */
  createTab(config: { url: string; title?: string }): HarnessFrame {
    const prevNextTabId = this.runtime.hierarchyState.nextTabId;

    this.runtime.dispatch({
      type: 'create-tab',
      url: config.url,
      title: config.title,
    });

    const tab = this.runtime.getTab(prevNextTabId)!;
    return tab.getFrame(0)!;
  }

  /** Add an iframe to a parent frame's active document. Returns the child HarnessFrame. */
  addIframe(parentFrame: HarnessFrame, config: { url: string; iframeId?: string; title?: string }): HarnessFrame {
    const frameNode = this.runtime.findFrameInHierarchyState(parentFrame.frameId);
    const activeDoc = frameNode?.documents?.find((d) => !d.stale);
    if (!activeDoc?.documentId) {
      throw new Error(`Cannot find active document for frame ${parentFrame.frameId}`);
    }

    const prevNextFrameId = this.runtime.hierarchyState.nextFrameId;

    this.runtime.dispatch({
      type: 'add-iframe',
      documentId: activeDoc.documentId,
      url: config.url,
      title: config.title,
    });

    const childFrame = this.runtime.getFrame(prevNextFrameId)!;

    // Set the iframe element id (DOM attribute, not a hierarchy concept)
    if (config.iframeId) {
      const iframes = parentFrame.window!.document.querySelectorAll('iframe');
      const lastIframe = iframes[iframes.length - 1];
      if (lastIframe) {
        lastIframe.id = config.iframeId;
      }
    }

    return childFrame;
  }

  /** Open a popup from a source frame. Returns the popup's top HarnessFrame. */
  openPopup(sourceFrame: HarnessFrame, config: { url: string; title?: string }): HarnessFrame {
    const prevNextTabId = this.runtime.hierarchyState.nextTabId;

    this.runtime.dispatch({
      type: 'open-tab',
      tabId: sourceFrame.tab.id,
      frameId: sourceFrame.frameId,
      url: config.url,
      title: config.title,
    });

    const tab = this.runtime.getTab(prevNextTabId)!;
    return tab.getFrame(0)!;
  }

  /** Navigate a frame to a new URL. */
  navigate(frame: HarnessFrame, config: { url: string; title?: string }): void {
    this.runtime.dispatch({
      type: 'navigate-frame',
      frameId: frame.frameId,
      url: config.url,
      title: config.title,
    });
  }
}
