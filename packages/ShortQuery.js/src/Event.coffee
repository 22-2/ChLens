###
  Event
###
if EventTarget?
  e = EventTarget
  e::on = e::addEventListener
  e::off = e::removeEventListener
  e::emit = e::dispatchEvent
else
  eventTarget = [Window, Document, Element, XMLHttpRequest]
  for e in eventTarget
    e::on = e::addEventListener
    e::off = e::removeEventListener
    e::emit = e::dispatchEvent
