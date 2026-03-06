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
ele::addLast = ele::append
ele::addFirst = ele::prepend
ele::addBefore = ele::before
ele::addAfter = ele::after
ele::removeChildren = ->
  @textContent = null
  return @
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
