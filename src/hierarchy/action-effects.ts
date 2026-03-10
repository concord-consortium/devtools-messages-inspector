import type { HierarchyState } from './reducer';
import type { HierarchyAction } from './actions';
import type { HierarchyEvent } from './events';

export interface ActionResult {
  state: HierarchyState;
  events: HierarchyEvent[];
}

export function applyAction(state: HierarchyState, action: HierarchyAction): ActionResult {
  throw new Error('Not implemented');
}
