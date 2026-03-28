// FrameStore - Manages Frame and FrameDocument instances with reactive MobX maps

import { makeAutoObservable, observable } from 'mobx';
import { Frame, FrameLookup } from './Frame';
import { FrameDocument } from './FrameDocument';
import { IFrame } from './IFrame';
import { Tab } from './Tab';
import type { IframeElementInfo } from '../../types';

export class FrameStore implements FrameLookup {
  // Primary indices
  frames = observable.map<string, Frame>();
  documents = observable.map<string, FrameDocument>();
  // Secondary index for source correlation
  documentsBySourceId = observable.map<string, FrameDocument>();
  currentHierarchyFrameKeys = observable.set<string>();
  tabs = observable.map<number, Tab>();

  constructor() {
    makeAutoObservable(this, {
      frames: false,
      documents: false,
      documentsBySourceId: false,
      currentHierarchyFrameKeys: false,
      tabs: false,
    });
  }

  getDocumentById(documentId: string | undefined): FrameDocument | undefined {
    if (!documentId) return undefined;
    return this.documents.get(documentId);
  }

  getDocumentBySourceId(sourceId: string | undefined | null): FrameDocument | undefined {
    if (!sourceId) return undefined;
    return this.documentsBySourceId.get(sourceId);
  }

  getFrame(tabId: number, frameId: number): Frame | undefined {
    return this.frames.get(Frame.key(tabId, frameId));
  }

  getFramesByParent(tabId: number, parentFrameId: number): Frame[] {
    const result: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.tabId === tabId && frame.parentFrameId === parentFrameId) {
        result.push(frame);
      }
    }
    return result;
  }

  getOrCreateTab(tabId: number): Tab {
    let tab = this.tabs.get(tabId);
    if (!tab) {
      const rootFrame = this.getOrCreateFrame(tabId, 0);
      tab = new Tab(tabId, rootFrame);
      this.tabs.set(tabId, tab);
    }
    return tab;
  }

  getOrCreateFrame(tabId: number, frameId: number, parentFrameId?: number): Frame {
    const key = Frame.key(tabId, frameId);
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new Frame(tabId, frameId, this, parentFrameId);
      this.frames.set(key, frame);
    }
    return frame;
  }

  getOrCreateDocumentById(documentId: string): FrameDocument {
    let doc = this.documents.get(documentId);
    if (!doc) {
      doc = new FrameDocument({ documentId });
      this.documents.set(documentId, doc);
    }
    return doc;
  }

  getOrCreateDocumentBySourceId(sourceId: string): FrameDocument {
    let doc = this.documentsBySourceId.get(sourceId);
    if (!doc) {
      doc = new FrameDocument({ sourceId });
      this.documentsBySourceId.set(sourceId, doc);
    }
    return doc;
  }

  getOrCreateIFrame(
    parentDocument: FrameDocument,
    sourceId: string | undefined,
    iframeInfo: IframeElementInfo | undefined,
  ): IFrame {
    // Match by sourceId if available
    if (sourceId) {
      const existing = parentDocument.iframes.find(i => i.sourceId === sourceId);
      if (existing) {
        // Update mutable properties
        if (iframeInfo) {
          existing.domPath = iframeInfo.domPath;
          existing.src = iframeInfo.src || undefined;
          existing.id = iframeInfo.id || undefined;
        }
        return existing;
      }
    }

    // Create new IFrame
    const iframe = new IFrame(
      parentDocument,
      iframeInfo?.domPath ?? '',
      iframeInfo?.src,
      iframeInfo?.id,
    );
    if (sourceId) {
      iframe.sourceId = sourceId;
    }
    parentDocument.iframes.push(iframe);
    return iframe;
  }

  get hierarchyRoots(): Frame[] {
    const roots: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.parentFrameId === -1) {
        roots.push(frame);
      } else if (frame.parentFrameId !== undefined
        && !this.frames.has(Frame.key(frame.tabId, frame.parentFrameId))) {
        roots.push(frame);
      }
    }
    return roots;
  }

  get nonHierarchyFrames(): Frame[] {
    const result: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.parentFrameId === undefined) {
        result.push(frame);
      }
    }
    return result;
  }

  // Called when hierarchy data arrives from webNavigation.getAllFrames()
  processHierarchy(frames: Array<{
    frameId: number;
    tabId: number;
    documentId?: string;
    sourceId?: string;
    url: string;
    parentFrameId: number;
    title: string;
    origin: string;
    iframes: { src: string; id: string; domPath: string; sourceId?: string }[];
    isOpener?: boolean;
  }>): void {
    this.currentHierarchyFrameKeys.clear();

    for (const frameData of frames) {
      this.currentHierarchyFrameKeys.add(Frame.key(frameData.tabId, frameData.frameId));

      const frame = this.getOrCreateFrame(frameData.tabId, frameData.frameId, frameData.parentFrameId);
      frame.parentFrameId = frameData.parentFrameId;
      frame.isOpener = frameData.isOpener ?? false;

      let doc: FrameDocument | undefined;
      if (frameData.documentId) {
        doc = this.getOrCreateDocumentById(frameData.documentId);
      } else if (frameData.sourceId) {
        doc = this.getOrCreateDocumentBySourceId(frameData.sourceId);
      }

      if (doc) {
        doc.url = frameData.url;
        doc.origin = frameData.origin;
        doc.title = frameData.title;
        doc.frame = frame;
      } else if (frameData.url || frameData.origin || frameData.title) {
        doc = new FrameDocument({
          url: frameData.url || undefined,
          origin: frameData.origin || undefined,
          title: frameData.title || undefined,
        });
      }

      // Add doc to frame.documents if not already present
      if (doc && !frame.documents.includes(doc)) {
        frame.documents.push(doc);
      }

      // Create IFrame entities for each iframe element in this frame's document
      if (doc) {
        for (const iframeData of frameData.iframes) {
          const childFrame = iframeData.sourceId
            ? this.getDocumentBySourceId(iframeData.sourceId)?.frame
            : undefined;
          const iframe = this.getOrCreateIFrame(doc, iframeData.sourceId, iframeData);
          if (childFrame) {
            iframe.childFrame = childFrame;
          }
        }
      }
    }
  }

  clear(): void {
    this.frames.clear();
    this.documents.clear();
    this.documentsBySourceId.clear();
    this.currentHierarchyFrameKeys.clear();
    this.tabs.clear();
  }
}

// Singleton instance
export const frameStore = new FrameStore();
