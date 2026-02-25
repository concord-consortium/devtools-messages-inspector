// Message class - Observable message with computed properties

import { makeAutoObservable, observable } from 'mobx';
import { REGISTRATION_MESSAGE_TYPE } from '../types';
import { frameStore } from './models';
import type { Frame } from './models/Frame';
import type { FrameDocument } from './models/FrameDocument';
import type { OwnerElement } from './models/OwnerElement';
import { IMessage } from '../types';

class Message implements IMessage {
  // Store all IMessage properties directly
  id: string;
  timestamp: number;
  target: IMessage['target'];
  data: unknown;
  buffered?: boolean;

  // Store source separately to override frameId with computed value
  private _source: IMessage['source'];

  // Raw identifiers for FrameStore lookups
  readonly targetDocumentId: string | undefined;
  readonly sourceSourceId: string | null;
  readonly sourceDocumentId: string | undefined;
  readonly sourceType: string;

  // Owner element snapshots (set at message creation time)
  readonly sourceOwnerElement: OwnerElement | undefined;
  readonly targetOwnerElement: OwnerElement | undefined;

  constructor(msg: IMessage, targetOwnerElement: OwnerElement | undefined, sourceOwnerElement: OwnerElement | undefined) {
    // Copy all properties directly
    this.id = msg.id;
    this.timestamp = msg.timestamp;
    this.target = msg.target;
    this.data = msg.data;
    this.buffered = msg.buffered;
    this._source = msg.source;

    // Raw identifiers
    this.targetDocumentId = msg.target.documentId;
    this.sourceSourceId = msg.source.sourceId;
    this.sourceDocumentId = msg.source.documentId;
    this.sourceType = msg.source.type;

    // Owner element snapshots
    this.targetOwnerElement = targetOwnerElement;
    this.sourceOwnerElement = sourceOwnerElement;

    makeAutoObservable<this, '_source'>(this, {
      target: observable.ref,
      data: observable.ref,
      _source: observable.ref,
      targetDocumentId: false,
      sourceSourceId: false,
      sourceDocumentId: false,
      sourceType: false,
      sourceOwnerElement: false,
      targetOwnerElement: false,
    });
  }

  // Check if this is a registration message (cached getter)
  get isRegistrationMessage(): boolean {
    return (this.data as { type?: string })?.type === REGISTRATION_MESSAGE_TYPE;
  }

  // Get registration data (cached getter, only valid if isRegistrationMessage is true)
  get registrationData(): { frameId: number; tabId: number; documentId: string } | null {
    if (!this.isRegistrationMessage) return null;
    const data = this.data as { frameId: number; tabId: number; documentId: string };
    return { frameId: data.frameId, tabId: data.tabId, documentId: data.documentId };
  }

  // Source with computed frameId (backward compatibility with IMessage)
  get source(): IMessage['source'] {
    return {
      ...this._source,
      frameId: this.computedFrameId
    };
  }

  // Computed frameId - automatically updates when frameStore changes
  private get computedFrameId(): number | undefined {
    // If message has native frameId (e.g., parent messages), use it
    if (this._source.frameId !== undefined) {
      return this._source.frameId;
    }

    // Try resolving via FrameStore
    const sourceDoc = this.sourceDocument;
    if (sourceDoc?.frame) {
      return sourceDoc.frame.frameId;
    }

    return undefined;
  }

  // Computed: target FrameDocument
  get targetDocument(): FrameDocument | undefined {
    return frameStore.getDocumentById(this.targetDocumentId);
  }

  // Computed: source FrameDocument
  get sourceDocument(): FrameDocument | undefined {
    if (this.sourceDocumentId) {
      const doc = frameStore.getDocumentById(this.sourceDocumentId);
      if (doc) return doc;
    }
    if (this.sourceSourceId) {
      return frameStore.getDocumentBySourceId(this.sourceSourceId);
    }
    return undefined;
  }

  // Computed: target Frame
  get targetFrame(): Frame | undefined {
    return this.targetDocument?.frame;
  }

  // Computed: source Frame
  get sourceFrame(): Frame | undefined {
    return this.sourceDocument?.frame;
  }

  // Derived from data — computed once and cached by MobX since data never changes
  get dataPreview(): string {
    try {
      const str = JSON.stringify(this.data);
      if (str.length <= 100) return str;
      return str.substring(0, 100) + '...';
    } catch {
      return String(this.data).substring(0, 100);
    }
  }

  get dataSize(): number {
    try {
      return new Blob([JSON.stringify(this.data)]).size;
    } catch {
      return 0;
    }
  }

  get messageType(): string | null {
    const data = this.data;
    if (data && typeof data === 'object' && 'type' in data && typeof (data as { type: unknown }).type === 'string') {
      return (data as { type: string }).type;
    }
    return null;
  }
}

export { Message };
