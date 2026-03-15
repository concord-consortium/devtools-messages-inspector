export type EventScope = 'chrome' | 'dom' | 'window';

export type HierarchyEvent =
  | { scope: 'chrome'; type: 'onCommitted'; tabId: number; frameId: number; url: string; transitionType?: string }
  | { scope: 'chrome'; type: 'onCreatedNavigationTarget'; sourceTabId: number; sourceFrameId: number; tabId: number; url: string }
  | { scope: 'chrome'; type: 'onTabRemoved'; tabId: number }
  | { scope: 'chrome'; type: 'onTabCreated'; tabId: number }
  | { scope: 'dom'; type: 'iframeAdded'; tabId: number; parentFrameId: number; frameId: number; src: string }
  | { scope: 'dom'; type: 'iframeRemoved'; tabId: number; parentFrameId: number; iframeId: number }
  | { scope: 'window'; type: 'message'; sourceTabId: number; sourceFrameId: number; targetTabId: number; targetFrameId: number; data: any; origin: string };
