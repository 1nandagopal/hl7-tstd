export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type SegmentType =
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

export type TSegmentData = Record<number | string, Record<number | string, string[]>[]>;

export type TParseOptions = {
  fieldDelim: string;
  repeatingDelim: string;
  componentDelim: string;
  subCompDelim: string;
  eolDelim: '\r?\n|\r' | '\r\n' | '\n' | '\r';
  buildEolChar: '\r\n' | '\n' | '\r';
};
