'use strict';

var Concur = require('Concur')
var copy = require('isomorph/copy')
var is = require('isomorph/is')
var object = require('isomorph/object')
var React = require('react')
var validators = require('validators')

var fields = require('./fields')
var util = require('./util')
var BoundField = require('./BoundField')
var ErrorList = require('./ErrorList')
var ErrorObject = require('./ErrorObject')

var Field = fields.Field
var FileField = fields.FileField
var ValidationError = validators.ValidationError

function noop() {}
var sentinel = {}

/** Property under which non-field-specific errors are stored. */
var NON_FIELD_ERRORS = '__all__'

/**
 * Checks if a field's view of raw input data (via its Widget) has changed.
 */
function fieldDataHasChanged(previous, current) {
  if (is.Array(previous) && is.Array(current)) {
    if (previous.length != current.length) { return true }
    for (var i = 0, l = previous.length; i < l; i++) {
      if (previous[i] != current[i]) { return true }
    }
    return false
  }
  return previous != current
}

if ('production' !== process.env.NODE_ENV) {
  var warnedOnImpliedValidateAuto = false
}

/**
 * A collection of Fields that knows how to validate and display itself.
 * @constructor
 * @param {Object.<string, *>} kwargs form options.
 */
var BaseForm = Concur.extend({
  constructor: function BaseForm(kwargs) {
    kwargs = object.extend({
      data: null, files: null, autoId: 'id_{name}', prefix: null,
      initial: null, errorConstructor: ErrorList, labelSuffix: ':',
      emptyPermitted: false, validation: null, controlled: false,
      onStateChange: null, onChange: null
    }, kwargs)
    this.isInitialRender = (kwargs.data === null && kwargs.files === null)
    this.data = kwargs.data || {}
    this.files = kwargs.files || {}
    this.autoId = kwargs.autoId
    this.prefix = kwargs.prefix
    this.initial = kwargs.initial || {}
    this.cleanedData = {}
    this.errorConstructor = kwargs.errorConstructor
    this.labelSuffix = kwargs.labelSuffix
    this.emptyPermitted = kwargs.emptyPermitted
    this.controlled = kwargs.controlled
    this.onChange = kwargs.onChange

    // Auto validation is implied when onChange is passed
    if (is.Function(kwargs.onChange)) {
      if ('production' !== process.env.NODE_ENV) {
        if (!warnedOnImpliedValidateAuto && kwargs.validation === 'auto') {
          util.info('Passing onChange to a Form or FormSet constructor also ' +
                    "implies validation: 'auto' by default - you don't have " +
                    'to set it manually.')
          warnedOnImpliedValidateAuto = true
        }
      }
      if (kwargs.validation === null) {
        kwargs.validation = 'auto'
      }
    }
    this.validation = util.normaliseValidation(kwargs.validation || 'manual')

    this._errors = null

    // Cancellable debounced functions for delayed event validation
    this._pendingEventValidation = {}
    // Input data as it was last time validation was performed on a field
    this._lastValidatedData = {}
    // Cached result of the last call to hasChanged()
    this._lastHasChanged = null

    // Lookup for names of fields pending validation
    this._pendingValidation = {}
    // Cancellable callbacks for pending async validation
    this._pendingAsyncValidation = {}
    // Lookup for names of fields pending validation which clean() depends on
    this._runCleanAfter = {}
    // Callback to be run the next time validation finishes
    this._onValidate = null

    // The baseFields attribute is the *prototype-wide* definition of fields.
    // Because a particular *instance* might want to alter this.fields, we
    // create this.fields here by deep copying baseFields. Instances should
    // always modify this.fields; they should not modify baseFields.
    this.fields = copy.deepCopy(this.baseFields)

    if ('production' !== process.env.NODE_ENV) {
      // Now that form.fields exists, we can check if there's any configuration
      // which *needs* onChange on the form or its fields.
      if (!is.Function(kwargs.onChange) && this._needsOnChange()) {
        util.warning("You didn't provide an onChange callback for a " +
                     this._formName() + ' which has controlled fields. This ' +
                     'will result in read-only fields.')
      }
    }

    // Copy initial values to the data object, as it represents form input -
    // literally so in the case of controlled components once we start taking
    // some data and isInitialRender flips to false.
    if (this.isInitialRender) {
      this._copyInitialToData()
    }
  }
})

/**
 * Calls the onChange function if it's been provided. This method will be called
 * every time the form makes a change to its state which requires redisplay.
 */
BaseForm.prototype._stateChanged = function() {
  if (typeof this.onChange == 'function') {
    this.onChange()
  }
}

/**
 * Copies initial data to the input data object, as it represents form input -
 * when using controlled components once we start taking some data,
 * isInitialRender flips to false and this.data is used for rendering widgets.
 */
BaseForm.prototype._copyInitialToData = function() {
  var initialData = object.extend(this._fieldInitialData(), this.initial)
  var initialFieldNames = Object.keys(initialData)
  for (var i = 0, l = initialFieldNames.length; i < l; i++) {
    var fieldName = initialFieldNames[i]
    if (typeof this.fields[fieldName] == 'undefined') { continue }
    // Don't copy initial to input data for fields which can't have the
    // initial data set as their current value.
    if (!this.fields[fieldName].widget.isValueSettable) { continue }
    this.data[this.addPrefix(fieldName)] = initialData[fieldName]
  }
}

/**
 * Gets initial data configured in this form's fields.
 * @return {Object.<string,*>}
 */
BaseForm.prototype._fieldInitialData = function() {
  var fieldInitial = {}
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l; i++) {
    var fieldName = fieldNames[i]
    var initial = this.fields[fieldName].initial
    if (initial !== null) {
      fieldInitial[fieldName] = initial
    }
  }
  return fieldInitial
}

/**
 * Tries to construct a display name for the form for display in error messages.
 * @return {string}
 */
