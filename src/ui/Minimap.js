/**
@class Minimap
@constructor
@param {Element} view
@param {Element} content
*/
export default class Minimap {
  constructor(view, content) {
    this.view = view;
    this.content = content;
    
    this.container = document.createElement("div");
    this.container.className = "minimap-container";
    this.view.appendChild(this.container);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "minimap";
    this.container.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext("2d");

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);

    window.addEventListener("resize", this.resize);
    window.addEventListener("scroll", this.draw);
    
    // Observe content changes to redraw
    this.observer = new MutationObserver(this.draw);
    this.observer.observe(this.content, { childList: true, subtree: true });

    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const scale = this.canvas.height / document.documentElement.scrollHeight;
      const targetY = y / scale;
      window.scrollTo(0, targetY - window.innerHeight / 2);
    });

    this.resize();
  }

  resize() {
    this.canvas.width = 80;
    this.canvas.height = window.innerHeight - 29;
    this.draw();
  }

  draw() {
    if (!this.ctx) return;
    
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    
    const totalHeight = document.documentElement.scrollHeight;
    const scale = height / totalHeight;

    // Draw posts
    const articles = this.content.getElementsByTagName("article");
    this.ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        // Skip hidden elements if necessary, but offsetTop works.
        // Optimization: only draw if visible in minimap?
        // For now, draw all.
        const y = article.offsetTop * scale;
        const h = article.offsetHeight * scale;
        this.ctx.fillRect(2, y, width - 4, Math.max(1, h - 1));
    }

    // Draw viewport indicator
    const scrollTop = window.scrollY;
    const viewHeight = window.innerHeight;
    
    this.ctx.fillStyle = "rgba(0, 120, 215, 0.3)";
    this.ctx.fillRect(0, scrollTop * scale, width, viewHeight * scale);
    
    // Draw border for viewport
    this.ctx.strokeStyle = "rgba(0, 120, 215, 0.8)";
    this.ctx.strokeRect(0, scrollTop * scale, width, viewHeight * scale);
  }
}
