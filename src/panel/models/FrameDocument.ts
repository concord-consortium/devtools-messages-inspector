// FrameDocument - A specific document loaded in a frame, keyed by documentId

import { makeAutoObservable, observable } from 'mobx';
import type { Frame } from './Frame';
import type { IFrame } from './IFrame';

export class FrameDocument {
  documentId: string | undefined;
  url: string | undefined;
  origin: string | undefined;
  title: string | undefined;
  sourceId: string | undefined;
  frame: Frame | undefined;
  iframes: IFrame[] = [];

  constructor(init: {
    documentId?: string;
    url?: string;
    origin?: string;
    title?: string;
    sourceId?: string;
  }) {
    this.documentId = init.documentId;
    this.url = init.url;
    this.origin = init.origin;
    this.title = init.title;
    this.sourceId = init.sourceId;
    this.frame = undefined;

    makeAutoObservable(this, {
      iframes: observable.shallow,
    });
  }
}
