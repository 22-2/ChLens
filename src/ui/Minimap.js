/**
@typedef {Object} MinimapMetrics
@property {number} scrollHeight
@property {number} clientHeight
@property {number} height
@property {number} width
@property {number} scale
@property {number} viewportHeightPx
@property {number} viewportTopPx
@property {number} maxViewportTop
*/

/**
@class Minimap
@constructor
@param {Element} view
@param {Element} content
@param {import("./ThreadContent.js").default} threadContent
*/
export default class Minimap {
  /**
   * @param {Element} view
   * @param {Element} content
   * @param {import("./ThreadContent.js").default} threadContent
   */
  constructor(view, content, threadContent) {
    this.view = view;
    this.content = content;
    this.threadContent = threadContent;

    this.container = document.createElement("div");
    this.container.className = "minimap-container";
    this.view.appendChild(this.container);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "minimap";
    this.container.appendChild(this.canvas);

    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = this.canvas.getContext("2d");
    this._isDragging = false;
    this._dragOffset = 0;
    this._pointerId = null;

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this._handlePointerDown = this._handlePointerDown.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerUp = this._handlePointerUp.bind(this);

    window.addEventListener("resize", this.resize);
    window.addEventListener("scroll", this.draw);
    this.content.addEventListener("scroll", this.draw);

    // Observe content changes to redraw
    this.observer = new MutationObserver(this.draw);
    this.observer.observe(this.content, { childList: true, subtree: true });

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.container);
    }

    this.canvas.addEventListener("pointerdown", this._handlePointerDown);
    this.canvas.addEventListener("pointermove", this._handlePointerMove);
    this.canvas.addEventListener("pointerup", this._handlePointerUp);
    this.canvas.addEventListener("pointercancel", this._handlePointerUp);

    this.resize();
  }

  resize() {
    // Compute a responsive width based on viewport width.
    // Use a percentage but clamp to sensible min/max so the minimap
    // remains usable on very small or very large screens.
    const minWidth = 30; // px
    const maxWidth = 200; // px
    const pct = 0.08; // 8% of viewport width
    const responsiveWidth = Math.round(
      Math.max(minWidth, Math.min(maxWidth, Math.round(window.innerWidth * pct)))
    );

    // Apply width as an inline style so it overrides static CSS if present
    // (CSS still controls height / other appearance).
    this.container.style.width = `${responsiveWidth}px`;

    this.canvas.width = this.container.clientWidth || responsiveWidth;
    this.canvas.height =
      this.container.clientHeight || Math.max(window.innerHeight - 29, 1);

    this.draw();
  }

  _getMetrics() {
    const scrollHeight = Math.max(this.content.scrollHeight, 1);
    const clientHeight = Math.max(this.content.clientHeight, 1);
    const height = Math.max(this.canvas.height, 1);
    const width = Math.max(this.canvas.width, 1);
    const scale = height / scrollHeight;
    const viewportHeightPx = Math.max(clientHeight * scale, 6);
    const viewportTopPx = this.content.scrollTop * scale;
    const maxViewportTop = Math.max(height - viewportHeightPx, 0);

    return {
      scrollHeight,
      clientHeight,
      height,
      width,
      scale,
      viewportHeightPx,
      viewportTopPx,
      maxViewportTop,
    };
  }

  draw() {
    if (!this.ctx) {
      return;
    }

    const metrics = this._getMetrics();
    const { width, height, viewportTopPx, viewportHeightPx } = metrics;

    this.ctx.clearRect(0, 0, width, height);

    this._drawPopularMarkers(metrics);

    this.ctx.fillStyle = "rgba(0, 120, 215, 0.3)";
    this.ctx.fillRect(0, viewportTopPx, width, viewportHeightPx);

    this.ctx.strokeStyle = "rgba(0, 120, 215, 0.8)";
    this.ctx.strokeRect(0.5, viewportTopPx + 0.5, width - 1, Math.max(viewportHeightPx - 1, 1));

    // Draw outer boundary for minimap area (1px inside canvas for crisp rendering)
    this.ctx.strokeStyle = "rgba(0,0,0,0.12)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  /**
   * @param {MinimapMetrics} metrics
   */
  _drawPopularMarkers(metrics) {
    const ctx = this.ctx;
    if (!ctx || !this.threadContent || !this.threadContent.repIndex) {
      return;
    }

    const { scale, height, width } = metrics;
    const rejectNg = Boolean(
      app?.config?.isOn && app.config.isOn("reject_ng_rep")
    );
    const repIndex = /** @type {Map<number, Set<number>>} */ (
      this.threadContent.repIndex
    );
    const repNgIndex = /** @type {Map<number, Set<number>> | undefined} */ (
      this.threadContent.repNgIndex
    );
    const arrowX = width - 6;
    const minY = 6;
    const maxY = height - 6;
    const hotColor = "rgba(220, 40, 40, 0.95)";
    const warmColor = "rgba(255, 140, 0, 0.9)";

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px system-ui, sans-serif";

    for (let [resKey, responders] of repIndex.entries()) {
      const res = this._getResElement(resKey);
      if (!res || res.offsetHeight === 0) {
        continue;
      }
      if (
        res.classList &&
        res.classList.contains("ng") &&
        !res.classList.contains("disp_ng")
      ) {
        continue;
      }

      let resCount = responders.size;
      if (rejectNg && repNgIndex && repNgIndex.has(resKey)) {
        const ngCount = repNgIndex.get(resKey);
        if (ngCount) {
          resCount -= ngCount.size;
        }
      }
      if (resCount < 3) {
        continue;
      }

      const markerHeight = Math.max(res.offsetHeight * scale, 4);
      const centerY = res.offsetTop * scale + markerHeight / 2;
      const y = Math.min(Math.max(centerY, minY), maxY);
      ctx.fillStyle = resCount >= 5 ? hotColor : warmColor;
      ctx.fillText("◀", arrowX, y);
    }
  }

  /**
   * @param {number} resKey
   * @returns {HTMLElement | null}
   */
  _getResElement(resKey) {
    return /** @type {HTMLElement | null} */ (
      this.content.children[resKey - 1] || null
    );
  }

  /**
   * @param {PointerEvent} event
   */
  _handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this._isDragging = true;
    this._pointerId = event.pointerId;
    this._updateScrollFromPointer(event, false);
  }

  /**
   * @param {PointerEvent} event
   */
  _handlePointerMove(event) {
    if (!this._isDragging || event.pointerId !== this._pointerId) {
      return;
    }
    event.preventDefault();
    this._updateScrollFromPointer(event, true);
  }

  /**
   * @param {PointerEvent} event
   */
  _handlePointerUp(event) {
    if (!this._isDragging || event.pointerId !== this._pointerId) {
      return;
    }
    event.preventDefault();
    this.canvas.releasePointerCapture(event.pointerId);
    this._isDragging = false;
    this._pointerId = null;
  }

  /**
   * @param {PointerEvent} event
   * @param {boolean} isDragUpdate
   */
  _updateScrollFromPointer(event, isDragUpdate) {
    const metrics = this._getMetrics();
    const rect = this.canvas.getBoundingClientRect();
    const relativeY = Math.min(
      Math.max(event.clientY - rect.top, 0),
      metrics.height
    );
    const { viewportTopPx, viewportHeightPx } = metrics;
    if (!isDragUpdate) {
      const inViewport =
        relativeY >= viewportTopPx &&
        relativeY <= viewportTopPx + viewportHeightPx;
      this._dragOffset = inViewport
        ? relativeY - viewportTopPx
        : viewportHeightPx / 2;
      this._scrollByPointer(relativeY, metrics, inViewport);
    } else {
      this._scrollByPointer(relativeY, metrics, true);
    }
  }

  /**
   * @param {number} relativeY
   * @param {MinimapMetrics} metrics
   * @param {boolean} useDragOffset
   */
  _scrollByPointer(relativeY, metrics, useDragOffset) {
    const data = metrics || this._getMetrics();
    const {
      scrollHeight,
      clientHeight,
      viewportHeightPx,
      maxViewportTop,
    } = data;

    let viewportTop = useDragOffset
      ? relativeY - this._dragOffset
      : relativeY - viewportHeightPx / 2;

    viewportTop = Math.min(Math.max(viewportTop, 0), maxViewportTop);

    const scrollableRange = scrollHeight - clientHeight;
    const ratio =
      maxViewportTop === 0 ? 0 : viewportTop / Math.max(maxViewportTop, 1);
    const target =
      scrollableRange <= 0 ? 0 : ratio * Math.max(scrollableRange, 0);

    this.content.scrollTo({ top: target, behavior: "auto" });
  }
}
