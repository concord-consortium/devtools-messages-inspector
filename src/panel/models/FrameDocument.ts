// FrameDocument - A specific document loaded in a frame, keyed by documentId

import { makeAutoObservable, observable } from 'mobx';
import type { Frame } from './Frame';
import type { IFrame } from './IFrame';

export interface SourceIdRecord {
  sourceId: string;
  sourceType: string;
  targetTabId: number;
  targetFrameId: number;
  targetDocumentId: string | undefined;
}

export interface ChangeRecord {
  time: number;
  type: 'merge' | 'promotion';
  createdAtOfMerged?: number;
}

export class FrameDocument {
  documentId: string | undefined;
  url: string | undefined;
  origin: string | undefined;
  title: string | undefined;
  frame: Frame | undefined;
  iframes: IFrame[] = [];
  sourceIdRecords: SourceIdRecord[] = [];
  createdAt: number;
  changes: ChangeRecord[] = [];

  constructor(init: {
    documentId?: string;
    url?: string;
    origin?: string;
    title?: string;
  }) {
    this.documentId = init.documentId;
    this.url = init.url;
    this.origin = init.origin;
    this.title = init.title;
    this.frame = undefined;
    this.createdAt = Date.now();

    makeAutoObservable(this, {
      iframes: observable.shallow,
      sourceIdRecords: observable.shallow,
      changes: observable.shallow,
    });
  }

  get label(): string {
    return this.url || this.origin || this.sourceIdRecords[0]?.sourceId || '(unknown)';
  }

  get stableId(): string {
    return this.documentId || this.sourceIdRecords[0]?.sourceId || String(this.createdAt);
  }

  addSourceIdRecord(record: SourceIdRecord): void {
    const isDuplicate = this.sourceIdRecords.some(r => r.sourceId === record.sourceId);
    if (!isDuplicate) {
      this.sourceIdRecords.push(record);
    }
  }

  mergeSourceIdRecords(other: FrameDocument): void {
    for (const record of other.sourceIdRecords) {
      this.addSourceIdRecord(record);
    }
  }
}
