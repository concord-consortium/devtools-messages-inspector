// Build a liqe filter string from a cell's column and message.
// Used by the "Filter by this value" context menu.

import type { Message } from './Message';

function escapeLiqeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildCellFilter(
  msg: Message,
  colId: string,
  getCellValue: (msg: Message, colId: string) => string,
): string {
  switch (colId) {
    case 'messageType':
      return `data.type:"${escapeLiqeValue(msg.messageType || '')}"`;
    case 'target.document.origin':
      return `target.origin:"${escapeLiqeValue(getCellValue(msg, colId))}"`;
    case 'source.document.origin':
      return `source.origin:"${escapeLiqeValue(getCellValue(msg, colId))}"`;
    case 'direction':
    case 'sourceType':
      return `sourceType:${msg.sourceType}`;
    default:
      return getCellValue(msg, colId);
  }
}
