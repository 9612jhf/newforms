var path = require('path')

var buildumb = require('buildumb')

buildumb.build({
  root: path.normalize(path.join(__dirname, '..'))
, modules: {
  // isomorph
    'node_modules/isomorph/lib/is.js'     : ['isomorph/lib/is', './is']
  , 'node_modules/isomorph/lib/format.js' : 'isomorph/lib/format'
  , 'node_modules/isomorph/lib/object.js' : 'isomorph/lib/object'
  , 'node_modules/isomorph/lib/array.js'  : 'isomorph/lib/array'
  , 'node_modules/isomorph/lib/copy.js'   : 'isomorph/lib/copy'
  , 'node_modules/isomorph/lib/time.js'   : 'isomorph/lib/time'
  // Concur
  , 'node_modules/Concur/lib/concur.js'   : 'Concur'
  // DOMBuilder
  , 'node_modules/DOMBuilder/lib/dombuilder/core.js' : ['./dombuilder/core', './core']
  , 'node_modules/DOMBuilder/lib/dombuilder/dom.js'  : './dombuilder/dom'
  , 'node_modules/DOMBuilder/lib/dombuilder/html.js' : './dombuilder/html'
  , 'node_modules/DOMBuilder/support/DOMBuilder.js'  : 'DOMBuilder'
  // newforms
  , 'src/util.js'       : './util'
  , 'src/validators.js' : './validators'
  , 'src/widgets.js'    : './widgets'
  , 'src/fields.js'     : './fields'
  , 'src/forms.js'      : './forms'
  , 'src/formsets.js'   : './formsets'
  , 'src/models.js'     : './models'
  , 'src/newforms.js'   : 'newforms'
  }
, exports: {
    'forms': 'newforms'
  }
, exposeRequire: true
, output: 'newforms.js'
, compress: 'newforms.min.js'
, header: buildumb.formatTemplate(path.join(__dirname, 'header.js'),
                                  require('../package.json').version)
})
