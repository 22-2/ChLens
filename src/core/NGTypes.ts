export const TYPE = {
  INVALID: "invalid",
  REG_EXP: "RegExp",
  REG_EXP_TITLE: "RegExpTitle",
  REG_EXP_HIGHLIGHT_TITLE: "RegExpHighlightTitle",
  REG_EXP_NAME: "RegExpName",
  REG_EXP_MAIL: "RegExpMail",
  REG_EXP_ID: "RegExpId",
  REG_EXP_SLIP: "RegExpSlip",
  REG_EXP_BODY: "RegExpBody",
  REG_EXP_URL: "RegExpUrl",
  TITLE: "Title",
  HIGHLIGHT_TITLE: "HighlightTitle",
  NAME: "Name",
  MAIL: "Mail",
  ID: "ID",
  SLIP: "Slip",
  BODY: "Body",
  /**
   * @deprecated use body instead
   * */
  WORD: "Word",
  URL: "Url",
  RES_COUNT: "ResCount",
  AUTO: "Auto",
  AUTO_CHAIN: "Chain",
  AUTO_CHAIN_ID: "ChainID",
  AUTO_CHAIN_SLIP: "ChainSLIP",
  AUTO_NOTHING_ID: "NothingID",
  AUTO_NOTHING_SLIP: "NothingSLIP",
  AUTO_REPEAT_MESSAGE: "RepeatMessage",
  AUTO_FORWARD_LINK: "ForwardLink",
  SIKI_GUARD: "SikiGuard",
} as const;

export type NGType = (typeof TYPE)[keyof typeof TYPE];

export interface InternalNGElement {
  type: string;
  word: string;
  reg?: RegExp;
  exception?: boolean;
  subType?: string[];
  subElements?: InternalNGElement[];
  scope?: { value: string | string[] };
  params?: Record<string, string>;
  expire?: number;
  name?: string;
  start?: string;
  finish?: string;
}
