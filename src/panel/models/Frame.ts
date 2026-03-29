// Frame - Stable identity for an iframe, keyed by (tabId, frameId)

import { makeAutoObservable, observable } from 'mobx';
import { FrameDocument } from './FrameDocument';

export interface FrameLookup {
  getFramesByParent(tabId: number, parentFrameId: number): Frame[];
}

export class Frame {
  readonly tabId: number;
  readonly frameId: number;
  parentFrameId: number | undefined;
  parentDocumentId: string | undefined;
  documents: FrameDocument[] = [];
  isOpener = false;
  private readonly frameLookup: FrameLookup;

  constructor(tabId: number, frameId: number, frameLookup: FrameLookup, parentFrameId: number | undefined = undefined) {
    this.frameLookup = frameLookup;
    this.tabId = tabId;
    this.frameId = frameId;
    this.parentFrameId = parentFrameId;

    makeAutoObservable<this, 'frameLookup'>(this, {
      tabId: false,
      frameId: false,
      frameLookup: false,
      documents: observable.shallow,
    });
  }

  get currentDocument(): FrameDocument | undefined {
    return this.documents.length > 0 ? this.documents[this.documents.length - 1] : undefined;
  }

  get children(): Frame[] {
    return this.frameLookup.getFramesByParent(this.tabId, this.frameId);
  }

  static key(tabId: number, frameId: number): string {
    return `${tabId}:${frameId}`;
  }

  get key(): string {
    return Frame.key(this.tabId, this.frameId);
  }
}