BaseForm.prototype._formName = function() {
  var name = this.displayName || this.constructor.name
  return (name ? "'" + name + "'" : 'Form')
}

/**
 * @return {boolean} true if the form or any of its fields are configured to
 *   generate controlled components.
 */
BaseForm.prototype._needsOnChange = function() {
  if (this.controlled === true) {
    return true
  }
  var names = Object.keys(this.fields)
  for (var i = 0, l = names.length; i < l; i++) {
    if (this.fields[names[i]].controlled === true) {
      return true
    }
  }
  return false
}

// ============================================================== Validation ===

/**
 * Validates the form using its current input data.
 * @param {function(err, isValid, cleanedData)=} cb callback for asynchronous
 *   validation.
 * @return {boolean|undefined} true if the form only has synchronous validation
 *   and is valid.
 * @throws if the form has asynchronous validation and a callback is not
 *   provided.
 */
BaseForm.prototype.validate = function(cb) {
  this._cancelPendingOperations()
  return (this.isAsync() ? this._validateAsync(cb) : this._validateSync())
}

BaseForm.prototype._validateAsync = function(cb) {
  if (!is.Function(cb)) {
    throw new Error(
      'You must provide a callback to validate() when a form has ' +
      'asynchronous validation.'
    )
  }
  if (this.isInitialRender) {
    this.isInitialRender = false
  }
  this._onValidate = cb
  this.fullClean()
  // Display async progress indicators
  this._stateChanged()
}

BaseForm.prototype._validateSync = function() {
  if (this.isInitialRender) {
    this.isInitialRender = false
  }
  this.fullClean()
  return this.isValid()
}

/**
 * Cleans data for all fields and triggers cross-form cleaning.
 */
BaseForm.prototype.fullClean = function() {
  this._errors = new ErrorObject()
  if (this.isInitialRender) {
    return // Stop further processing
  }

  this.cleanedData = {}

  // If the form is permitted to be empty, and none of the form data has
  // changed from the initial data, short circuit any validation.
  if (this.emptyPermitted && !this.hasChanged()) {
    this._finishedValidation(null)
    return
  }

  this._cleanFields()
}

/**
 * Cleans data for the given field names and triggers cross-form cleaning in
 * case any cleanedData it uses has changed.
 * @param {Array.<string>} fields field names.
 */
BaseForm.prototype.partialClean = function(fields) {
  this._removeErrors(fields)

  // If the form is permitted to be empty, and none of the form data has
  // changed from the initial data, short circuit any validation.
  if (this.emptyPermitted && !this.hasChanged()) {
    if (this._errors.isPopulated()) {
      this._errors = ErrorObject()
    }
    return
  }

  this._preCleanFields(fields)
  for (var i = 0, l = fields.length; i < l; i++) {
    this._cleanField(fields[i])
  }
}

/**
 * Validates and cleans every field in the form.
 */
BaseForm.prototype._cleanFields = function() {
  var fieldNames = Object.keys(this.fields)
  this._preCleanFields(fieldNames)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    this._cleanField(fieldNames[i])
  }
}

/**
 * Sets up pending validation state prior to cleaning fields and configures
 * cross-field cleaning to run after its dependent fields have been cleaned, or
 * after all fields have been cleaned if dependencies have not been configured.
 * @param {Array.<string>} fieldNames fields which are about to be cleaned.
 */
BaseForm.prototype._preCleanFields = function(fieldNames) {
  // Add all field names to those pending validation
  object.extend(this._pendingValidation, object.lookup(fieldNames))

  // Add appropriate field names to determine when to run cross-field cleaning
  var i, l
  if (typeof this.clean.fields != 'undefined') {
    for (i = 0, l = fieldNames.length; i < l; i++) {
      if (this.clean.fields[fieldNames[i]]) {
        this._runCleanAfter[fieldNames[i]] = true
      }
    }
  }
  else {
    // Ignore any invalid field names given
    for (i = 0, l = fieldNames.length; i < l; i++) {
      if (this.fields[fieldNames[i]]) {
        this._runCleanAfter[fieldNames[i]] = true
      }
    }
  }
}

/**
 * Validates and cleans the named field and runs any custom validation function
 * that's been provided for it.
 * @param {string} name the name of a form field.
 */
BaseForm.prototype._cleanField = function(name) {
  if (!object.hasOwn(this.fields, name)) {
    throw new Error(this._formName() + " has no field named '" + name + "'")
  }

  var field = this.fields[name]
  // valueFromData() gets the data from the data objects.
  // Each widget type knows how to retrieve its own data, because some widgets
  // split data over several HTML fields.
  var value = field.widget.valueFromData(this.data, this.files,
                                         this.addPrefix(name))
  var async = false
  var error = null

  try {
    if (field instanceof FileField) {
      var initial = object.get(this.initial, name, field.initial)
      value = field.clean(value, initial)
    }
    else {
      value = field.clean(value)
    }
    this.cleanedData[name] = value
    var customClean = this._getCustomClean(name)
    if (is.Function(customClean)) {
      async = this._runCustomClean(name, customClean)
    }
  }
  catch (e) {
    if (e instanceof ValidationError) {
      this.addError(name, e)
    }
    else {
      error = e
    }
  }

  if (!async) {
    this._fieldCleaned(name, error)
  }
}

/**
 * Gets the custom cleaning method for a field. These can be named clean<Name>
 * or clean_<name>.
 * @param {string} fieldName
 * @return {function|undefined}
 */
BaseForm.prototype._getCustomClean = function(fieldName) {
  return (this['clean' + fieldName.charAt(0).toUpperCase() + fieldName.substr(1)] ||
          this['clean_' + fieldName])
}

/**
 * Calls a custom cleaning method, expecting synchronous or asynchronous
 * behaviour, depending on its arity.
 * @param {string} fieldName a field name.
 * @param {(function()|function(function(err, field, validationError)))} customClean
 *   the custom cleaning method for the field.
 * @return {boolean} true if cleaning is running asynchronously, false if it just
 *   ran synchronously.
 */
