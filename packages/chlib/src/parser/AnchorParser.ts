/**
 * Parses anchor strings (e.g. >>1, >>1-5, >>1,10) into segments and counts.
 */
export interface AnchorData {
  targetCount: number;
  segments: [number, number][];
}

export class AnchorParser {
  static readonly REG = {
    // 一部の互換掲示板はdat本文のアンカーをHTMLエンティティへ変換せず、生の「>>」で返す。
    // 表示変換と返信先解析が同じ正規表現を使うため、ここで3種類の表記を受け入れる。
    ANCHOR:
      /(?:(?:&gt;|＞){1,2}|>>)[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*/g,
    _FW_NUMBER: /[\uff10-\uff19]/g,
  };

  /**
   * Normalizes full-width numbers and special characters.
   */
  private static normalize(str: string): string {
    str = str.replace(/[\u30fc\uff0d\u2212\u2015\u2010]/g, "-");
    str = str.replace(this.REG._FW_NUMBER, (s) => String.fromCharCode(s.charCodeAt(0) - 65248));
    return str;
  }

  /**
   * Parses an anchor string.
   */
  static parse(str: string): AnchorData {
    const data: AnchorData = {
      targetCount: 0,
      segments: [],
    };

    const normalized = this.normalize(str);

    if (!/^(?:(?:&gt;|＞){1,2}|>>)?(\d+(?:-\d+)?(?:\s*[,、]\s*\d+(?:-\d+)?)*)$/.test(normalized)) {
      return data;
    }

    const segReg = /(\d+)(?:-(\d+))?/g;
    let match: RegExpExecArray | null;

    while ((match = segReg.exec(normalized))) {
      const startStr = match[1];
      const endStr = match[2];

      // Ignore if digit count is too large
      if (startStr.length > 5 || (endStr && endStr.length > 5)) {
        continue;
      }

      const start = parseInt(startStr, 10);
      if (start < 1) continue;

      let rStart: number;
      let rEnd: number;

      if (endStr) {
        const end = parseInt(endStr, 10);
        if (start <= end) {
          rStart = start;
          rEnd = end;
        } else {
          rStart = end;
          rEnd = start;
        }
      } else {
        rStart = rEnd = start;
      }

      data.targetCount += rEnd - rStart + 1;
      data.segments.push([rStart, rEnd]);
    }

    return data;
  }
}
