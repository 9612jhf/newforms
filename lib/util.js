'use strict';

var Concur = require('Concur')
var is = require('isomorph/is')
var object = require('isomorph/object')
var validators = require('validators')

var env = require('./env')

var ValidationError = validators.ValidationError

var DEFAULT_DATE_INPUT_FORMATS = [
  '%Y-%m-%d'              // '2006-10-25'
, '%m/%d/%Y', '%m/%d/%y'  // '10/25/2006', '10/25/06'
, '%b %d %Y', '%b %d, %Y' // 'Oct 25 2006', 'Oct 25, 2006'
, '%d %b %Y', '%d %b, %Y' // '25 Oct 2006', '25 Oct, 2006'
, '%B %d %Y', '%B %d, %Y' // 'October 25 2006', 'October 25, 2006'
, '%d %B %Y', '%d %B, %Y' // '25 October 2006', '25 October, 2006'
]

var DEFAULT_TIME_INPUT_FORMATS = [
  '%H:%M:%S' // '14:30:59'
, '%H:%M'    // '14:30'
]

var DEFAULT_DATETIME_INPUT_FORMATS = [
  '%Y-%m-%d %H:%M:%S' // '2006-10-25 14:30:59'
, '%Y-%m-%d %H:%M'    // '2006-10-25 14:30'
, '%Y-%m-%d'          // '2006-10-25'
, '%m/%d/%Y %H:%M:%S' // '10/25/2006 14:30:59'
, '%m/%d/%Y %H:%M'    // '10/25/2006 14:30'
, '%m/%d/%Y'          // '10/25/2006'
, '%m/%d/%y %H:%M:%S' // '10/25/06 14:30:59'
, '%m/%d/%y %H:%M'    // '10/25/06 14:30'
, '%m/%d/%y'          // '10/25/06'
]

/**
 * Replaces String {placeholders} with properties of a given object, but
 * interpolates into and returns an Array instead of a String.
 * By default, any resulting empty strings are stripped out of the Array. To
 * disable this, pass an options object with a 'strip' property which is false.
 */
function formatToArray(str, obj, options) {
  var parts = str.split(/\{(\w+)\}/g)
  for (var i = 1, l = parts.length; i < l; i += 2) {
    parts[i] = (object.hasOwn(obj, parts[i])
                ? obj[parts[i]]
                : '{' + parts[i] + '}')
  }
  if (!options || (options && options.strip !== false)) {
    parts = parts.filter(function(p) { return p !== ''})
  }
  return parts
}

function maybeCall(item, prop) {
  var value = item[prop]
  if (is.Function(value)) {
    value = value.call(item)
  }
  return value
}

function makeChoices(list, valueProp, labelProp) {
  return list.map(function(item) {
    return [maybeCall(item, valueProp), maybeCall(item, labelProp)]
  })
}

/**
 * Validates choice input and normalises lazy, non-Array choices to be
 * [value, label] pairs
 * @returning {Array} a normalised version of the given choices.
 * @throws if an Array with length != 2 was found where a choice pair was expected.
 */
function normaliseChoices(choices) {
  if (!choices.length) { return choices }

  var normalisedChoices = []
  for (var i = 0, l = choices.length, choice; i < l; i++) {
    choice = choices[i]
    if (!is.Array(choice)) {
      // TODO In the development build, emit a warning about a choice being
      //      autmatically converted from 'blah' to ['blah', 'blah'] in case it
      //      wasn't intentional
      choice = [choice, choice]
    }
    if (choice.length != 2) {
      throw new Error('Choices in a choice list must contain exactly 2 values, ' +
                      'but got ' + JSON.stringify(choice))
    }
    if (is.Array(choice[1])) {
      var normalisedOptgroupChoices = []
      // This is an optgroup, so look inside the group for options
      var optgroupChoices = choice[1]
      for (var j = 0, m = optgroupChoices.length, optgroupChoice; j < m; j++) {
        optgroupChoice = optgroupChoices[j]
        if (!is.Array(optgroupChoice)) {
          // TODO In the development build, emit a warning about an optgroup
          //      choice being autmatically converted from 'blah' to
          //      ['blah', 'blah'] in case it wasn't intentional.
          optgroupChoice = [optgroupChoice, optgroupChoice]
        }
        if (optgroupChoice.length != 2) {
          throw new Error('Choices in an optgroup choice list must contain ' +
                          'exactly 2 values, but got ' +
                          JSON.stringify(optgroupChoice))
        }
        normalisedOptgroupChoices.push(optgroupChoice)
      }
      normalisedChoices.push([choice[0], normalisedOptgroupChoices])
    }
    else {
      normalisedChoices.push(choice)
    }
  }
  return normalisedChoices
}

