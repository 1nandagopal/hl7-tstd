export interface EscapeOptions {
  fieldDelim: string;
  componentDelim: string;
  repeatingDelim: string;
  subCompDelim: string;
  escapeChar: string;
}

/**
 * Escapes standard HL7 delimiter characters (\, |, ^, ~, &).
 */
export function escapeHL7(value: string, options?: Partial<EscapeOptions>): string {
  if (!value) return value;
  const {
    fieldDelim = '|',
    componentDelim = '^',
    repeatingDelim = '~',
    subCompDelim = '&',
    escapeChar: e = '\\',
  } = options ?? {};
  return value
    .split(e)
    .join(`${e}E${e}`)
    .split(fieldDelim)
    .join(`${e}F${e}`)
    .split(componentDelim)
    .join(`${e}S${e}`)
    .split(repeatingDelim)
    .join(`${e}R${e}`)
    .split(subCompDelim)
    .join(`${e}T${e}`);
}

/**
 * Unescapes standard HL7 escape sequences (\E\, \F\, \S\, \R\, \T\).
 */
export function unescapeHL7(value: string, options?: Partial<EscapeOptions>): string {
  if (!value) return value;
  const {
    fieldDelim = '|',
    componentDelim = '^',
    repeatingDelim = '~',
    subCompDelim = '&',
    escapeChar: e = '\\',
  } = options ?? {};
  return value
    .split(`${e}F${e}`)
    .join(fieldDelim)
    .split(`${e}S${e}`)
    .join(componentDelim)
    .split(`${e}R${e}`)
    .join(repeatingDelim)
    .split(`${e}T${e}`)
    .join(subCompDelim)
    .split(`${e}E${e}`)
    .join(e);
}