BaseForm.prototype._runCustomClean = function(fieldName, customClean) {
  // Check arity to see if we have a callback in the function signature
  if (customClean.length === 0) {
    // Synchronous processing only expected
    customClean.call(this)
    return false
  }

  // If custom validation is async and there's one pending, prevent its
  // callback from doing anything.
  if (typeof this._pendingAsyncValidation[fieldName] != 'undefined') {
    object.pop(this._pendingAsyncValidation, fieldName).cancel()
  }
  // Set up callback for async processing - arguments for addError()
  // should be passed via the callback as calling it directly prevents us
  // from completely ignoring the callback if validation fires again.
  var callback = function(err, field, validationError) {
    if (typeof validationError != 'undefined') {
      this.addError(field, validationError)
    }
    this._fieldCleaned(fieldName, err)
    this._stateChanged()
  }.bind(this)

  // An explicit return value of false indicates that async processing is
  // being skipped (e.g. because sync checks in the method failed first)
  var returnValue = customClean.call(this, callback)
  if (returnValue !== false) {
    // Async processing is happening! Make the callback cancellable and
    // hook up any custom onCancel handling provided.
    if (returnValue && typeof returnValue.onCancel == 'function') {
      callback.onCancel = returnValue.onCancel
    }
    this._pendingAsyncValidation[fieldName] = util.cancellable(callback)
    return true
  }
}

/**
 * Callback for completion of field cleaning. Triggers further field cleaning or
 * signals the end of validation, as necessary.
 * @param {string} fieldName
 * @param {Error=} err an error caught while cleaning the field.
 */
BaseForm.prototype._fieldCleaned = function(fieldName, err) {
  var wasPending = delete this._pendingValidation[fieldName]
  if (this._pendingAsyncValidation[fieldName]) {
    delete this._pendingAsyncValidation[fieldName]
  }

  if (err) {
    if ("production" !== process.env.NODE_ENV) {
      console.error('Error cleaning ' + this._formName() + '.' + fieldName +
                    ':' + err.message)
    }
    // Stop tracking validation progress on error, and don't call clean()
    this._pendingValidation = {}
    this._runCleanAfter = {}
    this._finishedValidation(err)
    return
  }

  // Run clean() if this this was the last field it was waiting for
  if (this._runCleanAfter[fieldName]) {
    delete this._runCleanAfter[fieldName]
    if (is.Empty(this._runCleanAfter)) {
      this._cleanForm()
      return
    }
  }

  // Signal the end of validation if this was the last field we were waiting for
  if (wasPending && is.Empty(this._pendingValidation)) {
    this._finishedValidation(null)
  }
}

/**
 * Hook for doing any extra form-wide cleaning after each Field has been cleaned.
 * Any ValidationError thrown by synchronous validation in this method will not
 * be associated with a particular field; it will have a special-case association
 * with the field named '__all__'.
 * @param {function(err, field, validationError)=} cb a callback to signal the
 *   end of asynchronous validation.
 */
BaseForm.prototype.clean = noop

/**
 * Calls the clean() hook.
 */
BaseForm.prototype._cleanForm = function() {
  var async = false
  var error = null
  try {
    if (this.clean !== noop) {
      async = this._runCustomClean(NON_FIELD_ERRORS, this.clean)
    }
  }
  catch (e) {
    if (e instanceof ValidationError) {
      this.addError(null, e)
    }
    else {
      error = e
    }
  }

  if (!async) {
    this._fieldCleaned(NON_FIELD_ERRORS, error)
  }
}

BaseForm.prototype._finishedValidation = function(err) {
  if (!this.isAsync()) {
    if (err) {
      throw err
    }
    // Synchronous form validation results will be returned via the original
    // call which triggered validation.
    return
  }
  if (is.Function(this._onValidate)) {
    var callback = this._onValidate
    this._onValidate = null
    if (err) {
      return callback(err)
    }
    var isValid = this.isValid()
    callback(null, isValid, isValid ? this.cleanedData : null)
  }
}

/**
 * Cancels any pending field validations and async validations.
 */
BaseForm.prototype._cancelPendingOperations = function() {
  Object.keys(this._pendingEventValidation).forEach(function(field) {
    object.pop(this._pendingEventValidation, field).cancel()
  }.bind(this))
  Object.keys(this._pendingAsyncValidation).forEach(function(field) {
    object.pop(this._pendingAsyncValidation, field).cancel()
  }.bind(this))
}

// ========================================================== Event Handling ===

/**
 * Handles validating the field which is the target of the given event based
 * on its validation config. This will be hooked up to the appropriate event
 * as per the field's validation config.
 * @param {Object} validation the field's validation config for the event.
 * @param {SyntheticEvent} e the event being handled.
 */
