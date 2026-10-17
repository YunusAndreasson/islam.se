// Lookups by element type, for assertions about what a component was RENDERED with.
//
// RNTL 14 renders through test-renderer, whose tree holds host elements only, so the
// composite lookups react-test-renderer offered (UNSAFE_getByType, UNSAFE_root.findAll…)
// are gone. A few assertions here are about a composite's props on purpose: a mocked Skia
// <Path> renders nothing at all, and FlatList's initialScrollIndex never reaches a host
// view. `allOfType` walks the React fiber tree behind the rendered output instead, through
// test-renderer's `unstable_fiber`. This file is the one place tests depend on fiber
// internals; prefer `hostsOfType` (or a real query) whenever the element is a host.

import { screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { first } from './at';

interface Fiber {
  type: unknown;
  elementType: unknown;
  memoizedProps: Record<string, any> | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
}

/** A rendered element: its type and the props it was last rendered with. */
export interface Rendered {
  type: unknown;
  /** The type as written in JSX — differs from `type` for memo() and forwardRef(). */
  elementType: unknown;
  props: Record<string, any>;
}

/** Every rendered HOST element whose type is `type` (a mocked native view such as
 *  MapLibre's 'Layer', or RN's own 'RCTScrollView'). Live: `props` reads the current
 *  props on every access. */
export function hostsOfType(type: string): TestInstance[] {
  return screen.container.queryAll((node) => node.type === type);
}

/** Every rendered element — component (memo/forwardRef included) or host — that matches
 *  `predicate`, in tree order, with the props it was last rendered with. A snapshot: read
 *  it again after a rerender. */
export function allRendered(predicate: (element: Rendered) => boolean): Rendered[] {
  const host = screen.container.queryAll(() => true)[0];
  let fiber = host?.unstable_fiber as Fiber | null | undefined;
  if (!fiber) return [];
  while (fiber.return) fiber = fiber.return;

  const found: Rendered[] = [];
  const visit = (start: Fiber | null) => {
    for (let node = start; node; node = node.sibling) {
      if (node.memoizedProps) {
        const element = { type: node.type, elementType: node.elementType, props: node.memoizedProps };
        if (predicate(element)) found.push(element);
      }
      visit(node.child);
    }
  };
  visit(fiber);
  return found;
}

/** Every rendered element of `type` (a component or a host string). */
export function allOfType(type: unknown): Rendered[] {
  return allRendered((element) => element.type === type || element.elementType === type);
}

/** The one rendered element of `type`, or a test failure that says how many there were. */
export function oneOfType(type: unknown, what = 'element'): Rendered {
  const found = allOfType(type);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one rendered ${what}, found ${found.length}. The component tree ` +
        `no longer has the shape this assertion was written against.`,
    );
  }
  return first(found, what);
}
