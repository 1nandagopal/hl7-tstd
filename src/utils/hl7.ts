import { DLL } from './dll.ts';
import { escapeHL7, type EscapeOptions, unescapeHL7 } from './escape.ts';
import { Segment } from './segment.ts';
import type { Prettify, SegmentType, TParseOptions } from './types.ts';

const SEGMENT_TYPE_REGEX = /^[A-Z0-9]{3}$/;
const DEFAULT_EOL_REGEX = /\r?\n|\r/;

export class HL7 {
  raw: string;
  parseOptions: TParseOptions;
  #dll: DLL;

  constructor(hl7Msg: string, parseOptions?: Prettify<Partial<TParseOptions>>) {
    this.raw = hl7Msg;

    // Per HL7 v2 Chapter 2.5: infer delimiters dynamically from MSH header if not explicitly provided
    const hasMsh = typeof hl7Msg === 'string' && hl7Msg.startsWith('MSH');
    const fieldDelim = parseOptions?.fieldDelim ?? (hasMsh ? hl7Msg[3] : undefined) ?? '|';
    const encEnd = hasMsh ? hl7Msg.indexOf(fieldDelim, 4) : -1;
    const enc = encEnd > 4 ? hl7Msg.slice(4, encEnd) : '';

    this.parseOptions = {
      fieldDelim,
      componentDelim: parseOptions?.componentDelim ?? enc[0] ?? '^',
      repeatingDelim: parseOptions?.repeatingDelim ?? enc[1] ?? '~',
      escapeChar: parseOptions?.escapeChar ?? enc[2] ?? '\\',
      subCompDelim: parseOptions?.subCompDelim ?? enc[3] ?? '&',
      escapeDelimiters: parseOptions?.escapeDelimiters ?? false,
      eolDelim: parseOptions?.eolDelim ?? '\r?\n|\r',
      buildEolChar: parseOptions?.buildEolChar ?? '\r',
    };

    if (this.parseOptions.fieldDelim.length !== 1) throw new Error('Invalid field delimiter');

    this.#dll = new DLL();
    this.transform();
  }

  /**
   * Re-parses `this.raw` into the internal linked list of segments.
   *
   * @deprecated This method is triggered automatically during instantiation and does not need to be called manually.
   */
  transform() {
    if (typeof this.raw !== 'string' || !this.raw.startsWith('MSH')) {
      throw new Error('Invalid raw HL7 message. Expected msg to be a string starting with MSH');
    }

    if (!['\r?\n|\r', '\r\n', '\n', '\r'].includes(this.parseOptions.eolDelim)) {
      throw new Error('Invalid EOL character. Expected \\r?\\n|\\r, \\r\\n, \\n, \\r');
    }

    const eol =
      this.parseOptions.eolDelim === '\r?\n|\r'
        ? DEFAULT_EOL_REGEX
        : new RegExp(this.parseOptions.eolDelim);
    this.#dll = new DLL();

    const segmentsStrArr = this.raw
      .split(eol)
      .filter((segmentStr) => Boolean(segmentStr) && this.validateSegment(segmentStr));

    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim } = this.parseOptions;

