// FrameStore - Manages Frame and FrameDocument instances with reactive MobX maps

import { makeAutoObservable, observable } from 'mobx';
import { Frame, FrameLookup } from './Frame';
import { FrameDocument } from './FrameDocument';

export class FrameStore implements FrameLookup {
  // Primary indices
  frames = observable.map<string, Frame>();
  documents = observable.map<string, FrameDocument>();
  // Secondary index for source correlation
  documentsBySourceId = observable.map<string, FrameDocument>();
  currentHierarchyFrameKeys = observable.set<string>();

  constructor() {
    makeAutoObservable(this, {
      frames: false,
      documents: false,
      documentsBySourceId: false,
      currentHierarchyFrameKeys: false,
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

  get hierarchyRoots(): Frame[] {
    const roots: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.parentFrameId === -1) {
        roots.push(frame);
      } else if (frame.parentFrameId !== undefined
        && !this.frames.has(Frame.key(frame.tabId, frame.parentFrameId))) {
        // Orphaned frame: has a parent ID but parent doesn't exist in the store.
        // Treat as root so it remains visible in the UI.
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
    // Track which frames are in the current hierarchy
    this.currentHierarchyFrameKeys.clear();

    // Create/update frames and documents
    for (const frameData of frames) {
      this.currentHierarchyFrameKeys.add(Frame.key(frameData.tabId, frameData.frameId));

      const frame = this.getOrCreateFrame(frameData.tabId, frameData.frameId, frameData.parentFrameId);
      frame.parentFrameId = frameData.parentFrameId;
      frame.iframes = frameData.iframes;
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
      frame.currentDocument = doc;
    }
  }

  clear(): void {
    this.frames.clear();
    this.documents.clear();
    this.documentsBySourceId.clear();
    this.currentHierarchyFrameKeys.clear();
  }
}

// Singleton instance
export const frameStore = new FrameStore();