BaseForm.prototype._handleFieldEvent = function(validation, e) {
  // Update form.data with the current value of the field which is the target of
  // the event.
  var htmlName = e.target.name
  var fieldName = this.removePrefix(e.target.getAttribute('data-newforms-field') || htmlName)
  var field = this.fields[fieldName]
  var targetData = util.fieldData(e.target.form, htmlName)
  this.data[htmlName] = targetData
  if (this.isInitialRender) {
    this.isInitialRender = false
  }
  if (this.controlled || field.controlled) {
    this._stateChanged()
  }

  // Bail out early if the event is only being handled to update the field's data
  if (validation.validate === false) { return }

  var validate = false

  // Special cases for onBlur, as it ends a user's interaction with a text input
  if (validation.event == 'onBlur') {
    // If there is any pending validation, trigger it immediately
    if (typeof this._pendingEventValidation[fieldName] != 'undefined') {
      this._pendingEventValidation[fieldName].trigger()
      return
    }
    // Always validate if the field is required and the input which was blurred
    // was empty (some fields have multiple inputs).
    validate = (field.required && field.isEmptyValue(targetData))
  }

  // Always validate if this is the first time the field has been interacted
  // with.
  if (!validate) {
    var lastValidatedData = object.get(this._lastValidatedData, fieldName, sentinel)
    validate = (lastValidatedData === sentinel)
  }

  // Otherwise, validate if data has changed since validation was last performed
  // - this prevents displayed validation errors being cleared unnecessarily.
  if (!validate) {
    var fieldData = field.widget.valueFromData(this.data, null, this.addPrefix(fieldName))
    validate = fieldDataHasChanged(lastValidatedData, fieldData)
  }

  // Cancel any pending validation as it's no longer needed - this can happen
  // if the user edits a field with debounced validation and it ends up back
  // at its original value before validation is triggered.
  if (!validate && typeof this._pendingEventValidation[fieldName] != 'undefined') {
    object.pop(this._pendingEventValidation, fieldName).cancel()
  }

  // If we don't need to validate, we're done handling the event
  if (!validate) { return }

  if (validation.delay) {
    this._delayedFieldValidation(fieldName, validation.delay)
  }
  else {
    this._immediateFieldValidation(fieldName)
  }
}

/**
 * Sets up delayed validation of a field with a debounced function and calls it,
 * or just calls the function again if it already exists, to reset the delay.
 * @param {string} fieldName
 * @param {number} delay delay time in ms.
 */
BaseForm.prototype._delayedFieldValidation = function(fieldName, delay) {
  if (typeof this._pendingEventValidation[fieldName] == 'undefined') {
    this._pendingEventValidation[fieldName] = util.debounce(function() {
      delete this._pendingEventValidation[fieldName]
      this._immediateFieldValidation(fieldName)
    }.bind(this), delay)
  }
  this._pendingEventValidation[fieldName]()
}

/**
 * Validates a field and notifies the React component that state has changed.
 * @param {string} fieldName
 */
BaseForm.prototype._immediateFieldValidation = function(fieldName) {
  // Remove and cancel any pending validation for the field to avoid doubling up
  // when both delayed and immediate validation are configured.
  if (typeof this._pendingEventValidation[fieldName] != 'undefined') {
    object.pop(this._pendingEventValidation, fieldName).cancel()
  }
  this._lastValidatedData[fieldName] =
      this.fields[fieldName].widget.valueFromData(this.data, this.files,
                                                  this.addPrefix(fieldName))
  this.partialClean([fieldName])
  this._stateChanged()
}

// ============================================================== Mutability ===

/**
 * Resets a form data back to its initial state, optionally providing new initial
 * data.
 * @param {Object.<string, *>=} newInitial new initial data for the form.
 */
BaseForm.prototype.reset = function(newInitial) {
  this._cancelPendingOperations()

  if (typeof newInitial != 'undefined') {
    this.initial = newInitial
  }

  this.data = {}
  this.cleanedData = {}
  this.isInitialRender = true

  this._errors = null
  this._lastHasChanged = null
  this._pendingValidation = {}
  this._runCleanAfter = {}
  this._lastValidatedData = {}
  this._onValidate = null

  this._copyInitialToData()
  this._stateChanged()
}

/**
 * Sets the form's entire input data, also triggering validation by default.
 * @param {object.<string,*>} data new input data for the form.
 * @param {object.<string,boolean>} kwargs data setting options.
 * @return {boolean|undefined} if data setting options indicate the new data
 *   should be validated and the form does not have asynchronous validation
 *   configured: true if the new data is valid.
 */
BaseForm.prototype.setData = function(data, kwargs) {
  kwargs = object.extend({
    prefixed: false, validate: true, _triggerStateChange: true
  }, kwargs)

  this.data = (kwargs.prefixed ? data : this._prefixData(data))

  if (this.isInitialRender) {
    this.isInitialRender = false
  }
  if (kwargs.validate) {
    this._errors = null
    // This call ultimately triggers a fullClean() because _errors is null
    var isValid = this.isValid()
  }
  else {
    // Prevent validation being triggered if errors() is accessed during render
    this._errors = new ErrorObject()
  }

  if (kwargs._triggerStateChange) {
    this._stateChanged()
  }

  if (kwargs.validate && !this.isAsync()) {
    return isValid
  }
}

/**
 * Sets the form's entire input data wth data extracted from a ``<form>``, which
 * will be prefixed, if prefixes are being used.
 * @param {Object.<strong, *>} formData
 * @param {Object.<string, boolean>} kwargs setData options.
 */
BaseForm.prototype.setFormData = function(formData, kwargs) {
  return this.setData(formData, object.extend(kwargs || {}, {prefixed: true}))
}

/**
 * Updates some of the form's input data, optionally triggering validation of
 * updated fields and form-wide cleaning, or clears existing errors from the
 * updated fields.
 * @param {Object.<string, *>} data updated input data for the form.
 * @param {Object.<string, boolean>} kwargs update options.
 */
BaseForm.prototype.updateData = function(data, kwargs) {
  kwargs = object.extend({
    prefixed: false, validate: true, clearValidation: true
  }, kwargs)

  object.extend(this.data, (kwargs.prefixed ? data : this._prefixData(data)))
  if (this.isInitialRender) {
    this.isInitialRender = false
  }

  var fields = Object.keys(data)
  if (kwargs.prefixed) {
    fields = fields.map(this.removePrefix.bind(this))
  }

  if (kwargs.validate) {
    this.partialClean(fields)
  }
  else if (kwargs.clearValidation) {
    this._removeErrors(fields)
    this._removeCleanedData(fields)
    this._cleanForm()
  }

  this._stateChanged()
}

/**
 * Removes any cleanedData present for the given form fields.
 * @param {Array.<string>} fields field names.
 */
