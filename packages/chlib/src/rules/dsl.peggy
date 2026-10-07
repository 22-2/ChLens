// ルールDSLの構文だけを定義する文法。
// 動作・対象・オプションの妥当性はdsl.tsの意味検証段階で判定し、ここでは扱わない。
//
// エラーで解析全体を止めないため、どの行も最終的にUnknownLineへ必ず一致させる。
// 構文上の誤りは例外ではなく行ノードとして返し、呼び出し側で複数の診断へ変換する。
//
// 生成物: pnpm --filter @chlen/chlib run generate:dsl

Document
  = first:Line rest:("\n" @Line)* { return [first, ...rest]; }

Line
  = BlankLine
  / CommentLine
  / ValueLine
  / TopLevelLine

BlankLine
  = LeadIn LineEnd { return { type: "blank", line: location().start.line }; }

// 旧実装と同じく、インデントの有無にかかわらず行頭がコメント記号ならコメントとみなす。
CommentLine
  = LeadIn ("//" / "#" / "/*" / "*") [^\n]* {
      return { type: "comment", line: location().start.line };
    }

// 行頭が空白（BOMを含むJSの\s）ならルール本文の値行として扱う。
ValueLine
  = &Ws LeadIn value:ValueContent Ws* LineEnd {
      return { type: "value", line: location().start.line, value };
    }

TopLevelLine
  = LeadIn line:(AndHeaderLine / InvalidAndLine / HeaderLine / UnknownLine) { return line; }

AndHeaderLine
  = "and"i Ws+ head:HeaderTail {
      return { type: "and-header", line: location().start.line, ...head };
    }

// "and"で始まるのにAND見出しとして読めない行は、通常の見出しと誤認させずに診断する。
InvalidAndLine
  = "and"i (Ws / ":" / LineEnd) [^\n]* {
      return { type: "invalid-and", line: location().start.line };
    }

HeaderLine
  = action:$NonWs+ Ws+ head:HeaderTail {
      return { type: "header", line: location().start.line, action, ...head };
    }

UnknownLine
  = [^\n]* { return { type: "unknown", line: location().start.line }; }

// 見出し末尾の「:」は、後ろに空白しか続かない最後のコロンだけを区切りとみなす。
// オプション値（例: label="a:b"）に含まれるコロンは区切りにしない。
HeaderTail
  = target:$(!HeaderEnd NonWs)+ options:(Ws+ @$(!HeaderEnd [^\n])*)? HeaderEnd {
      return { target, optionsSource: options ?? "" };
    }

HeaderEnd
  = ":" Ws* LineEnd

// ---- 値 ----

// DSLの引用符はJSON文字列ではなく、正規表現をそのまま書くための境界にする。
// そのため、バックスラッシュは保持し、区切り文字を含めたい場合だけ引用符を逃がす。
ValueContent
  = quoted:Quoted Ws* rest:$Body? {
      return { kind: "quoted", value: quoted, rest: rest ?? "" };
    }
  / ["'] Body? { return { kind: "unclosed" }; }
  / text:$Body { return { kind: "bare", text }; }

Quoted
  = '"' chars:('\\"' { return '"'; } / [^"\n])* '"' { return chars.join(""); }
  / "'" chars:("\\'" { return "'"; } / [^'\n])* "'" { return chars.join(""); }

// 単独の値（オプション値や比較値）を解析する入口。前後の空白は無視する。
Scalar
  = Ws* value:ValueContent? Ws* !. { return value ?? { kind: "bare", text: "" }; }

// ---- オプションのトークン ----

// 空白で区切る。ただし引用符と角括弧の内側の空白では区切らない。
// 閉じていない引用符・角括弧は、入力末尾までを1つのトークンとして扱う。
OptionList
  = items:(Ws+ { return null; } / Token)* !. { return items.filter((item) => item !== null); }

Token
  = $TokenPart+

TokenPart
  = QuotedToken
  / BracketToken
  / !Ws .

QuotedToken
  = '"' ("\\" . / "\\" / [^"])* '"'?
  / "'" ("\\" . / "\\" / [^'])* "'"?

BracketToken
  = "[" (QuotedToken / BracketToken / [^\]"'[])* "]"?

// ---- 字句 ----

// Monacoや貼り付け元によってBOM/ゼロ幅文字が行頭へ混ざることがあるため、判定前に読み飛ばす。
LeadIn
  = [\uFEFF\u200B\u200C\u200D]* Ws*

// 空白で終わらない行本文。末尾の空白は含めない。
Body
  = (!(Ws* LineEnd) [^\n])+

LineEnd
  = &"\n" / !.

// JavaScriptの正規表現\sから改行を除いたもの（全角空白やBOMも含む）。
Ws
  = [ \t\v\f\r\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]

NonWs
  = !Ws [^\n]
