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
  private parseOptions: Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>;

  constructor(
    public readonly type: TSegmentType,
    public data: TSegmentData | null = null,
    parseOptions?: Omit<TParseOptions, 'eolDelim' | 'buildEolChar'>
  ) {
    this.parseOptions = {
      fieldDelim: parseOptions?.fieldDelim ?? '|',
      repeatingDelim: parseOptions?.repeatingDelim ?? '~',
      componentDelim: parseOptions?.componentDelim ?? '^',
      subCompDelim: parseOptions?.subCompDelim ?? '&',
    };
  }

  get(field: string, repeatingIndex: number = 0, subComponentIndex: number = 0) {
    if (!this.data) return null;

    if (!field || !/^[A-Z\d]{3}(\.\d+){0,2}$/.test(field))
      throw new Error(`Invalid field: '${field}'`);

    if (typeof repeatingIndex !== 'number' && repeatingIndex < -1)
      throw new Error(
        `Invalid Repeating index: '${repeatingIndex}' (type:${typeof repeatingIndex})`
      );

    if (typeof subComponentIndex !== 'number' && subComponentIndex < -1)
      throw new Error(
        `Invalid Subcomponent index: '${subComponentIndex}' (type:${typeof subComponentIndex})`
      );

    const [type, fieldIdx, compIdx] = field.split('.');

    if (type !== this.type) throw new Error(`Invalid field: '${field}'`);

    if (compIdx && repeatingIndex < 0)
      throw new Error(
        `Invalid Repeating index: '${repeatingIndex}' (type:${typeof repeatingIndex})\nCannot get All repeating fields when getting component ${field}`
      );

    const { fieldDelim, repeatingDelim, componentDelim, subCompDelim } = this.parseOptions;

    if (fieldIdx && compIdx) {
      if (subComponentIndex === -1) {
        const component =
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[`${type}.${fieldIdx}.${compIdx}`];

        if (!component) return null;

        return component.join(subCompDelim) ?? null;
      } else {
        return (
          this.data[`${type}.${fieldIdx}`]?.[repeatingIndex]?.[`${type}.${fieldIdx}.${compIdx}`]?.[
            subComponentIndex
          ] ?? null
        );
      }
    } else if (fieldIdx) {
      if (repeatingIndex === -1) {
        const field = this.data[`${type}.${fieldIdx}`];
        const repeatingFieldsArr: string[] = [];

        if (!field) return null;

        for (const repeatingField of field) {
          const componentsArr: string[] = [];

          for (const compKey in repeatingField) {
            componentsArr.push(repeatingField[compKey]!.join(subCompDelim));
          }

          repeatingFieldsArr.push(componentsArr.join(componentDelim));
        }

        return repeatingFieldsArr.join(repeatingDelim);
      } else {
        const component = this.data[`${type}.${fieldIdx}`]?.[repeatingIndex];

        if (!component) return null;

        const componentsArr = [];

        for (const compKey in component) {
          componentsArr.push(component[compKey]?.join(subCompDelim));
        }

        return componentsArr.join(componentDelim);
      }
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

  set(field: string, value: string, repeatingIndex: number = 0, subComponentIndex: number = 0) {
    if (!field || !/^[A-Z\d]{3}(\.\d+){1,2}$/.test(field))
      throw new Error(`Invalid field: '${field}'`);

    if (typeof value !== 'string')
      throw new Error(`Invalid value: '${value}' (type:${typeof value})`);

    if (typeof repeatingIndex !== 'number' && repeatingIndex < 0)
      throw new Error(
        `Invalid Repeating index: '${repeatingIndex}' (type:${typeof repeatingIndex})`
      );

    if (typeof subComponentIndex !== 'number' && subComponentIndex < 0)
      throw new Error(
        `Invalid Subcomponent index: '${subComponentIndex}' (type:${typeof subComponentIndex})`
      );

    const [type, fieldIdx, compIdx] = field.split('.');

    if (!type || type !== this.type)
      throw new Error(`Invalid type: '${type}'. Cannot set ${type} in ${this.type} Segment`);

    if (!fieldIdx) throw new Error('Invalid field'); // TODO ----------------

    if (!this.data) this.data = {};

    for (let i = type === 'MSH' ? 2 : 1; i <= parseInt(fieldIdx, 10); i++) {
      if (this.data[`${type}.${i}`]?.[0]?.[`${type}.${i}.${1}`] == null)
        this.data[`${type}.${i}`] = [{ [`${type}.${i}.${1}`]: [''] }];
    }

    if (repeatingIndex === -1) {
      this.data[`${type}.${fieldIdx}`] = [{ [`${type}.${fieldIdx}.${1}`]: [''] }];
    } else {
      for (let i = 0; i <= repeatingIndex; i++) {
        if (this.data[`${type}.${fieldIdx}`]?.[i]?.[`${type}.${fieldIdx}.${1}`] == null)
          this.data[`${type}.${fieldIdx}`]![i] = {
            [`${type}.${fieldIdx}.${1}`]: [''],
          };
      }
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

  constructor(hl7Msg: string, parseOptions?: Partial<TParseOptions>) {
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

  transform() {
    if (!this.raw.startsWith('MSH')) {
      throw new Error('Expected raw msg to be HL7 message. Message does not start with MSH');
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
        const repeatings = fields[i]!.split(repeatingDelim);
        segment.data[`${type}.${fieldIdx}`] = [];

        for (let j = 0; j < repeatings.length; j++) {
          const components = repeatings[j]!.split(componentDelim);
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
          {
            'MSH.2.1': [`${componentDelim}${repeatingDelim}\\${subCompDelim}`],
          },
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
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);

    let curr = this.head;

    while (curr) {
      if (curr.data.type === type) {
        return curr.data;
      }

      curr = curr.next;
    }

    return curr;
  }

  getSegments(type?: TSegmentType) {
    if (type && !/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);

    const segments = [];
    let curr = this.head;

    while (curr) {
      if (type) {
        if (type === curr.data.type) {
          segments.push(curr.data);
        }
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
    stopSegmentType: TSegmentType[],
    consecutive: boolean = false
  ) {
    if (!startSegment || !(startSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(startSegment)}`);
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);
    if (typeof consecutive !== 'boolean')
      throw new Error(`Invalid Consecutive flag: '${consecutive}'`);

    const startNode = this.getNode(startSegment);

    if (!startNode) throw new Error(`Failed to locate Start Segment: '${startSegment.type}`);

    const res = [];
    let curr = startNode.next;

    while (curr) {
      if (stopSegmentType.includes(curr.data.type)) break;
      if (curr.data.type === type) res.push(curr.data);
      else if (consecutive && res.length) break;

      curr = curr.next;
    }

    return res;
  }

  createSegment(type: TSegmentType) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);

    return this.appendSegmentNode(new Segment(type, null, this.parseOptions));
  }

  createSegmentAfter(type: TSegmentType, targetSegment: Segment) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment : ${JSON.stringify(targetSegment)}`);

    return this.appendSegmentNode(new Segment(type, null, this.parseOptions), targetSegment);
  }

  createSegmentBefore(type: string, targetSegment: Segment) {
    if (!/^[A-Z\d]{3}$/.test(type)) throw new Error(`Invalid Segment type: '${type}'`);
    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(targetSegment)}`);

    return this.prependSegmentNode(new Segment(type, null, this.parseOptions), targetSegment);
  }

  deleteSegment(segment: Segment) {
    if (!segment || !(segment instanceof Segment))
      throw new Error(`Invalid Segment: ${JSON.stringify(segment)}`);

    this.deleteSegments([segment]);
  }

  deleteSegments(segments: Segment[]) {
    for (const segment of segments) {
      if (!segment || !(segment instanceof Segment))
        throw new Error(`Invalid Segment: ${JSON.stringify(segment)}`);

      const node = this.getNode(segment);

      if (!node) {
        break;
      }

      if (node.prev?.next) node.prev.next = node.next;
      if (node.next?.prev) node.next.prev = node.prev;
      if (this.head === node) this.head = this.head.next;
      if (this.tail === node) this.tail = this.tail.prev;

      node.next = null;
      node.prev = null;
    }
  }

  moveSegmentAfter(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment))
      throw new Error(`Invalid Segment: ${JSON.stringify(segment)}`);

    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(targetSegment)}`);

    const node = this.getNode(segment);

    if (!node) throw new Error(`Failed to locate Segment: '${segment.type}'`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate Target Segment: '${targetSegment.type}'`);

    if (node.prev?.next) node.prev.next = node.next;
    if (node.next?.prev) node.next.prev = node.prev;

    node.next = targetNode.next;
    node.prev = targetNode;
    targetNode.next = node;

    if (node.next?.prev) node.next.prev = node;
    if (targetNode === this.tail) this.tail = this.tail.next;
  }

  moveSegmentBefore(segment: Segment, targetSegment: Segment) {
    if (!segment || !(segment instanceof Segment))
      throw new Error(`Invalid Segment: ${JSON.stringify(segment)}`);

    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(targetSegment)}`);

    const node = this.getNode(segment);

    if (!node) throw new Error(`Failed to locate Segment: '${segment.type}'`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate Target Segment: '${targetSegment.type}'`);

    if (node.prev?.next) node.prev.next = node.next;
    if (node.next?.prev) node.next.prev = node.prev;

    node.next = targetNode;
    node.prev = targetNode.prev;
    targetNode.prev = node;

    if (node.prev?.next) node.prev.next = node;
    if (targetNode === this.head) this.head = this.head.prev;
  }

  reindexSegments(
    resetRules: { [k in Exclude<TSegmentType, 'MSH'>]?: TSegmentType[] },
    field = '1.1'
  ) {
    if (!resetRules || typeof resetRules !== 'object')
      throw new Error('Invalid Parameter: resetRules');

    if (field && !/^(\d)+(\.\d+)*$/.test(field))
      throw new Error(`Invalid Parameter: field '${field}'`);

    let curr = this.head;
    const indexMap: Record<string, number> = {};

    for (const key in resetRules) {
      indexMap[key] = 1;
    }

    while (curr) {
      const segment = curr.data;

      if (segment.type in resetRules) {
        segment.set(`${segment.type}.${field}`, String(indexMap[segment.type]!++));
      }

      for (const key in resetRules) {
        if (resetRules[key]?.includes(segment.type)) {
          indexMap[key] = 1;
        }
      }

      curr = curr.next;
    }
  }

  private getNode(segment: Segment) {
    if (!segment || !(segment instanceof Segment)) {
      throw new Error(`Invalid Segment: ${JSON.stringify(segment)}`);
    }

    let curr = this.head;

    while (curr) {
      if (curr.data === segment) {
        return curr;
      }

      curr = curr.next;
    }

    return curr;
  }

  private appendSegmentNode(newSegment: Segment, targetSegment?: Segment) {
    if (!newSegment || !(newSegment instanceof Segment))
      throw new Error(`Invalid Segment: ${JSON.stringify(newSegment)}`);

    if (targetSegment && !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(targetSegment)}`);

    const newNode = new Node(newSegment);

    if (targetSegment) {
      const targetNode = this.getNode(targetSegment);

      if (!targetNode) throw new Error(`Failed to locate Target Segment: '${targetSegment.type}'`);

      newNode.next = targetNode.next;
      newNode.prev = targetNode;
      targetNode.next = newNode;

      if (newNode.next?.prev) newNode.next.prev = newNode;
      if (targetNode === this.tail) this.tail = newNode;
    } else if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else if (this.tail) {
      newNode.prev = this.tail;
      this.tail.next = newNode;
      this.tail = newNode;
    } else {
      throw new Error(`Failed to append Segment: ${newSegment.type}`);
    }

    return newSegment;
  }

  private prependSegmentNode(newSegment: Segment, targetSegment: Segment) {
    if (!newSegment || !(newSegment instanceof Segment))
      throw new Error(`Invalid Segment: ${JSON.stringify(newSegment)}`);

    if (!targetSegment || !(targetSegment instanceof Segment))
      throw new Error(`Invalid Target Segment: ${JSON.stringify(targetSegment)}`);

    const targetNode = this.getNode(targetSegment);

    if (!targetNode) throw new Error(`Failed to locate Target Segment: '${targetSegment.type}'`);

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
