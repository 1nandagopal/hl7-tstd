import { DLL } from './dll';
import { Segment } from './segment';
import type { Prettify, SegmentType, TParseOptions } from './types';

export class HL7 {
  raw: string;
  parseOptions: TParseOptions;
  #dll: DLL;

  constructor(hl7Msg: string, parseOptions?: Prettify<Partial<TParseOptions>>) {
    this.raw = hl7Msg;
    this.parseOptions = {
      fieldDelim: parseOptions?.fieldDelim ?? '|',
      repeatingDelim: parseOptions?.repeatingDelim ?? '~',
      componentDelim: parseOptions?.componentDelim ?? '^',
      subCompDelim: parseOptions?.subCompDelim ?? '&',
      eolDelim: parseOptions?.eolDelim ?? '\r?\n|\r',
      buildEolChar: parseOptions?.buildEolChar ?? '\r',
    };

    if (this.parseOptions.fieldDelim.length !== 1) throw new Error('Invalid field delimiter');

    this.#dll = new DLL();
    this.transform();
  }

  /**
   * @deprecated This method is triggered internally and doesnt need to be invoked manually.
   */
  transform() {
    if (typeof this.raw !== 'string' || !this.raw.startsWith('MSH')) {
      throw new Error('Invalid raw HL7 message. Expected msg to be a string starting with MSH');
    }

    if (!['\r?\n\|\r', '\r\n', '\n', '\r'].includes(this.parseOptions.eolDelim)) {
      throw new Error('Invalid EOL character. Expected \\r?\\n\|\\r, \\r\\n, \\n, \\r');
    }

    this.#dll = new DLL();

    const segmentsStrArr = this.raw
      .split(RegExp(this.parseOptions.eolDelim))
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

  getSegment(type: SegmentType): Segment | null {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.getSegment(type);
  }

  getSegments(type?: SegmentType): Segment[] {
    if (type && !/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.getSegments(type);
  }

  getSegmentsAfter(
    startSegment: Segment,
    type: SegmentType,
    stopSegmentType: SegmentType[] = [],
    consecutive = false,
  ): Segment[] {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!startSegment || !(startSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'startSegment'`);
    if (!stopSegmentType || !Array.isArray(stopSegmentType))
      throw new Error(`Invalid parameter: 'stopSegmentType'`);
    if (typeof consecutive !== 'boolean')
      throw new Error(`Invalid parameter: 'consecutive' [${consecutive}]`);
    if (!this.#dll.getNodeFromSegment(startSegment))
      throw new Error(`Failed to locate: 'startSegment' [${startSegment.type}]`);

    return this.#dll.getSegmentsAfter(type, startSegment, stopSegmentType, consecutive);
  }

  createSegment(type: SegmentType): Segment {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.#dll.appendNewSegment(new Segment(type, this.parseOptions));
  }

  createSegmentAfter(type: SegmentType, targetSegment: Segment): Segment {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);
    if (!this.#dll.getNodeFromSegment(targetSegment))
      throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    return this.#dll.appendNewSegment(new Segment(type, this.parseOptions), targetSegment);
  }

  createSegmentBefore(type: SegmentType, targetSegment: Segment): Segment {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);
    if (!this.#dll.getNodeFromSegment(targetSegment))
      throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    return this.#dll.prependNewSegment(new Segment(type, this.parseOptions), targetSegment);
  }

  deleteSegment(segment: Segment) {
    this.deleteSegments([segment]);
  }

  deleteSegments(segments: Segment[]) {
    for (const segment of segments) {
      if (!segment || !(segment instanceof Segment))
        throw new Error(`Invalid parameter: 'segments'`);
      if (!this.#dll.getNodeFromSegment(segment))
        throw new Error(`Failed to locate: 'segment' [${segment.type}]`);

      this.#dll.deleteSegment(segment);
    }
  }

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
    const indexMap: Partial<Record<SegmentType, number>> = {};
    const indexResetTriggerMap: Partial<Record<SegmentType, SegmentType[]>> = {};

    for (const [seg, resetTriggerSegs] of Object.entries(reindexConfig)) {
      indexMap[seg] = startIndex;

      if (resetTriggerSegs)
        for (const key of resetTriggerSegs) (indexResetTriggerMap[key] ??= []).push(seg);
    }

    for (const segment of segments) {
      if (reindexConfig[segment.type]) {
        segment.set(`${segment.type}.${field}`, String(indexMap[segment.type]++));

        if (indexResetTriggerMap[segment.type])
          for (const seg of indexResetTriggerMap[segment.type]!) indexMap[seg] = startIndex;
      }
    }
  }

  private validateSegment(segment: string) {
    if (new RegExp(`^[A-Z0-9]{3}\\${this.parseOptions.fieldDelim}`).test(segment)) return true;
    else throw new Error(`Invalid segment: ${segment}`);
  }
}