BaseForm.prototype._removeCleanedData = function(fields) {
  for (var i = 0, l = fields.length; i < l; i++) {
    delete this.cleanedData[fields[i]]
  }
}

// ============================================================= BoundFields ===

/**
 * Creates a BoundField for the field with the given name.
 * @param {string} name a field name.
 * @return {BoundField} a BoundField for the field.
 */
BaseForm.prototype.boundField = function(name) {
  if (!object.hasOwn(this.fields, name)) {
    throw new Error(this._formName() + " does not have a '" + name + "' field.")
  }
  return new BoundField(this, this.fields[name], name)
}

/**
 * Creates a BoundField for each field in the form, in the order in which the
 * fields were created.
 * @param {function(Field, string)=} test if provided, this function will be
 *   called with field and name arguments - BoundFields will only be generated
 *   for fields for which true is returned.
 * @return {Array.<BoundField>} a list of BoundField objects.
 */
BaseForm.prototype.boundFields = function(test) {
  var bfs = []
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    var fieldName = fieldNames[i]
    if (!test || test(this.fields[fieldName], fieldName)) {
      bfs.push(new BoundField(this, this.fields[fieldName], fieldName))
    }
  }
  return bfs
}

/**
 * Like boundFields(), but returns a name -> BoundField object instead.
 * @return {Object.<string, BoundField>}
 */
BaseForm.prototype.boundFieldsObj = function() {
  var bfs = {}
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    var fieldName = fieldNames[i]
    bfs[fieldName] = new BoundField(this, this.fields[fieldName], fieldName)
  }
  return bfs
}

/**
 * Returns a list of all the BoundField objects that correspond to hidden
 * fields. Useful for manual form layout.
 * @return {Array.<BoundField>}
 */
BaseForm.prototype.hiddenFields = function() {
  return this.boundFields(function(field) {
    return field.widget.isHidden
  })
}

/**
 * Returns a list of BoundField objects that do not correspond to hidden fields.
 * The opposite of the hiddenFields() method.
 * @return {Array.<BoundField>}
 */
BaseForm.prototype.visibleFields = function() {
  return this.boundFields(function(field) {
    return !field.widget.isHidden
  })
}

// ================================================================== Errors ===

/**
 * Updates the content of this._errors.
 * The field argument is the name of the field to which the errors should be
 * added. If its value is null the errors will be treated as NON_FIELD_ERRORS.
 * The error argument can be a single error, a list of errors, or an object that
 * maps field names to lists of errors. What we define as an "error" can be
 * either a simple string or an instance of ValidationError with its message
 * attribute set and what we define as list or object can be an actual list or
 * object or an instance of ValidationError with its errorList or errorObj
 * property set.
 * If error is an object, the field argument *must* be null and errors will be
 * added to the fields that correspond to the properties of the object.
 * @param {?string} field the name of a form field.
 * @param {(string|ValidationError|Array.<(string|ValidationError)>|Object<string,(string|ValidationError|Array.<(string|ValidationError)>))} error
 */
BaseForm.prototype.addError = function(field, error) {
  if (!(error instanceof ValidationError)) {
    // Normalise to ValidationError and let its constructor do the hard work of
    // making sense of the input.
    error = ValidationError(error)
  }

  if (object.hasOwn(error, 'errorObj')) {
    if (field !== null) {
      throw new Error("The argument 'field' must be null when the 'error' " +
                      'argument contains errors for multiple fields.')
    }
    error = error.errorObj
  }
  else {
    var errorList = error.errorList
    error = {}
    error[field || NON_FIELD_ERRORS] = errorList
  }

  var fields = Object.keys(error)
  for (var i = 0, l = fields.length; i < l; i++) {
    field = fields[i]
    errorList = error[field]
    if (!this._errors.hasField(field)) {
      if (field !== NON_FIELD_ERRORS && !object.hasOwn(this.fields, field)) {
        throw new Error(this._formName() + " has no field named '" + field + "'")
      }
      this._errors.set(field, new this.errorConstructor())
    }
    else {
      // Filter out any error messages which are duplicates of existing
      // messages. This can happen if onChange validation which uses addError()
      // is fired repeatedly and is adding an error message to a field other
      // then the one being changed.
      var messageLookup = object.lookup(this._errors.get(field).messages())
      var newMessages = ErrorList(errorList).messages()
      for (var j = errorList.length - 1; j >= 0; j--) {
        if (messageLookup[newMessages[j]]) {
          errorList.splice(j, 1)
        }
      }
    }

    if (errorList.length > 0) {
      this._errors.get(field).extend(errorList)
    }

    if (object.hasOwn(this.cleanedData, field)) {
      delete this.cleanedData[field]
    }
  }
}

/**
 * Getter for errors, which first cleans the form if there are no errors
 * defined yet.
 * @param {string=} name if given, errors for this field name will be returned
 *   instead of the full error object.
 * @return {ErrorObject|ErrorList} form or field errors
 */
BaseForm.prototype.errors = function(name) {
  if (this._errors === null) {
    this.fullClean()
  }
  if (name) {
    return this._errors.get(name)
  }
  return this._errors
}

/**
 * @return {ErrorObject} errors that aren't associated with a particular field -
 *   i.e., errors generated by clean(). Will be empty if there are none.
 */
BaseForm.prototype.nonFieldErrors = function() {
  return (this.errors(NON_FIELD_ERRORS) || new this.errorConstructor())
}

/**
 * Removes any validation errors present for the given form fields. If validation
 * has not been performed yet, initialises the errors object.
 * @param {Array.<string>} fields field names.
 */
BaseForm.prototype._removeErrors = function(fields) {
  if (this._errors === null) {
    this._errors = ErrorObject()
  }
  else {
    // TODO use clean.fields if available
    this._errors.remove(NON_FIELD_ERRORS)
    this._errors.removeAll(fields)
  }
}

// ================================================================= Changes ===

