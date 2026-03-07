// Frame - Stable identity for an iframe, keyed by (tabId, frameId)

import { makeAutoObservable } from 'mobx';
import { FrameDocument } from './FrameDocument';
import { OwnerElement } from './OwnerElement';

export interface FrameLookup {
  getFramesByParent(tabId: number, parentFrameId: number): Frame[];
}

export class Frame {
  readonly tabId: number;
  readonly frameId: number;
  parentFrameId: number | undefined;
  currentDocument: FrameDocument | undefined;
  currentOwnerElement: OwnerElement | undefined;
  iframes: Array<{src: string; id: string; domPath: string; sourceId?: string}> = [];
  isOpener = false;
  private readonly frameLookup: FrameLookup;

  constructor(tabId: number, frameId: number, frameLookup: FrameLookup, parentFrameId: number | undefined = undefined) {
    this.frameLookup = frameLookup;
    this.tabId = tabId;
    this.frameId = frameId;
    this.parentFrameId = parentFrameId;
    this.currentDocument = undefined;
    this.currentOwnerElement = undefined;

    makeAutoObservable<this, 'frameLookup'>(this, {
      tabId: false,
      frameId: false,
      frameLookup: false,
    });
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
