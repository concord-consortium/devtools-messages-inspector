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
  // Index from iframe contentWindow sourceId to IFrame entity
  iframesBySourceIdFromParent = observable.map<string, IFrame>();
  currentHierarchyFrameKeys = observable.set<string>();
  tabs = observable.map<number, Tab>();

  constructor() {
    makeAutoObservable(this, {
      frames: false,
      documents: false,
      documentsBySourceId: false,
      iframesBySourceIdFromParent: false,
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
      doc = new FrameDocument({});
      this.documentsBySourceId.set(sourceId, doc);
      // If an IFrame with this sourceId has a linked child frame, place the doc there
      const iframe = this.iframesBySourceIdFromParent.get(sourceId);
      if (iframe?.childFrame && !doc.frame) {
        doc.frame = iframe.childFrame;
        if (!iframe.childFrame.documents.includes(doc)) {
          iframe.childFrame.documents.push(doc);
        }
      }
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
      const existing = parentDocument.iframes.find(i => i.sourceIdFromParent === sourceId);
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
      this,
    );
    if (sourceId) {
      iframe.sourceIdFromParent = sourceId;
      this.iframesBySourceIdFromParent.set(sourceId, iframe);
    }
    parentDocument.iframes.push(iframe);
    return iframe;
  }

  /** Find the IFrame entity whose childFrame matches the given frame, if any. */
  findOwnerIFrame(frame: Frame): IFrame | undefined {
    for (const doc of this.documents.values()) {
      for (const iframe of doc.iframes) {
        if (iframe.childFrame === frame) return iframe;
      }
    }
    for (const doc of this.documentsBySourceId.values()) {
      for (const iframe of doc.iframes) {
        if (iframe.childFrame === frame) return iframe;
      }
    }
    return undefined;
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

  // Documents in documentsBySourceId that have no frame link and no owning IFrame
  get unknownDocuments(): FrameDocument[] {
    const result: FrameDocument[] = [];
    for (const [sourceId, doc] of this.documentsBySourceId.entries()) {
      if (!doc.frame && !this.iframesBySourceIdFromParent.has(sourceId)) {
        result.push(doc);
      }
    }
    return result;
  }

  // Child frames of parentFrame that don't appear as childFrame on any IFrame in parentDocument.
  // Only includes children whose parentDocumentId matches (or is unknown).
  getUnknownChildFrames(parentFrame: Frame, parentDocument: FrameDocument): Frame[] {
    const knownChildFrames = new Set<Frame>();
    for (const iframe of parentDocument.iframes) {
      if (iframe.childFrame) {
        knownChildFrames.add(iframe.childFrame);
      }
    }
    const parentDocId = parentDocument.documentId;
    return parentFrame.children.filter(child => {
      if (knownChildFrames.has(child)) return false;
      // If we know the child's parent document, only include it under the matching document
      if (child.parentDocumentId && parentDocId && child.parentDocumentId !== parentDocId) return false;
      return true;
    });
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

      // Derive parentDocumentId from the parent frame's current document
      if (frameData.parentFrameId >= 0 && !frame.parentDocumentId) {
        const parentFrame = this.getFrame(frameData.tabId, frameData.parentFrameId);
        const parentDoc = parentFrame?.currentDocument;
        if (parentDoc?.documentId) {
          frame.parentDocumentId = parentDoc.documentId;
        }
      }

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
      } else {
        // Opener frames should always have sourceId from the content script;
        // getAllFrames entries always have documentId. If neither is present,
        // something unexpected happened. See docs/frame-state-analysis.md
        // "When hierarchy is requested" for the expected data sources.
        console.warn(
          `[Messages Inspector] hierarchy frame missing both documentId and sourceId — ` +
          `frame ${frameData.frameId}, tab ${frameData.tabId}, url: ${frameData.url}`,
        );
      }

      // Add doc to frame.documents if not already present
      if (doc && !frame.documents.includes(doc)) {
        frame.documents.push(doc);
      }

      // Create/update IFrame entities for each iframe element in this frame's document
      if (doc) {
        const incomingSourceIds = new Set<string>();
        for (const iframeData of frameData.iframes) {
          if (!iframeData.sourceId) {
            // sourceId comes from contentWindow identity and should always be
            // present. See docs/frame-state-analysis.md "When hierarchy is requested".
            console.warn(
              `[Messages Inspector] iframe missing sourceId in hierarchy data — ` +
              `frame ${frameData.frameId}, domPath: ${iframeData.domPath}, src: ${iframeData.src}`,
            );
            continue;
          }
          incomingSourceIds.add(iframeData.sourceId);
          const childFrame = this.getDocumentBySourceId(iframeData.sourceId)?.frame;
          const iframe = this.getOrCreateIFrame(doc, iframeData.sourceId, iframeData);
          iframe.removedFromHierarchy = false;
          if (childFrame) {
            iframe.childFrame = childFrame;
          }
          // If a document exists for this sourceId but has no frame, link it to the child frame
          if (iframe.childFrame) {
            const orphanDoc = this.documentsBySourceId.get(iframeData.sourceId);
            if (orphanDoc && !orphanDoc.frame) {
              orphanDoc.frame = iframe.childFrame;
              if (!iframe.childFrame.documents.includes(orphanDoc)) {
                iframe.childFrame.documents.push(orphanDoc);
              }
            }
          }
        }

        // Mark iframes that were previously known but absent from this hierarchy refresh
        for (const existing of doc.iframes) {
          if (existing.sourceIdFromParent && !incomingSourceIds.has(existing.sourceIdFromParent)) {
            existing.removedFromHierarchy = true;
          }
        }
      }
    }
  }

  clear(): void {
    this.frames.clear();
    this.documents.clear();
    this.documentsBySourceId.clear();
    this.iframesBySourceIdFromParent.clear();
    this.currentHierarchyFrameKeys.clear();
    this.tabs.clear();
  }
}

// Singleton instance
export const frameStore = new FrameStore();
