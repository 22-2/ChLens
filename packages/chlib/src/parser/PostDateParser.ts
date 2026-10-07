interface ParseCursor {
  position: number;
}

const isAsciiDigit = (char: string | undefined): boolean =>
  char != null && char >= "0" && char <= "9";

const readDigits = (
  text: string,
  cursor: ParseCursor,
  minLength: number,
  maxLength = Number.POSITIVE_INFINITY,
): boolean => {
  const start = cursor.position;
  while (
    cursor.position < text.length &&
    cursor.position - start < maxLength &&
    isAsciiDigit(text[cursor.position])
  ) {
    cursor.position += 1;
  }

  return cursor.position - start >= minLength;
};

const readFixedDigits = (text: string, cursor: ParseCursor, length: number): boolean =>
  readDigits(text, cursor, length, length);

const readLiteral = (text: string, cursor: ParseCursor, literal: string): boolean => {
  if (!text.startsWith(literal, cursor.position)) {
    return false;
  }

  cursor.position += literal.length;
  return true;
};

const readHorizontalWhitespace = (text: string, cursor: ParseCursor): boolean => {
  const start = cursor.position;
  while (text[cursor.position] === " " || text[cursor.position] === "\t") {
    cursor.position += 1;
  }

  return cursor.position > start;
};

const readOptionalWeekday = (text: string, cursor: ParseCursor): boolean => {
  if (text[cursor.position] !== "(") {
    return true;
  }

  cursor.position += 1;
  while (cursor.position < text.length && text[cursor.position] !== ")") {
    const char = text[cursor.position];
    if (char === "(" || char === "\r" || char === "\n") {
      return false;
    }
    cursor.position += 1;
  }

  return readLiteral(text, cursor, ")");
};

const readCalendarDate = (text: string, cursor: ParseCursor): boolean => {
  return (
    readFixedDigits(text, cursor, 4) &&
    readLiteral(text, cursor, "/") &&
    readDigits(text, cursor, 1, 2) &&
    readLiteral(text, cursor, "/") &&
    readDigits(text, cursor, 1, 2)
  );
};

const readOptionalSeconds = (text: string, cursor: ParseCursor): boolean => {
  if (text[cursor.position] !== ":") {
    return true;
  }

  if (!readLiteral(text, cursor, ":") || !readFixedDigits(text, cursor, 2)) {
    return false;
  }

  if (text[cursor.position] !== ".") {
    return true;
  }

  return readLiteral(text, cursor, ".") && readDigits(text, cursor, 1);
};

const readClockTime = (text: string, cursor: ParseCursor): boolean => {
  return (
    readDigits(text, cursor, 1, 2) &&
    readLiteral(text, cursor, ":") &&
    readFixedDigits(text, cursor, 2) &&
    readOptionalSeconds(text, cursor)
  );
};

const parsePostDateAt = (text: string, start: number): number | undefined => {
  const cursor: ParseCursor = { position: start };

  // 日付の各要素を個別に読むことで、曜日や秒の有無を条件分岐として追えるようにする。
  if (
    !readCalendarDate(text, cursor) ||
    !readOptionalWeekday(text, cursor) ||
    !readHorizontalWhitespace(text, cursor) ||
    !readClockTime(text, cursor)
  ) {
    return undefined;
  }

  return cursor.position;
};

/**
 * Extracts a displayable date/time token from legacy response metadata.
 *
 * The wire format is semi-structured: weekday labels and the seconds portion
 * are optional. Parsing the components explicitly preserves the original text
 * and avoids locale-dependent `Date.parse` behavior.
 */
export const extractPostDate = (metadata: string): string | undefined => {
  for (let start = 0; start < metadata.length; start += 1) {
    if (!isAsciiDigit(metadata[start]) || (start > 0 && isAsciiDigit(metadata[start - 1]))) {
      continue;
    }

    const end = parsePostDateAt(metadata, start);
    if (end != null) {
      return metadata.slice(start, end);
    }
  }

  return undefined;
};
