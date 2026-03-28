import { makeAutoObservable } from 'mobx';
import type { FrameDocument } from './FrameDocument';
import type { Frame } from './Frame';

export class IFrame {
  domPath: string;
  src: string | undefined;
  id: string | undefined;
  sourceId: string | undefined;
  readonly parentDocument: FrameDocument;
  childFrame: Frame | undefined;

  constructor(
    parentDocument: FrameDocument,
    domPath: string,
    src: string | undefined,
    id: string | undefined,
  ) {
    this.parentDocument = parentDocument;
    this.domPath = domPath;
    this.src = src || undefined;
    this.id = id || undefined;
    this.sourceId = undefined;
    this.childFrame = undefined;

    makeAutoObservable(this, {
      parentDocument: false,
    });
  }
}
