import { Message } from './Message';

interface ExportedOwnerElement {
  domPath: string;
  src: string | undefined;
  id: string | undefined;
}

interface ExportedMessage {
  id: string;
  timestamp: number;
  data: unknown;
  buffered: boolean | undefined;
  source: {
    type: string;
    origin: string;
    sourceId: string | null;
    iframe: { src: string; id: string; domPath: string } | null;
    frameId: number | undefined;
    tabId: number | undefined;
    documentId: string | undefined;
  };
  target: {
    url: string;
    origin: string;
    documentTitle: string;
    frameId: number;
    tabId: number;
    documentId: string | undefined;
  };
  sourceOwnerElement: ExportedOwnerElement | undefined;
  targetOwnerElement: ExportedOwnerElement | undefined;
}

export interface ExportEnvelope {
  version: number;
  exportedAt: string;
  messageCount: number;
  messages: ExportedMessage[];
}

function serializeOwnerElement(oe: { domPath: string; src: string | undefined; id: string | undefined } | undefined): ExportedOwnerElement | undefined {
  if (!oe) return undefined;
  return { domPath: oe.domPath, src: oe.src, id: oe.id };
}

function serializeMessage(msg: Message): ExportedMessage {
  return {
    id: msg.id,
    timestamp: msg.timestamp,
    data: msg.data,
    buffered: msg.buffered,
    source: {
      type: msg.source.type,
      origin: msg.source.origin,
      sourceId: msg.source.sourceId,
      iframe: msg.source.iframe,
      frameId: msg.source.frameId,
      tabId: msg.source.tabId,
      documentId: msg.source.documentId,
    },
    target: {
      url: msg.target.url,
      origin: msg.target.origin,
      documentTitle: msg.target.documentTitle,
      frameId: msg.target.frameId,
      tabId: msg.target.tabId,
      documentId: msg.target.documentId,
    },
    sourceOwnerElement: serializeOwnerElement(msg.sourceOwnerElement),
    targetOwnerElement: serializeOwnerElement(msg.targetOwnerElement),
  };
}

export function serializeMessagesForExport(messages: Message[]): ExportEnvelope {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(serializeMessage),
  };
}

export function downloadMessagesAsJson(messages: Message[]): void {
  const envelope = serializeMessagesForExport(messages);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
  const filename = `messages-${timestamp}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
