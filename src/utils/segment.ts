import { escapeHL7, unescapeHL7 } from './escape.ts';
import type { Prettify, SegmentType, TParseOptions, TSegmentData } from './types.ts';

const SEGMENT_TYPE_REGEX = /^[A-Z0-9]{3}$/;
const PATH_GET_REGEX = /^[A-Z0-9]{3}(\.\d+){0,2}$/;
const PATH_SET_REGEX = /^[A-Z\d]{3}(\.\d+){1,2}$/;
const isValidIndex = (val: number | true) => (typeof val === 'number' && val >= 0) || val === true;

export type TSegmentParseOptions = Prettify<Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>>;

export class Segment {
  data: TSegmentData = {};
  parseOptions: TSegmentParseOptions;

  constructor(
    readonly type: SegmentType,
    parseOptions?: TSegmentParseOptions,
  ) {
    if (!type || !SEGMENT_TYPE_REGEX.test(type))
      throw new Error(`Invalid parameter: 'type' [${type}]`);

    this.data[type === 'MSH' ? '1' : '0'] = [{ 1: [type] }];
    this.parseOptions = parseOptions ?? {
      fieldDelim: '|',
      repeatingDelim: '~',
      componentDelim: '^',
      subCompDelim: '&',
      escapeChar: '\\',
      escapeDelimiters: false,
    };
  }

  /**
   * Escapes delimiter characters using this segment's delimiters.
   */
  escape(value: string): string {
    return escapeHL7(value, this.parseOptions);
  }

  /**
   * Unescapes HL7 escape sequences using this segment's delimiters.
   */
  unescape(value: string): string {
    return unescapeHL7(value, this.parseOptions);
  }

  /**
   * Retrieves a field, component, or subcomponent value using dotted path notation (e.g. 'PID.3.1').
   */
  get(field: string, repeatingIndex: number | true = 0, subComponentIndex: number | true = 0) {
    if (!field || !PATH_GET_REGEX.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (!isValidIndex(repeatingIndex))
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (!isValidIndex(subComponentIndex))
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const [type, fieldIdx, compIdx] = field.split('.');
    const path = [fieldIdx, repeatingIndex, compIdx, subComponentIndex] as const;

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field'. Cannot get [${field}] from [${this.type}] segment.`,
      );

    // Per HL7 v2 Chapter 2.5: MSH-1 is defined as the Field Separator itself
    if (this.type === 'MSH' && fieldIdx === '1') {
      return this.parseOptions.fieldDelim;
    }

    const result = this.#traverse(this.data, path) ?? null;
    if (
      result != null &&
      this.parseOptions.escapeDelimiters &&
      repeatingIndex !== true &&
      subComponentIndex !== true
    ) {
      return this.unescape(result);
    }

    return result;
  }

  /**
   * Sets a field, component, or subcomponent value using dotted path notation (e.g. 'PID.3.1').
   */
  set(
    field: string,
    value: string,
    repeatingIndex: number | true = 0,
    subComponentIndex: number | true = 0,
  ) {
    if (!field || !PATH_SET_REGEX.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (value == null || typeof value !== 'string')
      throw new Error(`Invalid parameter: 'value' [${String(value)}]`);
    if (!isValidIndex(repeatingIndex))
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (!isValidIndex(subComponentIndex))
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const [type, fieldIdx, compIdx] = field.split('.');

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field' [${field}]. Cannot set [${field}] from [${this.type}] segment.`,
      );
    if (!fieldIdx || !Number(fieldIdx)) throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (type === 'MSH' && fieldIdx === '1')
      throw new Error(`Invalid parameter: 'field' [${field}]. Cannot set MSH.1 directly.`);

    let targetValue = value;
    if (this.parseOptions.escapeDelimiters) {
      targetValue = this.escape(value);
    }

    for (let i = type === 'MSH' ? 2 : 1; i <= Number(fieldIdx); i++) {
      if (this.data?.[i]?.[0]?.[1]?.[0] == null) this.data[i] = [{ 1: [''] }];
    }

    const repIdx = repeatingIndex === true ? 0 : Number(repeatingIndex);

    if (repeatingIndex === true) {
      this.data[fieldIdx] = [{ 1: [''] }];
    } else {
      for (let i = 0; i <= repIdx; i++) {
        if (this.data[fieldIdx]?.[i]?.[1]?.[0] == null) this.data[fieldIdx]![i] = { 1: [''] };
      }
    }

    if (compIdx && Number(compIdx)) {
      for (let i = 1; i <= Number(compIdx); i++) {
        if (this.data[fieldIdx]?.[repIdx]?.[i]?.[0] == null)
          this.data[fieldIdx]![repIdx]![i] = [''];
      }

      if (Number.isInteger(subComponentIndex)) {
        for (let i = 0; i <= Number(subComponentIndex); i++) {
          if (this.data[fieldIdx]?.[repIdx]?.[compIdx]?.[i] == null)
            this.data[fieldIdx]![repIdx]![compIdx]![i] = '';
        }

        this.data[fieldIdx]![repIdx]![compIdx]![subComponentIndex as number] = targetValue;
      } else if (subComponentIndex === true) {
        this.data[fieldIdx]![repIdx]![compIdx] = [targetValue];
      }
    } else {
      this.data[fieldIdx]![repIdx] = { 1: [targetValue] };
    }
  }

  #getDelim(depth: number): string {
    return (
      (depth === 0 && this.parseOptions.fieldDelim) ||
      (depth === 1 && this.parseOptions.repeatingDelim) ||
      (depth === 2 && this.parseOptions.componentDelim) ||
      (depth === 3 && this.parseOptions.subCompDelim) ||
      ''
    );
  }

  #traverse(
    data: any,
    path: readonly [string | undefined, number | true, string | undefined, number | true],
    depth = 0,
  ): string {
    const index = path[depth];

    if (Array.isArray(data)) {
      if (index === true || index == null) {
        const delim = this.#getDelim(depth);
        return data.map((item) => this.#traverse(item, path, depth + 1)).join(delim);
      } else {
        return this.#traverse(data[Number(index)], path, depth + 1);
      }
    } else if (typeof data === 'object') {
      if (index === true || index == null) {
        const delim = this.#getDelim(depth);
        const val = Object.keys(data).map((key) => this.#traverse(data[key], path, depth + 1));
        return val.join(delim);
      } else {
        return this.#traverse(data[Number(index)], path, depth + 1);
      }
    } else {
      return data;
    }
  }
}
