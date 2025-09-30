type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type TSegmentType =
  | 'DG1'
  | 'EVN'
  | 'GT1'
  | 'IN1'
  | 'MSH'
  | 'NK1'
  | 'NTE'
  | 'OBR'
  | 'OBX'
  | 'ORC'
  | 'PID'
  | 'PR1'
  | 'PV1'
  | 'PV2'
  | (string & {});

type TSegmentData = Record<string, Array<Record<string, Array<string>>>>;

type TParseOptions = {
  fieldDelim: string;
  repeatingDelim: string;
  componentDelim: string;
  subCompDelim: string;
  eolDelim: '\r?\n|\r' | '\r\n' | '\n' | '\r';
  buildEolChar: '\r\n' | '\n' | '\r';
};

class Node<T> {
  constructor(
    public readonly data: T,
    public next: Node<T> | null = null,
    public prev: Node<T> | null = null
  ) {}
}

class Segment {
  private parseOptions: Prettify<Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>>;

  constructor(
    public readonly type: TSegmentType,
    public data: TSegmentData | null = null,
    parseOptions?: Prettify<Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>>
  ) {
    this.parseOptions = {
      fieldDelim: parseOptions?.fieldDelim ?? '|',
      repeatingDelim: parseOptions?.repeatingDelim ?? '~',
      componentDelim: parseOptions?.componentDelim ?? '^',
      subCompDelim: parseOptions?.subCompDelim ?? '&',
    };
  }

  get(field: string, repeatingIndex = 0, subComponentIndex = 0) {
    if (!this.data) return null;

    if (!field || !/^[A-Z\d]{3}(\.\d+){0,2}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (typeof repeatingIndex !== 'number' || repeatingIndex < -1)
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (typeof subComponentIndex !== 'number' || subComponentIndex < -1)
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim } = this.parseOptions;
    const [type, fieldIdx, compIdx] = field.split('.');

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field' [${field}]. Cannot get [${field}] from [${this.type}] segment.`
      );

    if (fieldIdx && compIdx) {
      if (subComponentIndex === -1) {
        return (
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[
            `${type}.${fieldIdx}.${compIdx}`
          ]?.join(subCompDelim) ?? null
        );
      } else {
        return (
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[`${type}.${fieldIdx}.${compIdx}`]?.[
            subComponentIndex
          ] ?? null
        );
      }
    } else if (fieldIdx) {
      let field =
        repeatingIndex === -1
          ? this.data[`${type}.${fieldIdx}`]
          : [this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]];
      const repeatingFieldsArr: string[] = [];

      if (!field || !field[0]) return null;

      for (const repeatingField of field) {
        const componentsArr: string[] = [];

        for (const compKey in repeatingField) {
          componentsArr.push(repeatingField[compKey]!.join(subCompDelim));
        }

        repeatingFieldsArr.push(componentsArr.join(componentDelim));
      }