/**
 * Converts 'firstName' and 'first_name' to 'First name', and
 * 'SHOUTING_LIKE_THIS' to 'SHOUTING LIKE THIS'.
 */
var prettyName = (function() {
  var capsRE = /([A-Z]+)/g
  var splitRE = /[ _]+/
  var allCapsRE = /^[A-Z][A-Z0-9]+$/

  return function(name) {
    // Prefix sequences of caps with spaces and split on all space
    // characters.
    var parts = name.replace(capsRE, ' $1').split(splitRE)

    // If we had an initial cap...
    if (parts[0] === '') {
      parts.splice(0, 1)
    }

    // Give the first word an initial cap and all subsequent words an
    // initial lowercase if not all caps.
    for (var i = 0, l = parts.length; i < l; i++) {
      if (i === 0) {
        parts[0] = parts[0].charAt(0).toUpperCase() +
                   parts[0].substr(1)
      }
      else if (!allCapsRE.test(parts[i])) {
        parts[i] = parts[i].charAt(0).toLowerCase() +
                   parts[i].substr(1)
      }
    }

    return parts.join(' ')
  }
})()

/**
 * Creates an object representing the data held in a form's elements.
 * @param {HTMLFormElement|string} form a form DOM element or a String
 *   specifying a form's id or name attribute. If a String is given, id is tried
 *   before name when attempting to find the form in the DOM. An error will be
 *   thrown if the form could not be found.
 * @return an object representing the data present in the form.
 */
function formData(form) {
  var data = {}
  if (is.String(form)) {
    form = document.getElementById(form) || document.forms[form]
  }
  if (!form) {
    throw new Error("formData couldn't find a form with '" + form + "'")
  }

  for (var i = 0, l = form.elements.length; i < l; i++) {
    var element = form.elements[i]
    var type = element.type
    var value = null

    // Retrieve the element's value (or values)
    if (type == 'hidden' || type == 'password' || type == 'text' ||
        type == 'email' || type == 'url' || type == 'number' || type == 'file' ||
        type == 'textarea' || ((type == 'checkbox' ||
                                type == 'radio') && element.checked)) {
      value = element.value
    }
    else if (type == 'select-one') {
      if (element.options.length) {
        value = element.options[element.selectedIndex].value
      }
    }
    else if (type == 'select-multiple') {
      value = []
      for (var j = 0, m = element.options.length; j < m; j++) {
        if (element.options[j].selected) {
          value.push(element.options[j].value)
        }
      }
      if (value.length === 0) {
        value = null
      }
    }

    // Add any value obtained to the data object
    if (value !== null) {
      if (object.hasOwn(data, element.name)) {
        if (is.Array(data[element.name])) {
          data[element.name] = data[element.name].concat(value)
        }
        else {
          data[element.name] = [data[element.name], value]
        }
      }
      else {
        data[element.name] = value
      }
    }
  }

  return data
}

/**
 * Coerces to string and strips leading and trailing spaces.
 */
var strip = function() {
  var stripRE =/(^\s+|\s+$)/g
  return function strip(s) {
    return (''+s).replace(stripRE, '')
  }
}()

/**
 * A collection of field errors that knows how to display itself in various
 * formats. This object's .error properties are the field names and
 * corresponding values are the errors.
 * @constructor
 */
var ErrorObject = Concur.extend({
  constructor: function ErrorObject(errors) {
    if (!(this instanceof ErrorObject)) { return new ErrorObject(errors) }
    this.errors = errors || {}
  }
})

ErrorObject.prototype.set = function(field, error) {
  this.errors[field] = error
}

