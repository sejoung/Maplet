export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Side = 'left' | 'right';
export interface NodePosition {
  x: number;
  y: number;
}

export interface MindNode {
  id: string;
  originalId: string | number;
  title: string;
  children: string[];
  parentId: string | null;
  rank: string;
  side: Side;
  collapsed: boolean;
  style: JsonObject;
  notes: string;
  links: string[];
  position: NodePosition | null;
  rawExtensions: JsonObject;
  nativeExtensions?: JsonObject;
}

/** A cross-link drawn from one node to another, outside the hierarchy. */
export interface Connection {
  from: string;
  to: string;
}

export interface MindMap {
  nativeExtensions?: JsonObject;
  /** Cross-links; absent when a document never had any. */
  connections?: Connection[];
  formatVersion: 1 | 2 | 3;
  roots: string[];
  nodes: Record<string, MindNode>;
  rawExtensions: JsonObject;
  original: string | null;
  warnings: string[];
}

export const MAX_TITLE = 10_000;
export const MAX_NODE_COUNT = 5_000;
export const MAX_DEPTH = 100;