      return repeatingFieldsArr.join(repeatingDelim);
    } else {
      if (!this.data) return null;

      const fieldsArr = [this.type];

      for (const fieldKey in this.data) {
        const repeatingCompsArr = [];

        for (const repeatingField of this.data[fieldKey]!) {
          const compsArr = [];

          for (const compKey in repeatingField) {
            compsArr.push(repeatingField[compKey]?.join(subCompDelim));
          }

          repeatingCompsArr.push(compsArr.join(componentDelim));
        }

        fieldsArr.push(repeatingCompsArr.join(repeatingDelim));
      }

      return fieldsArr.join(fieldDelim);
    }
  }

  set(field: string, value: string, repeatingIndex = 0, subComponentIndex = 0) {
    if (!field || !/^[A-Z\d]{3}(\.\d+){1,2}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);
    if (value == null || typeof value !== 'string')
      throw new Error(`Invalid parameter: 'value' [${value}]`);
    if (typeof repeatingIndex !== 'number' && repeatingIndex < 0)
      throw new Error(`Invalid parameter: 'repeatingIndex' [${repeatingIndex}]`);
    if (typeof subComponentIndex !== 'number' && subComponentIndex < 0)
      throw new Error(`Invalid parameter: 'subComponentIndex' [${subComponentIndex}]`);

    const [type, fieldIdx, compIdx] = field.split('.');

    if (!type || type !== this.type)
      throw new Error(
        `Invalid parameter: 'field' [${field}]. Cannot set [${field}] from [${this.type}] segment.`
      );

    if (!fieldIdx) throw new Error(`Invalid parameter: 'field' [${field}]`);

    if (!this.data) this.data = {};

    for (let i = type === 'MSH' ? 2 : 1; i <= parseInt(fieldIdx, 10); i++) {
      if (this.data[`${type}.${i}`]?.[0]?.[`${type}.${i}.${1}`] == null)
        this.data[`${type}.${i}`] = [{ [`${type}.${i}.${1}`]: [''] }];
    }

    for (let i = 0; i <= repeatingIndex; i++) {
      if (this.data[`${type}.${fieldIdx}`]?.[i]?.[`${type}.${fieldIdx}.${1}`] == null)
        this.data[`${type}.${fieldIdx}`]![i] = { [`${type}.${fieldIdx}.${1}`]: [''] };
    }

    if (compIdx) {
      for (let i = 1; i <= parseInt(compIdx, 10); i++) {
        if (
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[`${type}.${fieldIdx}.${i}`] == null
        )
          this.data[`${type}.${fieldIdx}`]![repeatingIndex]![`${type}.${fieldIdx}.${i}`] = [''];
      }

      for (let i = 0; i <= subComponentIndex; i++) {
        if (
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[`${type}.${fieldIdx}.${compIdx}`]?.[
            i
          ] == null
        )
          this.data[`${type}.${fieldIdx}`]![repeatingIndex]![`${type}.${fieldIdx}.${compIdx}`]![i] =
            '';
      }

      this.data[`${type}.${fieldIdx}`]![repeatingIndex]![`${type}.${fieldIdx}.${compIdx}`]![
        subComponentIndex
      ] = value;
    } else {
      this.data[`${type}.${fieldIdx}`]![repeatingIndex] = {
        [`${type}.${fieldIdx}.${1}`]: [value],
      };
    }
  }
}

class HL7 {
  raw: string;
  parseOptions: TParseOptions;
  private head: Node<Segment> | null = null;
  private tail: Node<Segment> | null = null;

  constructor(hl7Msg: string, parseOptions?: Prettify<Partial<TParseOptions>>) {
    this.raw = typeof hl7Msg === 'string' ? hl7Msg : '';
    this.parseOptions = {
      fieldDelim: parseOptions?.fieldDelim ?? '|',
      repeatingDelim: parseOptions?.repeatingDelim ?? '~',
      componentDelim: parseOptions?.componentDelim ?? '^',
      subCompDelim: parseOptions?.subCompDelim ?? '&',
      eolDelim: parseOptions?.eolDelim ?? '\r?\n|\r',
      buildEolChar: parseOptions?.buildEolChar ?? '\r\n',
    };

    this.transform();
  }

  /**
   * @deprecated This method is triggered internally and doesnt need to be invoked manually.
   */
  transform() {
    if (!this.raw.startsWith('MSH')) {
      throw new Error(
        'Expected raw msg to be HL7 message. Message does not start with MSH segment.'
      );
    }

    const segmentsStr = this.raw
      .split(RegExp(this.parseOptions.eolDelim))
      .filter((segmentStr) => /^[A-Z\d]{3}\|/.test(segmentStr));

    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim } = this.parseOptions;

