import type { IRes } from "src/service-container/interfaces";

import { ResItem, type ResItemProps } from "./ResItem";

export default { title: "ChLens/スレッド/ResItem" };

const baseRes: IRes = {
  num: 18,
  name: "名無しさん",
  mail: "",
  date: "2026/10/26(月) 12:34:56.78",
  id: "AbCdEf123456",
  message: "スレッド表示の基本となるレスです。本文の行間や名前、日時を確認できます。",
};

const handlers: Omit<
  ResItemProps,
  "res" | "idPos" | "idCount" | "repCount" | "miniAa" | "isOwn" | "isReplyToOwn"
> = {
  messageProtocol: "https:",
  onIdClick: () => {},
  onRepClick: () => {},
  onUrlClick: () => true,
  onUrlContextMenu: () => true,
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onContextMenu: () => {},
  isImageBlurred: false,
  imageBlurRadius: 4,
};

function Response({
  res,
  idCount = 2,
  repCount = 3,
  miniAa = false,
  isOwn = false,
  isReplyToOwn = false,
  ...props
}: {
  res: IRes;
  idCount?: number;
  repCount?: number;
  miniAa?: boolean;
  isOwn?: boolean;
  isReplyToOwn?: boolean;
} & Partial<ResItemProps>) {
  return (
    <div className="storybook-demo">
      <ResItem
        {...handlers}
        {...props}
        res={res}
        idPos={1}
        idCount={idCount}
        repCount={repCount}
        miniAa={miniAa}
        isOwn={isOwn}
        isReplyToOwn={isReplyToOwn}
      />
    </div>
  );
}

export function Default() {
  return <Response res={baseRes} />;
}

export function OwnResponse() {
  return <Response res={{ ...baseRes, num: 19, message: "自分が投稿したレスです。" }} isOwn />;
}

export function ReplyToOwn() {
  return (
    <Response
      res={{ ...baseRes, num: 20, message: "自分のレスに向けられた返信です。" }}
      isReplyToOwn
    />
  );
}

export function NgResponse() {
  return (
    <Response
      res={{
        ...baseRes,
        num: 21,
        message: "NG対象の本文は、表示を選ぶまで隠されます。",
        ng: { type: "Body", ruleDescription: "本文に『NG対象』を含む" },
      }}
      repCount={0}
    />
  );
}

export function NewLiveResponse() {
  return (
    <Response
      res={{ ...baseRes, num: 22, message: "実況中に新しく届いたレスです。", isNew: true }}
      animateEntry
      repCount={1}
    />
  );
}

export function AsciiArt() {
  return (
    <Response
      res={{
        ...baseRes,
        num: 23,
        id: undefined,
        message: "　∧＿∧\n（　´∀｀）\n（　　　　）",
        isAA: true,
      }}
      miniAa
      idCount={0}
      repCount={0}
    />
  );
}
