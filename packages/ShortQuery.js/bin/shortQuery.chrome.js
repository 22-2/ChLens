/*!
 * ShortQuery.js v1.1.0-chrome  MIT License
 * (C) 2015 S <https://github.com/S--Minecraft>
 */
(function() {
  /*
    DOM Extention
  */
  var d;

  d = Document;

  d.prototype.id = d.prototype.getElementById;

  d.prototype.class = d.prototype.getElementsByClassName;

  d.prototype.tag = d.prototype.getElementsByTagName;

  d.prototype.query = d.prototype.querySelector;

  d.prototype.queryAll = d.prototype.querySelectorAll;

  d.prototype.I = d.prototype.id;

  d.prototype.C = d.prototype.class;

  d.prototype.T = d.prototype.tag;

  d.prototype.$ = d.prototype.query;

  d.prototype.$$ = d.prototype.queryAll;

  d.prototype.create = d.prototype.createElement;

  d.prototype.$__ = d.prototype.create;

  d.prototype.createFragment = d.prototype.createDocumentFragment;

  d.prototype.$_F = d.prototype.createFragment;

}).call(this);

(function() {
  /*
    DOM Extention
  */
  var d;

  d = DocumentFragment;

  // child node search
  d.prototype.id = d.prototype.getElementById;

  d.prototype.query = d.prototype.querySelector;

  d.prototype.queryAll = d.prototype.querySelectorAll;

  d.prototype.I = d.prototype.id;

  d.prototype.$ = d.prototype.query;

  d.prototype.$$ = d.prototype.queryAll;

  // add/remove node
  d.prototype.addLast = d.prototype.append;

  d.prototype.addFirst = d.prototype.prepend;

  d.prototype.removeChildren = function() {
    this.textContent = null;
    return this;
  };

  // get/set family
  d.prototype.child = function() {
    return this.children;
  };

  d.prototype.first = function() {
    return this.firstElementChild;
  };

  d.prototype.last = function() {
    return this.lastElementChild;
  };

}).call(this);

(function() {
  /*
    DOM Extention
  */
  var ele;

  ele = Element;

  // child node search
  ele.prototype.childClass = ele.prototype.getElementsByClassName;

  ele.prototype.childTag = ele.prototype.getElementsByTagName;

  ele.prototype.query = ele.prototype.querySelector;

  ele.prototype.queryAll = ele.prototype.querySelectorAll;

  ele.prototype.C = ele.prototype.childClass;

  ele.prototype.T = ele.prototype.childTag;

  ele.prototype.$ = ele.prototype.query;

  ele.prototype.$$ = ele.prototype.queryAll;

  // add/remove node
  ele.prototype.addLast = ele.prototype.append;

  ele.prototype.addFirst = ele.prototype.prepend;

  ele.prototype.addBefore = ele.prototype.before;

  ele.prototype.addAfter = ele.prototype.after;

  ele.prototype.removeChildren = function() {
    this.textContent = null;
    return this;
  };

  // get/set family
  ele.prototype.parent = function() {
    return this.parentElement;
  };

  ele.prototype.child = function() {
    return this.children;
  };

  ele.prototype.prev = function() {
    return this.previousElementSibling;
  };

  ele.prototype.next = function() {
    return this.nextElementSibling;
  };

  ele.prototype.first = function() {
    return this.firstElementChild;
  };

  ele.prototype.last = function() {
    return this.lastElementChild;
  };

  // get/set node
  ele.prototype.getAttr = ele.prototype.getAttribute;

  ele.prototype.setAttr = ele.prototype.setAttribute;

  ele.prototype.removeAttr = ele.prototype.removeAttribute;

  ele.prototype.rmvAttr = ele.prototype.removeAttr;

  ele.prototype.hasAttr = ele.prototype.hasAttribute;

  ele.prototype.attr = function(a, b) {
    if (b != null) {
      return this.setAttr(a, b);
    } else {
      return this.getAttr(a);
    }
  };

  ele.prototype.getClass = function() {
    return this.classList;
  };

  ele.prototype.setClass = function(...a) {
    this.className = a.join(" ");
    return this;
  };

  ele.prototype.class = function(a) {
    if (a != null) {
      return this.setClass(a);
    } else {
      return this.getClass();
    }
  };

  // extention
  ele.prototype.addClass = function(...a) {
    this.classList.add(...a);
    return this;
  };

  ele.prototype.removeClass = function(...a) {
    this.classList.remove(...a);
    return this;
  };

  if (DOMTokenList.prototype.replace != null) {
    ele.prototype.replaceClass = function(a, b) {
      this.classList.replace(a, b);
      return this;
    };
  } else {
    ele.prototype.replaceClass = function(a, b) {
      if (this.classList.has(a)) {
        this.classList.remove(a);
        this.classList.add(b);
      }
      return this;
    };
  }

  ele.prototype.toggleClass = function(a) {
    this.classList.toggle(a);
    return this;
  };

  ele.prototype.hasClass = function(a) {
    return this.classList.contains(a);
  };

}).call(this);

(function() {
  /*
    Event
  */
  var e;

  e = EventTarget;

  e.prototype.on = e.prototype.addEventListener;

  e.prototype.off = e.prototype.removeEventListener;

  e.prototype.emit = e.prototype.dispatchEvent;

}).call(this);

(function() {

  /*
    shortQuery
  */
  var d, exports, sq;

  exports = this;

  // shorthands
  d = document;

  sq = d.querySelectorAll.bind(d);

  // search node
  sq.id = d.getElementById.bind(d);

  sq.class = d.getElementsByClassName.bind(d);

  sq.tag = d.getElementsByTagName.bind(d);

  sq.query = d.querySelector.bind(d);

  sq.queryAll = d.querySelectorAll.bind(d);

  sq.I = sq.id;

  sq.C = sq.class;

  sq.T = sq.tag;

  sq.$ = sq.query;

  sq.$$ = sq.queryAll;

  // create node
  sq.create = d.createElement.bind(d);

  sq.createFragment = d.createDocumentFragment.bind(d);

  exports.shortQuery = sq;

  exports.$$ = sq;

  exports.$__ = sq.create;

  exports.$_F = sq.createFragment;

  if (HTMLCollection.prototype[Symbol.iterator] == null) {
    HTMLCollection.prototype[Symbol.iterator] = Array.prototype.values;
  }

}).call(this);
