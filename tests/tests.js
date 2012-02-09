var path = require('path')

var qqunit = require('qqunit')
  , object = require('isomorph/lib/object')

object.extend(global, require('./customAsserts'))
global.DOMBuilder = require('DOMBuilder')
global.forms = require('../lib/newforms')

var tests = [ 'util.js'
            , 'validators.js'
            , 'ipv6.js'
            , 'forms.js'
            , 'formsets.js'
            , 'fields.js'
            , 'errormessages.js'
            , 'widgets.js'
            , 'extra.js'
            , 'models.js'
            , 'regressions.js'
            ].map(function(t) { return path.join(__dirname, t) })

qqunit.Runner.run(tests, function(stats) {
  process.exit(stats.failed)
})
