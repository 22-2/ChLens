exports = @

# shorthands
d = document

###
  shortQuery
###
sq = d.querySelectorAll.bind(d)

# search node
sq.id = d.getElementById.bind(d)
sq.class = d.getElementsByClassName.bind(d)
sq.tag = d.getElementsByTagName.bind(d)
sq.query = d.querySelector.bind(d)
sq.queryAll = d.querySelectorAll.bind(d)
sq.I = sq.id
sq.C = sq.class
sq.T = sq.tag
sq.$ = sq.query
sq.$$ = sq.queryAll
# create node
sq.create = d.createElement.bind(d)
sq.createFragment = d.createDocumentFragment.bind(d)

exports.shortQuery = sq
exports.$$ = sq
exports.$__ = sq.create
exports.$_F = sq.createFragment

unless HTMLCollection.prototype[Symbol.iterator]?
  HTMLCollection.prototype[Symbol.iterator] = Array.prototype.values
