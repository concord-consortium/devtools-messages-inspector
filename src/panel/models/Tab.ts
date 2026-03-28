import { makeAutoObservable } from 'mobx';
import type { Frame } from './Frame';

export class Tab {
  readonly tabId: number;
  rootFrame: Frame;
  openerTab: Tab | undefined;
  openedTabs: Tab[] = [];

  constructor(tabId: number, rootFrame: Frame) {
    this.tabId = tabId;
    this.rootFrame = rootFrame;
    this.openerTab = undefined;

    makeAutoObservable(this, {
      tabId: false,
    });
  }
}
