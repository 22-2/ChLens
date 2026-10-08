// ルールDSLの構文だけを定義する文法。
// 動作・対象・オプションの妥当性はdsl.tsの意味検証段階で判定し、ここでは扱わない。
//
// エラーで解析全体を止めないため、どの行も最終的にUnknownLineへ必ず一致させる。
// 構文上の誤りは例外ではなく行ノードとして返し、呼び出し側で複数の診断へ変換する。
//
// 生成物: pnpm --filter @chlen/chlib run generate:dsl

Document
  = first:NgLine rest:("\n" @NgLine)* { return [first, ...rest]; }

// NGは動作だけを見出しにし、ルール内のwhen/unlessと設定行を分離する。
// インデントは意味検証へ渡し、条件一覧の値が隣の条件へ漏れるのを防ぐ。
NgLine
  = BlankLine
  / CommentLine
  / indent:$LeadIn content:(NgConditionLine / NgHeaderLine / NgPropertyLine / NgValueLine) {
      const depth = indent.replace(/[\uFEFF\u200B\u200C\u200D]/g, "").replace(/\t/g, "  ").length;
      const item = content.type === "ng-header" && depth > 0
        ? { type: "ng-property", keyword: content.action, value: null } : content;
      return { ...item, line: location().start.line, column: indent.length + 1, indent: depth };
    }

NgHeaderLine
  = action:$[A-Za-z-]+ ":" Ws* LineEnd { return { type: "ng-header", action }; }

NgConditionLine
  = keyword:("when" / "unless") Ws+ target:$NonWs+ Ws+ operator:$("contains" / "regex" / ">=" / ">")
    tail:(":" Ws* LineEnd { return null; } / Ws+ value:NgValueContent Ws* LineEnd { return value; }) {
      return { type: "ng-condition", keyword, target, operator, value: tail };
    }

NgPropertyLine
  = keyword:$[A-Za-z-]+ tail:(":" Ws* LineEnd { return null; } / Ws+ value:NgValueContent Ws* LineEnd { return value; }) {
      return { type: "ng-property", keyword, value: tail };
    }

NgValueLine
  = value:NgValueContent Ws* LineEnd { return { type: "ng-value", value }; }

NgValueContent
  = quoted:NgQuoted Ws* rest:$Body? { return { kind: "quoted", value: quoted, rest: rest ?? "" }; }
  / ["'] Body? { return { kind: "unclosed" }; }
  / text:$Body { return { kind: "bare", text }; }

// 選択範囲に含まれる改行も1行の設定として保存する。\dや\b等は正規表現用に保持する。
NgQuoted
  = '"' chars:('\\\\' { return '\\'; } / '\\"' { return '"'; } / '\\n' { return '\n'; } / '\\r' { return '\r'; } / '\\t' { return '\t'; } / '\\' !('"' / '\\') { return '\\'; } / [^"\\\n])* '"' { return chars.join(""); }
  / "'" chars:('\\\\' { return '\\'; } / "\\'" { return "'"; } / '\\n' { return '\n'; } / '\\r' { return '\r'; } / '\\t' { return '\t'; } / '\\' !("'" / '\\') { return '\\'; } / [^'\\\n])* "'" { return chars.join(""); }

BlankLine
  = LeadIn LineEnd { return { type: "blank", line: location().start.line }; }

// 旧実装と同じく、インデントの有無にかかわらず行頭がコメント記号ならコメントとみなす。
CommentLine
  = LeadIn ("//" / "#" / "/*" / "*") [^\n]* {
      return { type: "comment", line: location().start.line };
    }

// 置換DSLの見出しは対象・方式・flagsを持つため、専用入口からこの字句を使う。
TopLevelLine
  = LeadIn line:(HeaderLine / UnknownLine) { return line; }

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

// ---- 置換DSL ----
// NGとは別の入口を持たせ、既存の見出し・空白・コメントの文法を共用する。
ReplacementDocument
  = first:ReplacementLine rest:("\n" @ReplacementLine)* { return [first, ...rest]; }

ReplacementLine
  = BlankLine
  / CommentLine
  / &Ws LeadIn content:(ReplacementConditionLine / ReplacementFieldLine) { return content; }
  / TopLevelLine

ReplacementConditionLine
  = keyword:("when" / "unless") Ws+ field:$NonWs+ Ws+ operator:$NonWs+ Ws+ value:ReplacementValue Ws* LineEnd {
      return { type: "replacement-condition", line: location().start.line, column: location().start.column, keyword, field, operator, value };
    }

ReplacementFieldLine
  = keyword:$NonWs+ value:(Ws+ @ReplacementValue)? Ws* LineEnd {
      return { type: "replacement-field", line: location().start.line, column: location().start.column, keyword, value: value ?? { kind: "bare", text: "" } };
    }

ReplacementValue
  = quoted:ReplacementQuoted Ws* rest:$Body? { return { kind: "quoted", value: quoted, rest: rest ?? "" }; }
  / ["'] Body? { return { kind: "unclosed" }; }
  / text:$Body { return { kind: "bare", text }; }

// \d等はそのまま保持する。末尾のバックスラッシュや引用符も往復できるよう、
// 置換DSLではバックスラッシュ自身と区切り引用符だけをエスケープとして扱う。
ReplacementQuoted
  = '"' chars:('\\\\' { return '\\'; } / '\\"' { return '"'; } / '\\' !('"' / '\\') { return '\\'; } / [^"\\\n])* '"' { return chars.join(""); }
  / "'" chars:('\\\\' { return '\\'; } / "\\'" { return "'"; } / '\\' !("'" / '\\') { return '\\'; } / [^'\\\n])* "'" { return chars.join(""); }

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
