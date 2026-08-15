import { AnchorParser, MetadataParser } from "packages/ch-lib/src/index";
import { container } from "src/service-container/index";
import { replace as replaceStrTxt } from "src/core/ReplaceStrTxt.js";
import { evaluateAutoNg, isAutoNgEnabled } from "src/core/AutoNgPolicy";

/**
 * @typedef {import("../service-container/interfaces").IRes} IRes
 * @typedef {import("../service-container/interfaces").IThreadModel} IThreadModel
 * @typedef {import("../service-container/interfaces").INGResult} INGResult
 */

/**
 * ThreadModel manages the data and logic of a thread, including indexing,
 * NG calculation, and response relationships, independent of the view.
 * @implements {IThreadModel}
 */
export default class ThreadModel {
  /**
   * @param {any} url
   * @param {string | null} [title=null]
   */
  constructor(url, title = null) {
    this.url = url;
    this.urlStr = typeof url === "string" ? url : url.href;
    this.title = title || "";

    /** @type {Map<number, IRes>} */
    this.resData = new Map();

    /** @type {Map<string, Set<number>>} */
    this.idIndex = new Map();
    /** @type {Map<string, Set<number>>} */
    this.slipIndex = new Map();
    /** @type {Map<string, Set<number>>} */
    this.tripIndex = new Map();
    /** @type {Map<number, Set<number>>} */
    this.repIndex = new Map();
    /** @type {Map<number, Set<number>>} */
    this.repNgIndex = new Map();
    /** @type {Map<number, Set<number>>} */
    this.ancIndex = new Map();
    /** @type {Set<number>} */
    this.harmImgIndex = new Set();

    this.oneId = null;
    this.over1000ResNum = null;

    this._ngIdForChain = new Set();
    this._ngSlipForChain = new Set();
    this._resMessageMap = new Map();
    this._sikiGuardNgIdMap = new Map();

    /** @private */
    this._existIdAtFirstRes = false;
    /** @private */
    this._existSlipAtFirstRes = false;
  }

  /**
   * Adds a response to the model and updates indices.
   * @param {IRes} resRaw
   * @returns {void}
   */
  addRes(resRaw) {
    const resNum = this.resData.size + 1;
    const { bbsType } = container.util.guessType
      ? container.util.guessType(this.urlStr)
      : { bbsType: "2ch" };

    /** @type {IRes} */
    let res = {
      ...resRaw,
      num: resNum,
      class: resRaw.class ? [...resRaw.class] : [],
    };

    // Apply ReplaceStrTxt
    const replaced = replaceStrTxt(this.urlStr, this.title, res);
    res.name = replaced.name;
    res.mail = replaced.mail;
    res.message = replaced.message;
    // @ts-ignore
    res.other = replaced.other;

    // AA Detection
    if (/(?:\u3000{5}|\u3000\u0020|[^>]\u0020\u3000)(?!<br>|$)/i.test(res.message)) {
      res.isAA = true;
      res.class?.push("aa");
    }

    // Process Metadata & Update Indices
    this._parseMetadata(res);

    if (resNum === 1) {
      this.oneId = res.id || null;
    }
    if (res.id && res.id === this.oneId) {
      res.class?.push("one");
    }

    // Over 1000 check
    // @ts-ignore
    if (
      bbsType === "2ch" &&
      res.other &&
      res.other.startsWith("Over 1000") &&
      !this.over1000ResNum
    ) {
      this.over1000ResNum = resNum;
    }

    // Process Anchors
    const replyTargets = this.processAnchors(res);

    // NG Check
    const ngObj = this.checkNG(res, bbsType);
    if (ngObj) {
      res.ng = ngObj;
      res.class?.push("ng");
      this._handleNgDependencies(res, ngObj);
    }

    this.resData.set(resNum, res);

    // 返信先が既存レスなら、今回の安価で返信数NGの閾値を超える可能性がある。
    // addRes は逐次追加経路でも使われるため、全体refreshを待たず対象だけ再判定する。
    this._refreshReplyCountNgTargets(replyTargets, bbsType);

    // Run Chain NG (incremental)
    this._runChainNG();
  }

  /**
   * Processes a batch of items.
   * @param {any[]} items
   */
  addItems(items) {
    for (const item of items) {
      this.addRes(item);
    }
  }

