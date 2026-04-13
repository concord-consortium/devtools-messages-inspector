import { makeAutoObservable } from 'mobx';
import type { FrameDocument } from './FrameDocument';
import type { Frame } from './Frame';

export interface DocumentBySourceIdLookup {
  getDocumentBySourceId(sourceId: string): FrameDocument | undefined;
}

export class IFrame {
  domPath: string;
  src: string | undefined;
  id: string | undefined;
  sourceIdFromParent: string | undefined;
  readonly parentDocument: FrameDocument;
  childFrame: Frame | undefined;
  removedFromHierarchy: boolean;
  private readonly docLookup: DocumentBySourceIdLookup;

  constructor(
    parentDocument: FrameDocument,
    domPath: string,
    src: string | undefined,
    id: string | undefined,
    docLookup: DocumentBySourceIdLookup,
  ) {
    this.parentDocument = parentDocument;
    this.domPath = domPath;
    this.src = src || undefined;
    this.id = id || undefined;
    this.sourceIdFromParent = undefined;
    this.childFrame = undefined;
    this.removedFromHierarchy = false;
    this.docLookup = docLookup;

    makeAutoObservable<this, 'docLookup'>(this, {
      parentDocument: false,
      docLookup: false,
    });
  }

  /** Document with matching sourceId that has no frame — belongs to this IFrame but can't be linked to a Frame yet. */
  get orphanedDocument(): FrameDocument | undefined {
    if (this.childFrame || !this.sourceIdFromParent) return undefined;
    const doc = this.docLookup.getDocumentBySourceId(this.sourceIdFromParent);
    return doc && !doc.frame ? doc : undefined;
  }
}
