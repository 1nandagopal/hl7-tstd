import type { Prettify, SegmentType, TParseOptions, TSegmentData } from './types';

export class Segment {
  data: TSegmentData = {};
  private parseOptions: Prettify<Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>>;
  #parseMap: Record<number, string>;

  constructor(
    readonly type: SegmentType,
    parseOptions?: Prettify<Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>>,
  ) {
    if (!type || !/^[A-Z\d]{3}(\.\d+){0,2}$/.test(type))
      throw new Error(`Invalid parameter: 'type' [${type}]`);
    this.data[type === 'MSH' ? '1' : '0'] = [{ 1: [type] }];
    this.parseOptions = {
      fieldDelim: parseOptions?.fieldDelim ?? '|',
      repeatingDelim: parseOptions?.repeatingDelim ?? '~',
      componentDelim: parseOptions?.componentDelim ?? '^',
      subCompDelim: parseOptions?.subCompDelim ?? '&',
    };
    this.#parseMap = {
      0: this.parseOptions.fieldDelim,
      1: this.parseOptions.repeatingDelim,
      2: this.parseOptions.componentDelim,
      3: this.parseOptions.subCompDelim,
    };
  }

  get(field: string, repeatingIndex: number | true = 0, subComponentIndex: number | true = 0) {
    const validate = (val: number | true) =>
      !((typeof val === 'number' && val >= 0) || val === true);

    if (!field || !/^[A-Z\d]{3}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (validate(repeatingIndex))
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (validate(subComponentIndex))
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const [type, fieldIdx, compIdx] = field.split('.');
    const path = [fieldIdx, repeatingIndex, compIdx, subComponentIndex] as const;

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field'. Cannot get [${field}] from [${this.type}] segment.`,
      );

    return this.#traverse(this.data, path);
  }

  set(
    field: string,
    value: string,
    repeatingIndex: number | true = 0,
    subComponentIndex: number | true = 0,
  ) {
    const validate = (val: number | true) =>
      !((typeof val === 'number' && val >= 0) || val === true);

    if (!field || !/^[A-Z\d]{3}(\.\d+){1,2}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (value == null || typeof value !== 'string')
      throw new Error(`Invalid parameter: 'value' [${value}]`);
    if (validate(repeatingIndex))
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (validate(subComponentIndex))
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const [type, fieldIdx, compIdx] = field.split('.');

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field' [${field}]. Cannot set [${field}] from [${this.type}] segment.`,
      );
    if (!fieldIdx || !Number(fieldIdx)) throw new Error(`Invalid parameter: 'field' [${field}]`);

    for (let i = type === 'MSH' ? 2 : 1; i <= Number(fieldIdx); i++) {
      if (!this.data?.[i]?.[0]?.[1]?.[0] == null) this.data[i] = [{ 1: [''] }];
    }

    if (Number.isInteger(repeatingIndex)) {
      for (let i = 0; i <= Number(repeatingIndex); i++) {
        if (this.data[fieldIdx]?.[i]?.[1]?.[0] == null) this.data[fieldIdx]![i] = { 1: [''] };
      }

      if (compIdx && Number(compIdx)) {
        for (let i = 1; i <= Number(compIdx); i++) {
          if (this.data[fieldIdx]?.[repeatingIndex as number]?.[i]?.[0] == null)
            this.data[fieldIdx]![repeatingIndex as number]![i] = [''];
        }

        if (Number.isInteger(subComponentIndex)) {
          for (let i = 0; i <= Number(subComponentIndex); i++) {
            if (this.data[fieldIdx]?.[repeatingIndex as number]?.[compIdx]?.[i] == null)
              this.data[fieldIdx]![repeatingIndex as number]![compIdx]![i] = '';
          }

          this.data[fieldIdx]![repeatingIndex as number]![compIdx]![subComponentIndex as number] =
            value;
        } else if (subComponentIndex === true) {
          this.data[fieldIdx]![repeatingIndex as number]![compIdx] = [value];
        }
      } else {
        this.data[fieldIdx]![repeatingIndex as number] = { 1: [value] };
      }
    } else if (repeatingIndex == true) {
      this.data[fieldIdx] = [{ 1: [''] }];

      if (compIdx && Number(compIdx)) {
        for (let i = 1; i <= Number(compIdx); i++) {
          if (this.data[fieldIdx]?.[0]?.[i]?.[0] == null) this.data[fieldIdx]![0]![i] = [''];
        }

        if (Number.isInteger(subComponentIndex)) {
          for (let i = 0; i <= Number(subComponentIndex); i++) {
            if (this.data[fieldIdx]?.[0]?.[compIdx]?.[i] == null)
              this.data[fieldIdx]![0]![compIdx]![i] = '';
          }

          this.data[fieldIdx]![0]![compIdx]![subComponentIndex as number] = value;
        } else if (subComponentIndex === true) {
          this.data[fieldIdx]![0]![compIdx] = [value];
        }
      } else {
        this.data[fieldIdx] = [{ 1: [value] }];
      }
    }
  }

  #traverse(
    data: any,
    path: readonly [string | undefined, number | true, string | undefined, number | true],
    depth = 0,
  ): string {
    const index = path[depth];

    if (Array.isArray(data)) {
      if (index === true || index == null) {
        const delim = this.#parseMap[depth++];
        return data.map((item) => this.#traverse(item, path, depth)).join(delim);
      } else {
        return this.#traverse(data[Number(index)], path, ++depth);
      }
    } else if (typeof data === 'object') {
      if (index === true || index == null) {
        const delim = this.#parseMap[depth++];

        const val = Object.keys(data).map((key) => this.#traverse(data[key], path, depth));

        return val.join(delim);
      } else {
        return this.#traverse(data[Number(index)], path, ++depth);
      }
    } else {
      return data;
    }
  }
}