  /**
   * @param {number} num
   * @returns {IRes | undefined}
   */
  getRes(num) {
    return this.resData.get(num);
  }

  /**
   * Recalculates all NG states and indices.
   */
  refreshNG() {
    const { bbsType } = container.util.guessType
      ? container.util.guessType(this.urlStr)
      : { bbsType: "2ch" };

    this._ngIdForChain.clear();
    this._ngSlipForChain.clear();
    this._resMessageMap.clear();
    this.repNgIndex.clear();

    // Reset NG status
    for (const res of this.resData.values()) {
      res.ng = undefined;
      res.class = res.class?.filter((c) => c !== "ng" && c !== "disp_ng") || [];
    }

    // Re-check NG
    for (const res of this.resData.values()) {
      if (res.class?.includes("ng")) continue;

      const ngObj = this.checkNG(res, bbsType);
      if (ngObj) {
        res.ng = ngObj;
        res.class?.push("ng");
        this._handleNgDependencies(res, ngObj);

        // Chain NG (immediate for this res)
        if (isAutoNgEnabled("chain")) {
          this.chainNG(res.num);
        }
      }
    }

    this._runChainNG();
  }

  /**
   * Parses metadata like ID, Slip, Trip and updates indices.
   * @private
   * @param {IRes} res
   */
  _parseMetadata(res) {
    const resNum = res.num;
    const meta = MetadataParser.parse(res.name, res.other || "");

    if (meta.slip) {
      res.slip = meta.slip;
      if (resNum === 1) this._existSlipAtFirstRes = true;
      if (!this.slipIndex.has(meta.slip)) this.slipIndex.set(meta.slip, new Set());
      const set = this.slipIndex.get(meta.slip);
      if (set) set.add(resNum);
    }

    if (meta.trip) {
      res.trip = meta.trip;
      if (!this.tripIndex.has(meta.trip)) this.tripIndex.set(meta.trip, new Set());
      const set = this.tripIndex.get(meta.trip);
      if (set) set.add(resNum);
    }

    if (meta.id) {
      res.id = meta.id;
      if (resNum === 1) this._existIdAtFirstRes = true;
      if (!this.idIndex.has(meta.id)) this.idIndex.set(meta.id, new Set());
      const set = this.idIndex.get(meta.id);
      if (set) set.add(resNum);
    }
  }

  /**
   * Processes anchors in the message and updates reply indices.
   * @param {IRes} res
   * @returns {Set<number>} The response numbers referenced by this response.
   */
  processAnchors(res) {
    const resNum = res.num;
    const anchors = res.message.match(AnchorParser.REG.ANCHOR);
    const replyTargets = new Set();
    if (!anchors) return replyTargets;

    for (const ancStr of anchors) {
      const anchor = AnchorParser.parse(ancStr);
      if (anchor.targetCount > 0 && anchor.targetCount < 25) {
        for (const segment of anchor.segments) {
          /** @type {number} */
          let target = segment[0];
          while (target <= segment[1]) {
            if (!this.repIndex.has(target)) this.repIndex.set(target, new Set());
            const rset = this.repIndex.get(target);
            if (rset) rset.add(resNum);

            if (!this.ancIndex.has(resNum)) this.ancIndex.set(resNum, new Set());
            const aset = this.ancIndex.get(resNum);
            if (aset) aset.add(target);
            replyTargets.add(target);
            target++;
          }
        }
      }
    }

    return replyTargets;
  }

  /**
   * @private
   * @param {Set<number>} replyTargets
   * @param {string} bbsType
   */
  _refreshReplyCountNgTargets(replyTargets, bbsType) {
    for (const target of replyTargets) {
      const targetRes = this.resData.get(target);
      if (!targetRes || targetRes.class?.includes("ng")) continue;

      const ngObj = this.checkNG(targetRes, bbsType);
      if (!ngObj) continue;

      targetRes.ng = ngObj;
      targetRes.class?.push("ng");
      this._handleNgDependencies(targetRes, ngObj);
    }
  }

