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
d::addLast = d::append
d::addFirst = d::prepend
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