/**
 * Determines which fields have changed from initial form data.
 * @param {boolean=} _hasChangedCheck if true, the method is only being run to
 *   determine if any fields have changed, not to get the list of fields.
 * @return {Array.<string>|boolean} a list of changed field names or true if
 *   only checking for changes and one is found.
 */
BaseForm.prototype.changedData = function(_hasChangedCheck) {
  var changedData = []
  var initialValue
  // XXX: For now we're asking the individual fields whether or not
  // the data has changed. It would probably be more efficient to hash
  // the initial data, store it in a hidden field, and compare a hash
  // of the submitted data, but we'd need a way to easily get the
  // string value for a given field. Right now, that logic is embedded
  // in the render method of each field's widget.
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    var name = fieldNames[i]
    var field = this.fields[name]
    var prefixedName = this.addPrefix(name)
    var dataValue = field.widget.valueFromData(this.data, this.files, prefixedName)
    if (!field.showHiddenInitial) {
      initialValue = object.get(this.initial, name, field.initial)
      if (is.Function(initialValue)) {
        initialValue = initialValue()
      }
    }
    else {
      var initialPrefixedName = this.addInitialPrefix(name)
      var hiddenWidget = new field.hiddenWidget()
      try {
        initialValue = hiddenWidget.valueFromData(
                this.data, this.files, initialPrefixedName)
      }
      catch (e) {
        if (!(e instanceof ValidationError)) { throw e }
        // Always assume data has changed if validation fails
        if (_hasChangedCheck) {
          return true
        }
        changedData.push(name)
        continue
      }
    }
    if (field._hasChanged(initialValue, dataValue)) {
      if (_hasChangedCheck) {
        return true
      }
      changedData.push(name)
    }
  }
  if (_hasChangedCheck) {
    return false
  }
  return changedData
}

/**
 * @return {boolean} true if input data differs from initial data.
 */
BaseForm.prototype.hasChanged = function() {
  this._lastHasChanged = this.changedData(true)
  return this._lastHasChanged
}

// ================================================================== Status ===

/**
 * @return {boolean} true if the form needs a callback argument for final
 *   validation.
 */
BaseForm.prototype.isAsync = function() {
  if (this.clean.length == 1) { return true }
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    var customClean = this._getCustomClean(fieldNames[i])
    if (is.Function(customClean) && customClean.length == 1) {
      return true
    }
  }
  return false
}

/**
 * @return {boolean} true if all required fields have been completed.
 */
BaseForm.prototype.isComplete = function() {
  if (!this.isValid() || this.isPending()) {
    return false
  }
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l; i++) {
    var fieldName = fieldNames[i]
    if (this.fields[fieldName].required &&
        typeof this.cleanedData[fieldName] == 'undefined') {
      return false
    }
  }
  return true
}

/**
 * @return {boolean} true if the form needs to be multipart-encoded, in other
 *   words, if it has a FileField.
 */
BaseForm.prototype.isMultipart = function() {
  var fieldNames = Object.keys(this.fields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    if (this.fields[fieldNames[i]].widget.needsMultipartForm) {
      return true
    }
  }
  return false
}

/**
 * @return {boolean} true if the form is waiting for async validation to
 *   complete.
 */
BaseForm.prototype.isPending = function() {
  return !is.Empty(this._pendingAsyncValidation)
}

/**
 * @return {boolean} true if the form doesn't have any errors.
 */
BaseForm.prototype.isValid = function() {
  if (this.isInitialRender) {
    return false
  }
  return !this.errors().isPopulated()
}

/**
 * @return {boolean} true if the form is waiting for async validation of its
 *   clean() method to complete.
 */
BaseForm.prototype.nonFieldPending = function() {
  return typeof this._pendingAsyncValidation[NON_FIELD_ERRORS] != 'undefined'
}

/**
 * @return {boolean} true if this form is allowed to be empty and if input data
 *   differs from initial data. This can be used to determine when required
 *   fields in an extra FormSet form become truly required.
 */
BaseForm.prototype.notEmpty = function() {
  return (this.emptyPermitted && this._lastHasChanged === true)
}

// ================================================================ Prefixes ===

/**
 * Adds an initial prefix for checking dynamic initial values.
 * @param {string} fieldName a field name.
 * @return {string}
 */
BaseForm.prototype.addInitialPrefix = function(fieldName) {
  return 'initial-' + this.addPrefix(fieldName)
}

/**
 * Prepends a prefix to a field name if this form has one set.
 * @param {string} fieldName a form field name.
 * @return {string} the field name with a prefix prepended if this form has a
 *   prefix set, otherwise the field name as-is.
 * @return {string}
 */
BaseForm.prototype.addPrefix = function(fieldName) {
  if (this.prefix !== null) {
      return this.prefix + '-' + fieldName
  }
  return fieldName
}

/**
 * Returns the field with a prefix-size chunk chopped off the start if this
 * form has a prefix set and the field name starts with it.
 * @param {string} fieldName a field name.
 * @return {string}
 */
BaseForm.prototype.removePrefix = function(fieldName) {
  if (this.prefix !== null && fieldName.indexOf(this.prefix + '-' === 0)) {
      return fieldName.substring(this.prefix.length + 1)
  }
  return fieldName
}

/**
 * Creates a version of the given data object with prefixes removed from the
 * property names if this form has a prefix, otherwise returns the object
 * itself.
 * @param {object.<string,*>} data
 * @return {Object.<string,*>}
 */
BaseForm.prototype._deprefixData = function(data) {
  if (this.prefix === null) { return data }
  var prefixedData = {}
  var fieldNames = Object.keys(data)
  for (var i = 0, l = fieldNames.length; i < l; i++) {
    prefixedData[this.removePrefix(fieldNames[i])] = data[fieldNames[i]]
  }
  return prefixedData
}