ErrorObject.prototype.get = function(field) {
  return this.errors[field]
}

ErrorObject.prototype.hasField = function(field) {
  return object.hasOwn(this.errors, field)
}

ErrorObject.prototype.length = function() {
  return Object.keys(this.errors).length
}

/**
 * Determines if any errors are present.
 */
ErrorObject.prototype.isPopulated = function() {
  return (this.length() > 0)
}

/**
 * Default display is as a list.
 */
ErrorObject.prototype.render = function() {
  return this.asUl()
}

/**
 * Displays error details as a list.
 */
ErrorObject.prototype.asUl = function() {
  var items = Object.keys(this.errors).map(function(field) {
    return env.render('li', null, field, this.errors[field].asUl())
  }.bind(this))
  if (items.length === 0) { return }
  return env.render('ul', {className: 'errorlist'}, items)
}

/**
 * Displays error details as text.
 */
ErrorObject.prototype.asText = ErrorObject.prototype.toString = function() {
  return Object.keys(this.errors).map(function(field) {
    var mesages = this.errors[field].messages()
    return ['* ' + field].concat(mesages.map(function(message) {
      return ('  * ' + message)
    })).join('\n')
  }.bind(this)).join('\n')
}

ErrorObject.prototype.asData = function() {
  var data = {}
  Object.keys(this.errors).map(function(field) {
    data[field] = this.errors[field].asData()
  }.bind(this))
  return data
}

ErrorObject.prototype.toJSON = function() {
  var jsonObj = {}
  Object.keys(this.errors).map(function(field) {
    jsonObj[field] = this.errors[field].toJSON()
  }.bind(this))
  return jsonObj
}

/**
 * A list of errors which knows how to display itself in various formats.
 * @param {Array=} list a list of errors.
 * @constructor
 */
var ErrorList = Concur.extend({
  constructor: function ErrorList(list) {
    if (!(this instanceof ErrorList)) { return new ErrorList(list) }
    this.data = list || []
  }
})

/**
 * Adds more errors.
 * @param {Array} errorList a list of errors
 */
ErrorList.prototype.extend = function(errorList) {
  this.data.push.apply(this.data, errorList)
}

ErrorList.prototype.length = function() {
  return this.data.length
}

/**
 * Determines if any errors are present.
 */
ErrorList.prototype.isPopulated = function() {
  return (this.length() > 0)
}

/**
 * Returns the list of messages held in this ErrorList.
 */
ErrorList.prototype.messages = function() {
  var messages = []
  for (var i = 0, l = this.data.length; i < l; i++) {
    var error = this.data[i]
    if (error instanceof ValidationError) {
      error = error.messages()[0]
    }
    messages.push(error)
  }
  return messages
}

/**
 *  Default display is as a list.
 */
ErrorList.prototype.render = function() {
  return this.asUl()
}

/**
 * Displays errors as a list.
 */
ErrorList.prototype.asUl = function() {
  if (!this.isPopulated()) {
    return
  }
  return env.render('ul', {className: 'errorlist'}
  , this.messages().map(function(error) {
      return env.render('li', null, error)
    })
  )
}

/**
 * Displays errors as text.
 */
ErrorList.prototype.asText = ErrorList.prototype.toString =function() {
  return this.messages().map(function(error) {
    return '* ' + error
  }).join('\n')
}

ErrorList.prototype.asData = function() {
  return this.data
}

ErrorList.prototype.toJSON = function() {
  return ValidationError(this.data).errorList.map(function(error) {
    return {
      message: error.messages()[0]
    , code: error.code || ''
    }
  })
}

module.exports = {
  DEFAULT_DATE_INPUT_FORMATS: DEFAULT_DATE_INPUT_FORMATS
, DEFAULT_TIME_INPUT_FORMATS: DEFAULT_TIME_INPUT_FORMATS
, DEFAULT_DATETIME_INPUT_FORMATS: DEFAULT_DATETIME_INPUT_FORMATS
, ErrorObject: ErrorObject
, ErrorList: ErrorList
, formData: formData
, formatToArray: formatToArray
, makeChoices: makeChoices
, normaliseChoices: normaliseChoices
, prettyName: prettyName
, strip: strip
}