  /**
   * @param {IRes} res
   * @param {string} bbsType
   * @returns {INGResult | null}
   */
  checkNG(res, bbsType) {
    if (this.over1000ResNum != null && res.num >= this.over1000ResNum) return null;

    // 返信数NGは後続レスのアンカーも含めて判定するため、
    // ThreadModelの返信索引から一時的な判定用フィールドを組み立てる。
    const resForNg = {
      ...res,
      replyCount: this.repIndex.get(res.num)?.size ?? 0,
      anchorCount: this.ancIndex.get(res.num)?.size ?? 0,
    };

    // Word/Thread NG
    let ngObj = container.ng.isNGThread(resForNg, this.title, this.urlStr);
    if (ngObj) {
      return ngObj;
    }

    const autoNgType = evaluateAutoNg({
      response: res,
      bbsType,
      existsIdAtFirstResponse: this._existIdAtFirstRes,
      existsSlipAtFirstResponse: this._existSlipAtFirstRes,
      hasAnyId: this.idIndex.size > 0,
      hasAnySlip: this.slipIndex.size > 0,
      chainedIds: this._ngIdForChain,
      chainedSlips: this._ngSlipForChain,
      repeatedMessages: this._resMessageMap,
      canApply: () => true,
    });
    return autoNgType ? { type: autoNgType } : null;
  }

  /**
   * @private
   * @param {IRes} res
   * @param {INGResult} ngObj
   */
  _handleNgDependencies(res, ngObj) {
    // Collect ID/Slip for chain
    if (isAutoNgEnabled("chainId") && res.id && !["ID", "ChainID"].includes(ngObj.type)) {
      this._ngIdForChain.add(res.id);
    }
    if (isAutoNgEnabled("chainSlip") && res.slip && !["Slip", "ChainSLIP"].includes(ngObj.type)) {
      this._ngSlipForChain.add(res.slip);
    }

    // Update repNgIndex
    if (this.ancIndex.has(res.num)) {
      const set = this.ancIndex.get(res.num);
      if (set) {
        for (const target of set) {
          if (!this.repNgIndex.has(target)) this.repNgIndex.set(target, new Set());
          const rset = this.repNgIndex.get(target);
          if (rset) rset.add(res.num);
        }
      }
    }
  }

  /**
   * @private
   */
  _runChainNG() {
    if (isAutoNgEnabled("chainId")) {
      for (const id of this._ngIdForChain) this.chainNgById(id);
    }
    if (isAutoNgEnabled("chainSlip")) {
      for (const slip of this._ngSlipForChain) this.chainNgBySlip(slip);
    }
  }

  /**
   * @param {number} resNum
   */
  chainNG(resNum) {
    if (!this.repIndex.has(resNum)) return;
    const set = this.repIndex.get(resNum);
    if (!set) return;
    for (const r of set) {
      if (r <= resNum) continue;
      const targetRes = this.resData.get(r);
      if (!targetRes || targetRes.class?.includes("ng")) continue;

      targetRes.ng = { type: "Chain" };
      targetRes.class?.push("ng");
      this._handleNgDependencies(targetRes, targetRes.ng);
      this.chainNG(r);
    }
  }

  /**
   * @param {string} id
   */
  chainNgById(id) {
    const resNums = this.idIndex.get(id);
    if (!resNums) return;
    for (const r of resNums) {
      const res = this.resData.get(r);
      if (!res || res.class?.includes("ng")) continue;
      res.ng = { type: "ChainID" };
      res.class?.push("ng");
      this._handleNgDependencies(res, res.ng);
      if (isAutoNgEnabled("chain")) this.chainNG(r);
    }
  }

  /**
   * @param {string} slip
   */
  chainNgBySlip(slip) {
    const resNums = this.slipIndex.get(slip);
    if (!resNums) return;
    for (const r of resNums) {
      const res = this.resData.get(r);
      if (!res || res.class?.includes("ng")) continue;
      res.ng = { type: "ChainSLIP" };
      res.class?.push("ng");
      this._handleNgDependencies(res, res.ng);
      if (isAutoNgEnabled("chain")) this.chainNG(r);
    }
  }

  /**
   * Helper to determine which response is currently "read" based on scroll position.
   * @param {number} scrollTop
   * @param {number} clientHeight
   * @param {(num: number) => number} getOffsetTop
   * @param {(num: number) => number} getOffsetHeight
   * @returns {number}
   */
  getRead(scrollTop, clientHeight, getOffsetTop, _getOffsetHeight) {
    const containerBottom = scrollTop + clientHeight;
    const resCount = this.resData.size;

    // Check from the end
    for (let i = resCount; i >= 1; i--) {
      const top = getOffsetTop(i);
      if (top < containerBottom) return i;
    }
    return 1;
  }
}