/**
 * Creates a version of the given data object with prefixes added to the
 * property names if this form has a prefix, otherwise returns the object
 * itself.
 * @param {object.<string,*>} data
 * @return {Object.<string,*>}
 */
BaseForm.prototype._prefixData = function(data) {
  if (this.prefix === null) { return data }
  var prefixedData = {}
  var fieldNames = Object.keys(data)
  for (var i = 0, l = fieldNames.length; i < l; i++) {
    prefixedData[this.addPrefix(fieldNames[i])] = data[fieldNames[i]]
  }
  return prefixedData
}

// ======================================================= Default Rendering ===

/**
 * Default render method, which just calls asTable().
 * @return {Array.<ReactElement>}
 */
BaseForm.prototype.render = function() {
  return this.asTable()
}

/**
 * Renders the form's fields, validation messages, async busy indicators and
 * hidden fields as a list of <tr>s.
 * @return {Array.<ReactElement>}
 */
BaseForm.prototype.asTable = (function() {
  function normalRow(key, cssClasses, label, field, pending, helpText, errors, extraContent) {
    var contents = []
    if (errors) { contents.push(errors) }
    contents.push(field)
    if (pending) {
      contents.push(React.createElement('br', null))
      contents.push(pending)
    }
    if (helpText) {
      contents.push(React.createElement('br', null))
      contents.push(helpText)
    }
    if (extraContent) { contents.push.apply(contents, extraContent) }
    var rowAttrs = {key: key}
    if (cssClasses) { rowAttrs.className = cssClasses }
    return React.createElement('tr', rowAttrs
    , React.createElement('th', null, label)
    , React.createElement('td', null, contents)
    )
  }

  function errorRow(key, errors, extraContent, cssClasses) {
    var contents = []
    if (errors) { contents.push(errors) }
    if (extraContent) { contents.push.apply(contents, extraContent) }
    var rowAttrs = {key: key}
    if (cssClasses) { rowAttrs.className = cssClasses }
    return React.createElement('tr', rowAttrs
    , React.createElement('td', {colSpan: 2}, contents)
    )
  }

  return function() { return this._htmlOutput(normalRow, errorRow) }
})()

/**
 * Renders the form's fields, validation messages, async busy indicators and
 * hidden fields as a list of <li>s.
 * @return {Array.<ReactElement>}
 */
BaseForm.prototype.asUl = _singleElementRow(React.createFactory('li'))

/**
 * Renders the form's fields, validation messages, async busy indicators and
 * hidden fields as a list of <div>s.
 * @return {Array.<ReactElement>}
 */
BaseForm.prototype.asDiv = _singleElementRow(React.createFactory('div'))

/**
 * Helper function for outputting HTML.
 * @param {function} normalRow a function which produces a normal row.
 * @param {function} errorRow a function which produces an error row.
 * @return {Array.<ReactElement>}
 */
BaseForm.prototype._htmlOutput = function(normalRow, errorRow) {
  var bf
  var bfErrors
  var topErrors = this.nonFieldErrors() // Errors that should be displayed above all fields

  var hiddenFields = []
  var hiddenBoundFields = this.hiddenFields()
  for (var i = 0, l = hiddenBoundFields.length; i < l; i++) {
    bf = hiddenBoundFields[i]
    bfErrors = bf.errors()
    if (bfErrors.isPopulated) {
      topErrors.extend(bfErrors.messages().map(function(error) {
        return '(Hidden field ' + bf.name + ') ' + error
      }))
    }
    hiddenFields.push(bf.render())
  }

  var rows = []
  var errors
  var label
  var pending
  var helpText
  var extraContent
  var visibleBoundFields = this.visibleFields()
  for (i = 0, l = visibleBoundFields.length; i < l; i++) {
    bf = visibleBoundFields[i]
    bfErrors = bf.errors()

    // Variables which can be optional in each row
    errors = (bfErrors.isPopulated() ? bfErrors.render() : null)
    label = (bf.label ? bf.labelTag() : null)
    pending = (bf.isPending() ? React.createElement('progress', null, '...') : null)
    helpText = bf.helpText
    if (helpText) {
      helpText = ((is.Object(helpText) && object.hasOwn(helpText, '__html'))
                  ? React.createElement('span', {className: 'helpText', dangerouslySetInnerHTML: helpText})
                  : React.createElement('span', {className: 'helpText'}, helpText))
    }
    // If this is the last row, it should include any hidden fields
    extraContent = (i == l - 1 && hiddenFields.length > 0 ? hiddenFields : null)

    rows.push(normalRow(bf.htmlName,
                        bf.cssClasses(),
                        label,
                        bf.render(),
                        pending,
                        helpText,
                        errors,
                        extraContent))
  }

  if (topErrors.isPopulated()) {
    // Add hidden fields to the top error row if it's being displayed and
    // there are no other rows.
    extraContent = (hiddenFields.length > 0 && rows.length === 0 ? hiddenFields : null)
    rows.unshift(errorRow(this.addPrefix(NON_FIELD_ERRORS),
                          topErrors.render(),
                          extraContent,
                          this.errorRowCssClass))
  }

  // Put a cross-field pending indicator in its own row
  if (this.nonFieldPending()) {
    extraContent = (hiddenFields.length > 0 && rows.length === 0 ? hiddenFields : null)
    rows.push(errorRow(this.addPrefix('__pending__'),
                       React.createElement('progress', null, '...'),
                       extraContent,
                       this.pendingRowCssClass))
  }

  // Put hidden fields in their own row if there were no rows to display.
  if (hiddenFields.length > 0 && rows.length === 0) {
    rows.push(errorRow(this.addPrefix('__hiddenFields__'),
                       null,
                       hiddenFields,
                       this.hiddenFieldRowCssClass))
  }

  return rows
}

