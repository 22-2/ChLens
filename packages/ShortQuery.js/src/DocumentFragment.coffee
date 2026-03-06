###
  DOM Extention
###
d = DocumentFragment

# child node search
d::id = d::getElementById
d::query = d::querySelector
d::queryAll = d::querySelectorAll
d::I = d::id
d::$ = d::query
d::$$ = d::queryAll
# add/remove node
if d::append
  d::addLast = d::append
else
  d::addLast = (es...) ->
    for e in es
      @appendChild(e)
    return
if d::prepend
  d::addFirst = d::prepend
else
  d::addFirst = (es...) ->
    for e in es by -1
      @insertBefore(e, @firstChild)
    return
d::removeChildren = ->
  @textContent = null
  return @
# get/set family
d::child = ->
  return @children
d::first = ->
  return @firstElementChild
d::last = ->
  return @lastElementChild