    for (const segmentStr of segmentsStrArr) {
      const fields = segmentStr.split(fieldDelim);
      const type = segmentStr.substring(0, 3) as SegmentType;
      const segment = new Segment(type, this.parseOptions);
      let fieldIdx = type === 'MSH' ? 1 : 0;
      segment.data = {};

      for (const field of fields) {
        segment.data[fieldIdx] = segment.data[fieldIdx] || [];
        let repeatFieldIdx = 0;

        for (const repeatField of field.split(repeatingDelim)) {
          let compIdx = 1;
          segment.data[fieldIdx]![repeatFieldIdx] = segment.data[fieldIdx]![repeatFieldIdx] || {};

          for (const comp of repeatField.split(componentDelim)) {
            segment.data[fieldIdx]![repeatFieldIdx]![compIdx++] = comp.split(subCompDelim);
          }

          repeatFieldIdx++;
        }

        fieldIdx++;
      }

      if (type === 'MSH' && fields[1]) {
        segment.data[2] = [{ 1: [fields[1]] }];
      }

      this.#dll.appendNewSegment(segment);
    }
  }

  /**
   * Serializes the message segments into an HL7 v2 string.
   */
  build() {
    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim, buildEolChar } =
      this.parseOptions;
    const segments = this.getSegments();
    const segmentsStr = [];

    for (const segment of segments) {
      const fieldsStrArr = [];

      for (const fieldKey in segment.data) {
        const repeatsStrArr = [];

        for (const repeatingField of segment.data[fieldKey]!) {
          const compsStrArr = [];

          for (const compKey in repeatingField) {
            compsStrArr.push(repeatingField[compKey]?.join(subCompDelim));
          }

          repeatsStrArr.push(compsStrArr.join(componentDelim));
        }

        fieldsStrArr.push(repeatsStrArr.join(repeatingDelim));
      }

      segmentsStr.push(fieldsStrArr.join(fieldDelim));
    }

    return segmentsStr.join(buildEolChar);
  }

  /**
   * Returns the first segment matching the given type, or null.
   */
  getSegment(type: SegmentType): Segment | null {
    if (!SEGMENT_TYPE_REGEX.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.getSegment(type);
  }

  /**
   * Returns all segments, optionally filtered by type.
   */
  getSegments(type?: SegmentType): Segment[] {
    if (type && !SEGMENT_TYPE_REGEX.test(type))
      throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.getSegments(type);
  }

  /**
   * Returns segments of the given type that appear after startSegment.
   */
  getSegmentsAfter(
    startSegment: Segment,
    type: SegmentType,
    stopSegmentType: SegmentType[] = [],
    consecutive = false,
  ): Segment[] {
    if (!SEGMENT_TYPE_REGEX.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!startSegment || !(startSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'startSegment'`);
    if (!stopSegmentType || !Array.isArray(stopSegmentType))
      throw new Error(`Invalid parameter: 'stopSegmentType'`);
    if (typeof consecutive !== 'boolean')
      throw new Error(`Invalid parameter: 'consecutive' [${String(consecutive)}]`);
    if (!this.#dll.getNodeFromSegment(startSegment))
      throw new Error(`Failed to locate: 'startSegment' [${startSegment.type}]`);

    return this.#dll.getSegmentsAfter(type, startSegment, stopSegmentType, consecutive);
  }

  /**
   * Appends a new segment to the end of the message.
   */
  createSegment(type: SegmentType): Segment {
    if (!SEGMENT_TYPE_REGEX.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.appendNewSegment(new Segment(type, this.parseOptions));
  }

  /**
   * Inserts a new segment immediately after targetSegment.
   */
  createSegmentAfter(type: SegmentType, targetSegment: Segment): Segment {
    if (!SEGMENT_TYPE_REGEX.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);
    if (!this.#dll.getNodeFromSegment(targetSegment))
      throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    return this.#dll.appendNewSegment(new Segment(type, this.parseOptions), targetSegment);
  }

  /**
   * Inserts a new segment immediately before targetSegment.
   */
  createSegmentBefore(type: SegmentType, targetSegment: Segment): Segment {
    if (!SEGMENT_TYPE_REGEX.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);
    if (!this.#dll.getNodeFromSegment(targetSegment))
      throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    return this.#dll.prependNewSegment(new Segment(type, this.parseOptions), targetSegment);
  }

  /**
   * Removes a single segment from the message.
   */
  deleteSegment(segment: Segment) {
    this.deleteSegments([segment]);
  }

  /**
   * Removes multiple segments from the message.
   */
  deleteSegments(segments: Segment[]) {
    for (const segment of segments) {
      if (!segment || !(segment instanceof Segment))
        throw new Error(`Invalid parameter: 'segments'`);
      if (!this.#dll.getNodeFromSegment(segment))
        throw new Error(`Failed to locate: 'segment' [${segment.type}]`);

      this.#dll.deleteSegment(segment);
    }
  }

  /**
   * Moves segment immediately after targetSegment.
   */
  moveSegmentAfter(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment)) throw new Error(`Invalid parameter: 'segment'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    const node = this.#dll.getNodeFromSegment(segment);
    const targetNode = this.#dll.getNodeFromSegment(targetSegment);

    if (!node) throw new Error(`Failed to locate: 'segment' [${segment.type}]`);
    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    this.#dll.moveNodeAfter(node, targetNode);
  }

  /**
   * Moves segment immediately before targetSegment.
   */
  moveSegmentBefore(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment)) throw new Error(`Invalid parameter: 'segment'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    const node = this.#dll.getNodeFromSegment(segment);
    const targetNode = this.#dll.getNodeFromSegment(targetSegment);

    if (!node) throw new Error(`Failed to locate: 'segment' [${segment.type}]`);
    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    this.#dll.moveNodeBefore(node, targetNode);
  }

  /**
   * Batch reindexes sequential segment counters based on reset rules.
   */
  reindexSegments(
    reindexConfig: Partial<Record<SegmentType, SegmentType[]>>,
    startIndex = 1,
    field = '1.1',
  ) {
    if (
      !reindexConfig ||
      typeof reindexConfig !== 'object' ||
      Object.values(reindexConfig).some((val) => !Array.isArray(val))
    )
      throw new Error(`Invalid parameter: 'reindexConfig'`);
    if (!startIndex || typeof startIndex !== 'number')
      throw new Error(`Invalid parameter: 'startIndex' [${startIndex}]`);
    if (field && !/^(\d+)(\.\d+){0,1}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);

    const segments = this.getSegments();
    const idxMap: Partial<Record<SegmentType, number>> = {};
    const idxResetTriggerMap: Partial<Record<SegmentType, SegmentType[]>> = {};

    for (const [seg, resetTriggerSegs] of Object.entries(reindexConfig)) {
      idxMap[seg] = startIndex;

      if (resetTriggerSegs)
        for (const resetTriggerSeg of resetTriggerSegs)
          (idxResetTriggerMap[resetTriggerSeg] ??= []).push(seg);
    }

    for (const segment of segments) {
      if (reindexConfig[segment.type]) {
        segment.set(`${segment.type}.${field}`, String(idxMap[segment.type]!++));
      }

      if (idxResetTriggerMap[segment.type])
        for (const seg of idxResetTriggerMap[segment.type]!) idxMap[seg] = startIndex;
    }
  }

  private validateSegment(segment: string) {
    if (
      segment.length >= 4 &&
      segment[3] === this.parseOptions.fieldDelim &&
      SEGMENT_TYPE_REGEX.test(segment.slice(0, 3))
    ) {
      return true;
    }
    throw new Error(`Invalid segment: ${segment}`);
  }

  /**
   * Escapes delimiter characters using standard HL7 delimiters.
   */
  static escape(value: string, options?: Partial<EscapeOptions>): string {
    return escapeHL7(value, options);
  }

  /**
   * Unescapes HL7 escape sequences using standard HL7 delimiters.
   */
  static unescape(value: string, options?: Partial<EscapeOptions>): string {
    return unescapeHL7(value, options);
  }

  /**
   * Escapes delimiter characters using this message's delimiters.
   */
  escape(value: string): string {
    return escapeHL7(value, this.parseOptions);
  }

  /**
   * Unescapes HL7 escape sequences using this message's delimiters.
   */
  unescape(value: string): string {
    return unescapeHL7(value, this.parseOptions);
  }
}