function _normalRow(reactEl, key, cssClasses, label, field, pending, helpText, errors, extraContent) {
  var rowAttrs = {key: key}
  if (cssClasses) { rowAttrs.className = cssClasses }
  var contents = [rowAttrs]
  if (errors) { contents.push(errors) }
  if (label) { contents.push(label) }
  contents.push(' ')
  contents.push(field)
  if (pending) {
    contents.push(' ')
    contents.push(pending)
  }
  if (helpText) {
    contents.push(' ')
    contents.push(helpText)
  }
  if (extraContent) { contents.push.apply(contents, extraContent) }
  return reactEl.apply(null, contents)
}

function _errorRow(reactEl, key, errors, extraContent, cssClasses) {
  var rowAttrs = {key: key}
  if (cssClasses) { rowAttrs.className = cssClasses }
  var contents = [rowAttrs]
  if (errors) { contents.push(errors) }
  if (extraContent) { contents.push.apply(contents, extraContent) }
  return reactEl.apply(null, contents)
}

function _singleElementRow(reactEl) {
  var normalRow = _normalRow.bind(null, reactEl)
  var errorRow = _errorRow.bind(null, reactEl)
  return function() {
    return this._htmlOutput(normalRow, errorRow)
  }
}

/**
 * Meta function for handling declarative fields and inheriting fields from
 * forms further up the inheritance chain or being explicitly mixed-in, which
 * sets up baseFields and declaredFields on a new Form constructor's prototype.
 * @param {object.<string,*>} prototypeProps
 * @param {object.<string,*>=} constructorProps
 */
function DeclarativeFieldsMeta(prototypeProps, constructorProps) {
  // Pop Fields instances from prototypeProps to build up the new form's own
  // declaredFields.
  var fields = []
  Object.keys(prototypeProps).forEach(function(name) {
    if (prototypeProps[name] instanceof Field) {
      fields.push([name, prototypeProps[name]])
      delete prototypeProps[name]
    }
  })
  fields.sort(function(a, b) {
    return a[1].creationCounter - b[1].creationCounter
  })
  prototypeProps.declaredFields = object.fromItems(fields)

  // Build up final declaredFields from the form being extended, forms being
  // mixed in and the new form's own declaredFields, in that order of
  // precedence.
  var declaredFields = {}

  // If we're extending another form, we don't need to check for shadowed
  // fields, as it's at the bottom of the pile for inheriting declaredFields.
  if (object.hasOwn(this, 'declaredFields')) {
    object.extend(declaredFields, this.declaredFields)
  }

  // If any mixins which look like Form constructors were given, inherit their
  // declaredFields and check for shadowed fields.
  if (object.hasOwn(prototypeProps, '__mixins__')) {
    var mixins = prototypeProps.__mixins__
    if (!is.Array(mixins)) { mixins = [mixins] }
    // Process mixins from left-to-right, the same precedence they'll get for
    // having their prototype properties mixed in.
    for (var i = 0, l = mixins.length; i < l; i++) {
      var mixin = mixins[i]
      if (is.Function(mixin) && object.hasOwn(mixin.prototype, 'declaredFields')) {
        // Extend mixed-in declaredFields over the top of what's already there,
        // then delete any fields which have been shadowed by a non-Field
        // property in its prototype.
        object.extend(declaredFields, mixin.prototype.declaredFields)
        Object.keys(mixin.prototype).forEach(function(name) {
          if (object.hasOwn(declaredFields, name)) {
            delete declaredFields[name]
          }
        })
        // To avoid overwriting the new form's baseFields, declaredFields or
        // constructor when the rest of the mixin's prototype is mixed-in by
        // Concur, replace the mixin with an object containing only its other
        // prototype properties.
        var mixinPrototype = object.extend({}, mixin.prototype)
        delete mixinPrototype.baseFields
        delete mixinPrototype.declaredFields
        delete mixinPrototype.constructor
        mixins[i] = mixinPrototype
      }
    }
    // We may have wrapped a single mixin in an Array - assign it back to the
    // new form's prototype for processing by Concur.
    prototypeProps.__mixins__ = mixins
  }

  // Finally - extend the new form's own declaredFields over the top of
  // declaredFields being inherited, then delete any fields which have been
  // shadowed by a non-Field property in its prototype.
  object.extend(declaredFields, prototypeProps.declaredFields)
  Object.keys(prototypeProps).forEach(function(name) {
    if (object.hasOwn(declaredFields, name)) {
      delete declaredFields[name]
    }
  })

  prototypeProps.baseFields = declaredFields
  prototypeProps.declaredFields = declaredFields

  // If a clean method is specified as [field1, field2, ..., cleanFunction],
  // replace it with the clean function and attach the field names to the
  // function.
  if (object.hasOwn(prototypeProps, 'clean') && is.Array(prototypeProps.clean)) {
    var clean = prototypeProps.clean.pop()
    clean.fields = object.lookup(prototypeProps.clean)
    prototypeProps.clean = clean
  }
}

/**
 * Base constructor which acts as the user API for creating new form
 * constructors, extending BaseForm and registering DeclarativeFieldsMeta as
 * its __meta__ function to handle setting up new form constructor prototypes.
 * @constructor
 */
var Form = BaseForm.extend({
  __meta__: DeclarativeFieldsMeta
, constructor: function Form() {
    BaseForm.apply(this, arguments)
  }
})

function isFormAsync(constructor) {
  var proto = constructor.prototype
  if (proto.clean.length == 1) { return true }
  var fieldNames = Object.keys(proto.baseFields)
  for (var i = 0, l = fieldNames.length; i < l ; i++) {
    var customClean = proto._getCustomClean(fieldNames[i])
    if (is.Function(customClean) && customClean.length == 1) {
      return true
    }
  }
  return false
}

module.exports = {
  NON_FIELD_ERRORS: NON_FIELD_ERRORS
, BaseForm: BaseForm
, DeclarativeFieldsMeta: DeclarativeFieldsMeta
, Form: Form
, isFormAsync: isFormAsync
}
