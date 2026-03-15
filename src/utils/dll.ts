import { Segment } from './segment';
import type { SegmentType } from './types';

class Node {
  constructor(
    public readonly data: Segment,
    public next: Node | null = null,
    public prev: Node | null = null,
  ) {}
}

export class DLL {
  #head: Node | null = null;
  #tail: Node | null = null;
  #segmentNodeMap = new WeakMap<Segment, Node>();

  getSegment(type: SegmentType) {
    let curr = this.#head;

    while (curr) {
      if (curr.data.type === type) return curr.data;

      curr = curr.next;
    }

    return curr || null;
  }

  getSegments(type?: SegmentType) {
    const segments = [];
    let curr = this.#head;

    while (curr) {
      if (type) {
        if (type === curr.data.type) segments.push(curr.data);
      } else {
        segments.push(curr.data);
      }

      curr = curr.next;
    }

    return segments;
  }

  getSegmentsAfter(
    type: SegmentType,
    startSegment: Segment,
    stopSegmentType: SegmentType[] = [],
    consecutive = false,
  ) {
    const startNode = this.getNodeFromSegment(startSegment);

    if (!startNode) throw new Error(`Failed to locate: 'startSegment' [${startSegment.type}]`);

    const res = [];
    let curr = startNode.next;

    while (curr) {
      if (stopSegmentType.length && stopSegmentType.includes(curr.data.type)) break;

      if (curr.data.type === type) res.push(curr.data);
      else if (consecutive && res.length) break;

      curr = curr.next;
    }

    return res;
  }

  appendNewSegment(newSegment: Segment, targetSegment?: Segment) {
    const newNode = new Node(newSegment);
    this.#segmentNodeMap.set(newSegment, newNode);

    this.moveNodeAfter(newNode, this.getNodeFromSegment(targetSegment) || this.#tail);

    return newSegment;
  }

  moveNodeAfter(node: Node, targetNode: Node | null) {
    if (!node) throw new Error('Failed to locate node');

    if (!this.#head) {
      this.#head = this.#tail = node;
      node.prev = null;
      node.next = null;
      return;
    }

    if (!targetNode) throw new Error('Failed to locate targetNode');
    if (node === targetNode || targetNode.next === node) return;

    this.#detachNode(node);

    node.prev = targetNode;
    node.next = targetNode.next;

    if (targetNode.next) targetNode.next.prev = node;
    else this.#tail = node;

    targetNode.next = node;
  }

  prependNewSegment(newSegment: Segment, targetSegment: Segment) {
    const newNode = new Node(newSegment);
    this.#segmentNodeMap.set(newSegment, newNode);

    const targetNode = this.getNodeFromSegment(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    this.moveNodeBefore(newNode, targetNode);

    return newSegment;
  }

  moveNodeBefore(node: Node, targetNode: Node) {
    if (!node) throw new Error('Failed to locate node');

    if (!this.#head) {
      this.#head = this.#tail = node;
      node.prev = null;
      node.next = null;
      return;
    }

    if (!targetNode) throw new Error('Failed to locate targetNode');
    if (node === targetNode || targetNode.prev === node) return;

    this.#detachNode(node);

    node.next = targetNode;
    node.prev = targetNode.prev;

    if (targetNode.prev) targetNode.prev.next = node;
    else this.#head = node;

    targetNode.prev = node;
  }

  deleteSegment(segment: Segment) {
    const node = this.getNodeFromSegment(segment);
    if (!node) throw new Error(`Failed to locate: 'segment' [${segment.type}]`);

    this.#detachNode(node);
    this.#segmentNodeMap.delete(segment);
  }

  #detachNode(node: Node) {
    if (node.prev) node.prev.next = node.next;
    if (this.#head === node) this.#head = node.next;

    if (node.next) node.next.prev = node.prev;
    if (this.#tail === node) this.#tail = node.prev;

    node.prev = null;
    node.next = null;
  }

  getNodeFromSegment(segment?: Segment) {
    if (segment && !(segment instanceof Segment))
      throw new Error(`Invalid parameter: 'segment'. segment not an instance of Segment`);

    return (segment && this.#segmentNodeMap.get(segment)) || null;
  }
}