    for (const segmentStr of segmentsStr) {
      const type = segmentStr.substring(0, 3);
      const segment = new Segment(type, null, this.parseOptions);
      const fields = segmentStr.split(fieldDelim);
      segment.data = {};

      for (let i = 1; i < fields.length; i++) {
        const fieldIdx = type === 'MSH' ? i + 1 : i;
        const repeatingComps = fields[i]!.split(repeatingDelim);
        segment.data[`${type}.${fieldIdx}`] = [];

        for (let j = 0; j < repeatingComps.length; j++) {
          const components = repeatingComps[j]!.split(componentDelim);
          segment.data[`${type}.${fieldIdx}`]![j] = {};

          for (let k = 0; k < components.length; k++) {
            const subComps = components[k]!.split(subCompDelim);
            segment.data[`${type}.${fieldIdx}`]![j]![`${type}.${fieldIdx}.${k + 1}`] = [];

            for (let l = 0; l < subComps.length; l++) {
              segment.data[`${type}.${fieldIdx}`]![j]![`${type}.${fieldIdx}.${k + 1}`]![l] =
                subComps[l]!;
            }
          }
        }
      }

      if (type === 'MSH') {
        segment.data['MSH.2'] = [
          { 'MSH.2.1': [`${componentDelim}${repeatingDelim}\\${subCompDelim}`] },
        ];
      }

      this.appendSegmentNode(segment);
    }
  }

  build() {
    const segments = this.getSegments();
    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim, buildEolChar } =
      this.parseOptions;
    const segmentsStrArr = [];

    for (const segment of segments) {
      const fieldsArr = [segment.type];

      for (const fieldKey in segment.data) {
        const repeatingCompsArr = [];

        for (const component of segment.data[fieldKey]!) {
          const compsArr = [];

          for (const subCompsKey in component) {
            compsArr.push(component[subCompsKey]?.join(subCompDelim));
          }

          repeatingCompsArr.push(compsArr.join(componentDelim));
        }

        fieldsArr.push(repeatingCompsArr.join(repeatingDelim));
      }

      segmentsStrArr.push(fieldsArr.join(fieldDelim));
    }

    return segmentsStrArr.join(buildEolChar);
  }

  getSegment(type: TSegmentType) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    let curr = this.head;

    while (curr) {
      if (curr.data.type === type) return curr.data;

      curr = curr.next;
    }

    return curr;
  }

  getSegments(type?: TSegmentType) {
    if (type && !/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    const segments = [];
    let curr = this.head;

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
    startSegment: Segment,
    type: TSegmentType,
    stopSegmentType: TSegmentType[] = [],
    consecutive = false
  ) {
    if (!startSegment || !(startSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'startSegment'`);
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!stopSegmentType || !Array.isArray(stopSegmentType))
      throw new Error(`Invalid parameter: 'stopSegmentType'`);
    if (typeof consecutive !== 'boolean')
      throw new Error(`Invalid parameter: 'consecutive' [${consecutive}]`);

    const startNode = this.getNode(startSegment);

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

  createSegment(type: TSegmentType) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);

    return this.appendSegmentNode(new Segment(type, null, this.parseOptions));
  }

  createSegmentAfter(type: TSegmentType, targetSegment: Segment) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    return this.appendSegmentNode(new Segment(type, null, this.parseOptions), targetSegment);
  }

  createSegmentBefore(type: TSegmentType, targetSegment: Segment) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid parameter: 'type' [${type}]`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    return this.prependSegmentNode(new Segment(type, null, this.parseOptions), targetSegment);
  }

  deleteSegment(segment: Segment) {
    if (!segment || !(segment instanceof Segment)) throw new Error(`Invalid parameter: 'segment'`);

    this.deleteSegments([segment]);
  }

  deleteSegments(segments: Segment[]) {
    for (const segment of segments) {
      if (!segment || !(segment instanceof Segment))
        throw new Error(`Invalid parameter: 'segments'`);
    }

    for (const segment of segments) {
      const node = this.getNode(segment);

      if (!node) break;

      if (node.prev?.next) node.prev.next = node.next;
      if (node.next?.prev) node.next.prev = node.prev;
      if (this.head === node) this.head = this.head.next;
      if (this.tail === node) this.tail = this.tail.prev;

      node.next = null;
      node.prev = null;
    }
  }

  moveSegmentAfter(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment)) throw new Error(`Invalid parameter: 'segment'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    if (segment === targetSegment) return;

    const node = this.getNode(segment);

    if (!node) throw new Error(`Failed to locate: 'segment' [${segment.type}]`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    if (node === this.head) this.head = this.head.next;
    if (node.prev?.next) node.prev.next = node.next;
    if (node.next?.prev) node.next.prev = node.prev;

    node.next = targetNode.next;
    node.prev = targetNode;
    targetNode.next = node;

    if (node.next?.prev) node.next.prev = node;

    if (targetNode === this.tail) this.tail = this.tail.next;
  }

  moveSegmentBefore(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment)) throw new Error(`Invalid parameter: 'segment'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    if (segment === targetSegment) return;

    const node = this.getNode(segment);

    if (!node) throw new Error(`Failed to locate: 'segment' [${segment.type}]`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    if (node === this.tail) this.tail = this.tail.prev;
    if (node.prev?.next) node.prev.next = node.next;
    if (node.next?.prev) node.next.prev = node.prev;

    node.next = targetNode;
    node.prev = targetNode.prev;
    targetNode.prev = node;

    if (node.prev?.next) node.prev.next = node;

    if (targetNode === this.head) this.head = this.head.prev;
  }

  reindexSegments(
    resetRules: { [k in TSegmentType]?: TSegmentType[] },
    startIndex = 1,
    field = '1.1'
  ) {
    if (!resetRules || typeof resetRules !== 'object')
      throw new Error(`Invalid parameter: 'resetRules'`);
    if (!startIndex || typeof startIndex !== 'number')
      throw new Error(`Invalid parameter: 'startIndex' [${startIndex}]`);
    if (field && !/^(\d+)(\.\d+){0,1}$/.test(field))
      throw new Error(`Invalid parameter: 'field' [${field}]`);

    let curr = this.head;
    const indexMap: Record<string, number> = {};

    for (const key of Object.keys(resetRules)) {
      if (!Array.isArray(resetRules[key]))
        throw new Error(
          `Invalid parameter: 'resetRules'. Expected key [${key}] value to be an array.`
        );

      indexMap[key] = startIndex;
    }

    while (curr) {
      const segment = curr.data;

      if (segment.type in resetRules)
        segment.set(`${segment.type}.${field}`, String(indexMap[segment.type]!++));

      for (const [segmentType, resetTriggers] of Object.entries(resetRules)) {
        for (const resetTrigger of resetTriggers!) {
          if (segment.type === resetTrigger) {
            indexMap[segmentType] = startIndex;
            break;
          }
        }
      }

      curr = curr.next;
    }
  }

  private getNode(segment: Segment) {
    if (!segment || !(segment instanceof Segment)) {
      throw new Error(`Invalid parameter: 'segment'`);
    }

    let curr = this.head;

    while (curr) {
      if (curr.data === segment) return curr;

      curr = curr.next;
    }

    return curr;
  }

  private appendSegmentNode(newSegment: Segment, targetSegment?: Segment) {
    if (!newSegment || !(newSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'newSegment'`);

    if (targetSegment && !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    const newNode = new Node(newSegment);

    if (targetSegment) {
      const targetNode = this.getNode(targetSegment);

      if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

      newNode.next = targetNode.next;
      newNode.prev = targetNode;
      targetNode.next = newNode;

      if (newNode.next?.prev) newNode.next.prev = newNode;
      if (targetNode === this.tail) this.tail = this.tail.next;
    } else if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else if (this.tail) {
      newNode.prev = this.tail;
      this.tail.next = newNode;
      this.tail = this.tail.next;
    } else {
      throw new Error(`Failed to append segment: ${newSegment.type}`);
    }

    return newSegment;
  }

  private prependSegmentNode(newSegment: Segment, targetSegment: Segment) {
    if (!newSegment || !(newSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'newSegment'`);

    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid parameter: 'targetSegment'`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate: 'targetSegment' [${targetSegment.type}]`);

    const newNode = new Node(newSegment);

    newNode.next = targetNode;
    newNode.prev = targetNode.prev;
    targetNode.prev = newNode;

    if (newNode.prev?.next) newNode.prev.next = newNode;
    if (targetNode === this.head) this.head = this.head.prev;

    return newSegment;
  }
}

export type { Segment };
export default HL7;
