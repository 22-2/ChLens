###
  DOM Extention
###
ele = Element

# child node search
ele::childClass = ele::getElementsByClassName
ele::childTag = ele::getElementsByTagName
ele::query = ele::querySelector
ele::queryAll = ele::querySelectorAll
ele::C = ele::childClass
ele::T = ele::childTag
ele::$ = ele::query
ele::$$ = ele::queryAll
# add/remove node
if ele::append
  ele::addLast = ele::append
else
  ele::addLast = (es...) ->
    for e in es
      @appendChild(e)
    return
if ele::prepend
  ele::addFirst = ele::prepend
else
  ele::addFirst = (es...) ->
    for e in es by -1
      @insertBefore(e, @firstChild)
    return
if ele::before
  ele::addBefore = ele::before
else
  ele::addBefore = (es...) ->
    for e in es by -1
      @parentNode.insertBefore(e, @)
    return
if ele::after
  ele::addAfter = ele::after
else
  ele::addAfter = (es...) ->
    for e in es
      @parentNode.insertBefore(e, @nextSibling)
    return
ele::remove ?= ->
  return @parentNode.removeChild(@)
ele::removeChildren = ->
  @textContent = null
  return @
if ele::replaceWith?
  ele::replaceWith = (a) ->
    @parentNode.replaceChild(a, @)
    return
# get/set family
ele::parent = ->
  return @parentElement
ele::child = ->
  return @children
ele::prev = ->
  return @previousElementSibling
ele::next = ->
  return @nextElementSibling
ele::first = ->
  return @firstElementChild
ele::last = ->
  return @lastElementChild
# get/set node
ele::getAttr = ele::getAttribute
ele::setAttr = ele::setAttribute
ele::removeAttr = ele::removeAttribute
ele::rmvAttr = ele::removeAttr
ele::hasAttr = ele::hasAttribute
ele::attr = (a, b) ->
  return if b? then @setAttr(a, b) else @getAttr(a)
ele::getClass = ->
  return @classList
ele::setClass = (a...) ->
  @className = a.join(" ")
  return @
ele::class = (a) ->
  return if a? then @setClass(a) else @getClass()
# extention
ele::addClass = (a...) ->
  @classList.add(a...)
  return @
ele::removeClass = (a...) ->
  @classList.remove(a...)
  return @
if DOMTokenList::replace?
  ele::replaceClass = (a, b) ->
    @classList.replace(a, b)
    return @
else
  ele::replaceClass = (a, b) ->
    if @classList.has(a)
      @classList.remove(a)
      @classList.add(b)
    return @
ele::toggleClass = (a) ->
  @classList.toggle(a)
  return @
ele::hasClass = (a) ->
  return @classList.contains(a)
