'use strict';

var Concur = require('Concur')
var is = require('isomorph/is')
var format = require('isomorph/format').formatObj
var object = require('isomorph/object')
var copy = require('isomorph/copy')
var validators = require('validators')
var React = require('react')

var env = require('./env')
var util = require('./util')
var fields = require('./fields')
var widgets = require('./widgets')

var ErrorList = util.ErrorList
var ErrorObject = util.ErrorObject
var ValidationError = validators.ValidationError
var Field = fields.Field
var FileField = fields.FileField
var Textarea = widgets.Textarea
var TextInput = widgets.TextInput

/** Property under which non-field-specific errors are stored. */
var NON_FIELD_ERRORS = '__all__'

/**
 * A field and its associated data.
 * @param {Form} form a form.
 * @param {Field} field one of the form's fields.
 * @param {String} name the name under which the field is held in the form.
 * @constructor
 */
var BoundField = Concur.extend({
  constructor: function BoundField(form, field, name) {
    if (!(this instanceof BoundField)) { return new BoundField(form, field, name) }
    this.form = form
    this.field = field
    this.name = name
    this.htmlName = form.addPrefix(name)
    this.htmlInitialName = form.addInitialPrefix(name)
    this.htmlInitialId = form.addInitialPrefix(this.autoId())
    this.label = this.field.label !== null ? this.field.label : util.prettyName(name)
    this.helpText = field.helpText || ''
  }
})

BoundField.prototype.errors = function() {
  return this.form.errors(this.name) || new this.form.errorConstructor()
}

BoundField.prototype.isHidden = function() {
  return this.field.widget.isHidden
}

/**
 * Calculates and returns the id attribute for this BoundField if the associated
 * form has an autoId. Returns an empty string otherwise.
 */
BoundField.prototype.autoId = function() {
  var autoId = this.form.autoId
  if (autoId) {
    autoId = ''+autoId
    if (autoId.indexOf('{name}') != -1) {
      return format(autoId, {name: this.htmlName})
    }
    return this.htmlName
  }
  return ''
}

/**
 * Returns the data for this BoundFIeld, or null if it wasn't given.
 */
BoundField.prototype.data = function() {
  return this.field.widget.valueFromData(this.form.data,
                                         this.form.files,
                                         this.htmlName)
}

/**
 * Wrapper around the field widget's idForLabel method. Useful, for example, for
 * focusing on this field regardless of whether it has a single widget or a
 * MutiWidget.
 */
BoundField.prototype.idForLabel = function() {
  var widget = this.field.widget
  var id = object.get(widget.attrs, 'id', this.autoId())
  return widget.idForLabel(id)
}

BoundField.prototype.render = function(kwargs) {
  if (this.field.showHiddenInitial) {
    return React.DOM.div(null, this.asWidget(kwargs),
                         this.asHidden({onlyInitial: true}))
  }
  return this.asWidget(kwargs)
}

/**
 * Returns a list of SubWidgets that comprise all widgets in this BoundField.
 * This really is only useful for RadioSelect and CheckboxSelectMultiple
 * widgets, so that you can iterate over individual inputs when rendering.
 */
BoundField.prototype.subWidgets = function() {
  var id = this.field.widget.attrs.id || this.autoId()
  var kwargs = {attrs: {}}
  if (id) {
    kwargs.attrs.id = id
  }
  return this.field.widget.subWidgets(this.htmlName, this.value(), kwargs)
}

/**
 * Renders a widget for the field.
 * @param {Object} [kwargs] configuration options
 * @config {Widget} [widget] an override for the widget used to render the field
 *   - if not provided, the field's configured widget will be used
 * @config {Object} [attrs] additional attributes to be added to the field's widget.
 */
BoundField.prototype.asWidget = function(kwargs) {
  kwargs = object.extend({
    widget: null, attrs: null, onlyInitial: false
  }, kwargs)
  var widget = (kwargs.widget !== null ? kwargs.widget : this.field.widget)
  var attrs = (kwargs.attrs !== null ? kwargs.attrs : {})
  var autoId = this.autoId()
  var name = !kwargs.onlyInitial ? this.htmlName : this.htmlInitialName
  if (autoId &&
      typeof attrs.id == 'undefined' &&
      typeof widget.attrs.id == 'undefined') {
    attrs.id = (!kwargs.onlyInitial ? autoId : this.htmlInitialId)
  }
  if (typeof attrs.key == 'undefined') {
    attrs.key = name
  }
  var controlled = this.controlled(widget)
  var validation = this.validation(widget)

  // Add an onChange event handler to update form.data when the field is changed
  // if it's controlled or uses interactive validation.
  if (controlled || validation != 'manual') {
    attrs.onChange =
      util.bindRight(this.form._handleFieldChange, this.form, validation)
  }

  // If validation should happen on an event other than onChange, also add an
  // event handler for it.
  if (validation != 'manual' && validation.event != 'onChange') {
    attrs[validation.event] =
      util.bindRight(this.form._handleFieldValidation, this.form, validation)
  }

  var renderKwargs = {attrs: attrs, controlled: controlled}
  if (widget.needsInitialValue) {
    renderKwargs.initialValue = this.initialValue()
  }
  return widget.render(name, this.value(), renderKwargs)
}

/**
 * Determines if the widget should be a controlled or uncontrolled React
 * component.
 */
BoundField.prototype.controlled = function(widget) {
  if (arguments.length === 0) {
    widget = this.field.widget
  }
  var controlled = false
  if (widget.isValueSettable) {
    // If the field has any controlled config set, it should take precedence,
    // otherwise use the form's as it has a default.
    controlled = (this.field.controlled !== null
                  ? this.field.controlled
                  : this.form.controlled)
  }
  return controlled
}

/**
 * Gets the configured validation for the field or form, allowing the widget
 * which is going to be rendered to override it if necessary.
 */
BoundField.prototype.validation = function(widget) {
  if (arguments.length === 0) {
    widget = this.field.widget
  }
  // If the field has any validation config set, it should take precedence,
  // otherwise use the form's as it has a default.
  var validation = this.field.validation || this.form.validation
  // Allow widgets to override the type of validation that's used for them -
  // primarily for inputs which can only be changed by click/selection.
  if (validation != 'manual' && widget.validation !== null) {
    validation = widget.validation
  }
  return validation
}

/**
 * Renders the field as a text input.
 * @param {Object} [kwargs] widget options.
 */
BoundField.prototype.asText = function(kwargs) {
  kwargs = object.extend({}, kwargs, {widget: TextInput()})
  return this.asWidget(kwargs)
}

/**
 * Renders the field as a textarea.
 * @param {Object} [kwargs] widget options.
 */
BoundField.prototype.asTextarea = function(kwargs) {
  kwargs = object.extend({}, kwargs, {widget: Textarea()})
  return this.asWidget(kwargs)
}

/**
 * Renders the field as a hidden field.
 * @param {Object} [kwargs] widget options.
 */
BoundField.prototype.asHidden = function(kwargs) {
  kwargs = object.extend({}, kwargs, {widget: new this.field.hiddenWidget()})
  return this.asWidget(kwargs)
}

/**
 * Returns the value to be displayed for this BoundField, using the initia
 * value if the form is not bound or the data otherwise.
 */
BoundField.prototype.value = function() {
  var data
  if (!this.form.isBound) {
    data = this.initialValue()
  }
  else {
    data = this.field.boundData(this.data(),
                                object.get(this.form.initial,
                                           this.name,
                                           this.field.initial))
  }
  return this.field.prepareValue(data)
}

/**
 * Returns the initial value for this BoundField from the form or field's
 * configured initial values - the field's default initial value of null will
 * be returned if none was configured.
 */
BoundField.prototype.initialValue = function() {
  var value = object.get(this.form.initial, this.name, this.field.initial)
  if (is.Function(value)) {
    value = value()
  }
  return value
}

BoundField.prototype._addLabelSuffix = function(label, labelSuffix) {
  // Only add the suffix if the label does not end in punctuation
  if (labelSuffix && ':?.!'.indexOf(label.charAt(label.length - 1)) == -1) {
    return label + labelSuffix
  }
  return label
}

/**
 * Wraps the given contents in a <label> if the field has an id attribute. If
 * contents aren't given, uses the field's label.
 *
 * If attrs are given, they're used as HTML attributes on the <label> tag.
 *
 * @param {Object} [kwargs] configuration options.
 * @config {String} [contents] contents for the label - if not provided, label
 *                             contents will be generated from the field itself.
 * @config {Object} [attrs] additional attributes to be added to the label.
 * @config {String} [labelSuffix] allows overriding the form's labelSuffix.
 */
BoundField.prototype.labelTag = function(kwargs) {
  kwargs = object.extend({
    contents: this.label, attrs: null, labelSuffix: this.form.labelSuffix
  }, kwargs)
  var contents = this._addLabelSuffix(kwargs.contents, kwargs.labelSuffix)
  var widget = this.field.widget
  var id = object.get(widget.attrs, 'id', this.autoId())
  if (id) {
    var attrs = object.extend(kwargs.attrs || {}, {htmlFor: widget.idForLabel(id)})
    contents = React.DOM.label(attrs, contents)
  }
  return contents
}

/**
 * Puts together additional CSS classes for this field based on the field, the
 * form and whether or not the field has errors.
 * @param {string=} extra CSS classes for the field.
 * @return {string} space-separated CSS classes for this field.
 */
BoundField.prototype.cssClasses = function(extraCssClasses) {
  var cssClasses = extraCssClasses ? [extraCssClasses] : []
  if (this.field.cssClass !== null) {
    cssClasses.push(this.field.cssClass)
  }
  if (typeof this.form.rowCssClass != 'undefined') {
    cssClasses.push(this.form.rowCssClass)
  }
  if (this.errors().isPopulated() &&
      typeof this.form.errorCssClass != 'undefined') {
    cssClasses.push(this.form.errorCssClass)
  }
  if (this.field.required &&
     typeof this.form.requiredCssClass != 'undefined') {
    cssClasses.push(this.form.requiredCssClass)
  }
  return cssClasses.join(' ')
}

/**
 * A collection of Fields that knows how to validate and display itself.
 * @constructor
 * @param {Object}
 */
var BaseForm = Concur.extend({
  constructor: function BaseForm(kwargs) {
    kwargs = object.extend({
      data: null, files: null, autoId: 'id_{name}', prefix: null,
      initial: null, errorConstructor: ErrorList, labelSuffix: ':',
      emptyPermitted: false, validation: 'manual', controlled: false,
      onStateChange: null
    }, kwargs)
    this.isBound = (kwargs.data !== null || kwargs.files !== null)
    this.data = kwargs.data || {}
    this.files = kwargs.files || {}
    this.autoId = kwargs.autoId
    this.prefix = kwargs.prefix
    this.initial = kwargs.initial || {}
    this.errorConstructor = kwargs.errorConstructor
    this.labelSuffix = kwargs.labelSuffix
    this.emptyPermitted = kwargs.emptyPermitted
    this.validation = kwargs.validation
    this.controlled = kwargs.controlled
    this.onStateChange = kwargs.onStateChange

    // Normalise validation config to an object if it's not set to manual
    if (is.String(this.validation) && this.validation != 'manual') {
      this.validation = (this.validation == 'auto'
                         ? {event: 'onChange', delay: 250}
                         : {event: this.validation})
    }

    this._errors = null
    this._changedData = null
    this._pendingFieldValidation = {} // Pending field validation functions

    // The baseFields attribute is the *prototype-wide* definition of fields.
    // Because a particular *instance* might want to alter this.fields, we
    // create this.fields here by deep copying baseFields. Instances should
    // always modify this.fields; they should not modify baseFields.
    this.fields = copy.deepCopy(this.baseFields)

    // Now that form.fields exists, we can check if there's any configuration
    // which *needs* onStateChange on the form or its fields.
    if (this._needsOnStateChange()) {
      if (!is.Function(kwargs.onStateChange)) {
        throw new Error(
          'Forms must be given an onStateChange callback when they, or any of ' +
          'their fields, are controlled or use interactive validation.')
      }
      // isBound will flip to true as soon as the first field is validated. At
      // that point, rendering will flip to using form.data as its source, so
      // ensure data has a copy of any initial data that's been configured.
      if (!this.isBound) {
        var initialData = object.extend(this._fieldInitialData(), this.initial)
        var initialFields = Object.keys(initialData)
        for (var i = 0, l = initialFields.length; i < l; i++) {
          var fieldName = initialFields[i]
          if (typeof this.fields[fieldName] == 'undefined') { continue }
          // Don't copy initial to input data for fields which can't have the
          // initial data set as their current value.
          if (!this.fields[fieldName].widget.isValueSettable) { continue }
          this.data[this.addPrefix(fieldName)] = initialData[fieldName]
        }
      }
    }
  }
})

// ========================================================= Data mutability ===

/**
 * Resets validation state, replaces the form's input data (and flips its bound
 * flag if necessary) and revalidates, returning the result of isValid().
 * @param {Object.<string,*>} data new input data for the form.
 * @retun {boolean} true if the new data is valid.
 */
BaseForm.prototype.setData = function(data, kwargs) {
  kwargs = object.extend({prefixed: false}, kwargs)
  this._errors = null
  this._changedData = null
  this.data = (kwargs.prefixed ? data : this._prefixData(data))
  if (!this.isBound) {
    this.isBound = true
  }
  // This call ultimately triggers a fullClean() because _errors is null
  var isValid = this.isValid()
  if (typeof this.onStateChange == 'function') {
    this.onStateChange()
  }
  return isValid
}

/**
 * Updates some of the form's input data, then optionally triggers validation of
 * updated fields and form-wide cleaning, or clears existing errors from the
 * updated fields.
 * @param {Object.<string,*>} data updated input data for the form.
 * @param {Object.<string,boolean>} kwargs update options.
 */
BaseForm.prototype.updateData = function(data, kwargs) {
  kwargs = object.extend({prefixed: false, validate: true, clearValidation: true}, kwargs)
  this._changedData = null
  object.extend(this.data, (kwargs.prefixed ? data : this._prefixData(data)))
  if (!this.isBound) {
    this.isBound = true
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

  if (typeof this.onStateChange == 'function') {
    this.onStateChange()
  }
}

/**
 * Validates the given HTML form's data.
 * @param form the <form> containing this form's rendered widgets.
 * @return {boolean} true if the form's data is valid.
 */
BaseForm.prototype.validate = function(form) {
  if (form && typeof form.getDOMNode == 'function') {
    form = form.getDOMNode()
  }
  var data = util.formData(form)
  return this.setData(data, {prefixed: true})
}

/**
 * Removes any cleanedData present for the given form fields.
 * @param {Array.<string>} form field names.
 */
BaseForm.prototype._removeCleanedData = function(fields) {
  if (typeof this.cleanedData == 'undefined') { return }
  for (var i = 0, l = fields.length; i < l; i++) {
    delete this.cleanedData[fields[i]]
  }
}

// ======================================================= BoundField access ===

/**
 * Creates a BoundField for the field with the given name.
 * @param {string} name a field name.
 * @return {BoundField} a BoundField for the field.
 */
BaseForm.prototype.boundField = function(name) {
  if (!object.hasOwn(this.fields, name)) {
    throw new Error("Form does not have a '" + name + "' field.")
  }
  return BoundField(this, this.fields[name], name)
}

/**
 * Creates a BoundField for each field in the form, in the order in which the
 * fields were created.
 * @param {function(Field,string)=} test if provided, this function will be
 *   called with field and name arguments - BoundFields will only be generated
 *   for fields for which true is returned.
 * @return {Array.<BoundField>} a list of BoundField objects.
 */
BaseForm.prototype.boundFields = function(test) {
  test = test || function() { return true }

  var fields = []
  for (var name in this.fields) {
    if (object.hasOwn(this.fields, name) &&
        test(this.fields[name], name) === true) {
      fields.push(BoundField(this, this.fields[name], name))
    }
  }
  return fields
}

/**
 * Like boundFields, but returns a name -> BoundField object instead.
 * @param {function(Field,string)=} test
 * @type {Object.<string,BoundField>}
 */
BaseForm.prototype.boundFieldsObj = function(test) {
  test = test || function() { return true }

  var fields = {}
  for (var name in this.fields) {
    if (object.hasOwn(this.fields, name) &&
        test(this.fields[name], name) === true) {
      fields[name] = BoundField(this, this.fields[name], name)
    }
  }
  return fields
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
    this._errors.get(field).extend(errorList)
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
 * @return {(ErrorObject|ErrorList)} form or field errors
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
 * Determines whether or not the form has errors.
 * @return {boolean}
 */
BaseForm.prototype.isValid = function() {
  if (!this.isBound) {
    return false
  }
  return !this.errors().isPopulated()
}

/**
 * Returns errors that aren't associated with a particular field.
 * @return {ErrorObject} errors that aren't associated with a particular field -
 *   i.e., errors generated by clean(). Will be empty if there are none.
 */
BaseForm.prototype.nonFieldErrors = function() {
  return (this.errors(NON_FIELD_ERRORS) || new this.errorConstructor())
}

// ================================================================= Changes ===

/**
 * Determines which fields have changed from initial form data.
 * @return {Array.<string>} a list of changed field names.
 */
BaseForm.prototype.changedData = function() {
  if (!env.browser && this._changedData != null) { return this._changedData }
  var changedData = []
  var initialValue
  // XXX: For now we're asking the individual fields whether or not
  // the data has changed. It would probably be more efficient to hash
  // the initial data, store it in a hidden field, and compare a hash
  // of the submitted data, but we'd need a way to easily get the
  // string value for a given field. Right now, that logic is embedded
  // in the render method of each field's widget.
  for (var name in this.fields) {
    if (!object.hasOwn(this.fields, name)) { continue }
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
        changedData.push(name)
        continue
      }
    }
    if (field._hasChanged(initialValue, dataValue)) {
      changedData.push(name)
    }
  }
  if (!env.browser) { this._changedData = changedData }
  return changedData
}

/**
 * @return {boolean} true if input data differs from initial data.
 */
BaseForm.prototype.hasChanged = function() {
  return (this.changedData().length > 0)
}

// ============================================================ Misc. public ===

/**
 * @return {boolean} true if the form needs to be multipart-encoded, in other
 *   words, if it has a FileField.
 */
BaseForm.prototype.isMultipart = function() {
  for (var name in this.fields) {
    if (object.hasOwn(this.fields, name) &&
        this.fields[name].widget.needsMultipartForm) {
      return true
    }
  }
  return false
}

// =============================================== Validation implementation ===

/**
 * Hook for doing any extra form-wide cleaning after each Field's clean() has
 * been called. Any ValidationError raised by this method will not be associated
 * with a particular field; it will have a special-case association with the
 * field named '__all__'.
 * If this function returns anything, it will replace the form's cleanedData.
 * @return {(Object.<string,*>|undefined)} validated, cleaned data (optionally)
 */
BaseForm.prototype.clean = function() {
  return this.cleanedData
}

/**
 * Cleans data for all fields and triggers cross-form cleaning.
 */
BaseForm.prototype.fullClean = function() {
  this._errors = ErrorObject()
  if (!this.isBound) {
    return // Stop further processing
  }

  this.cleanedData = {}

  // If the form is permitted to be empty, and none of the form data has
  // changed from the initial data, short circuit any validation.
  if (this.emptyPermitted && !this.hasChanged()) {
    return
  }

  this._cleanFields()
  this._cleanForm()
  this._postClean()
}

/**
 * Cleans data for the given field names and triggers cross-form cleaning in
 * case any cleanedData it uses has changed.
 * @param {Array.<string>} fields field names.
 */
BaseForm.prototype.partialClean = function(fields) {
  this._removeErrors(fields)
  if (typeof this.cleanedData == 'undefined') {
    this.cleanedData = {}
  }

  // If the form is permitted to be empty, and none of the form data has
  // changed from the initial data, short circuit any validation.
  if (this.emptyPermitted && !this.hasChanged()) {
    return
  }

  for (var i = 0, l = fields.length; i < l; i++) {
    this._cleanField(fields[i])
  }
  this._cleanForm()
}

/**
 * Validates and cleans the named field and calls any custom validation function
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
  try {
    if (field instanceof FileField) {
      var initial = object.get(this.initial, name, field.initial)
      value = field.clean(value, initial)
    }
    else {
      value = field.clean(value)
    }
    this.cleanedData[name] = value

    // Try cleanName
    var customClean = 'clean' + name.charAt(0).toUpperCase() + name.substr(1)
    if (typeof this[customClean] != 'undefined' &&
        is.Function(this[customClean])) {
      value = this[customClean]()
      if (typeof value != 'undefined') {
        this.cleanedData[name] = value
      }
    }
    else {
      // Otherwise, try clean_name
      customClean = 'clean_' + name
      if (typeof this[customClean] != 'undefined' &&
          is.Function(this[customClean])) {
        value = this[customClean]()
        if (typeof value != 'undefined') {
          this.cleanedData[name] = value
        }
      }
    }
  }
  catch (e) {
    if (!(e instanceof ValidationError)) {
      throw e
    }
    this.addError(name, e)
  }
}

/**
 * Validates and cleans every field in the form.
 */
BaseForm.prototype._cleanFields = function() {
  for (var name in this.fields) {
    if (object.hasOwn(this.fields, name)) {
      this._cleanField(name)
    }
  }
}

/**
 * Calls the clean() hook and handles its result any any error thrown by it.
 */
BaseForm.prototype._cleanForm = function() {
  var cleanedData
  try {
    cleanedData = this.clean()
  }
  catch (e) {
    if (!(e instanceof ValidationError)) {
      throw e
    }
    this.addError(null, e)
  }
  if (cleanedData) {
    this.cleanedData = cleanedData
  }
}

/**
 * An internal hook for performing additional cleaning after form cleaning is
 * complete.
 */
BaseForm.prototype._postClean = function() {}

/**
 * Removes any validation errors present for the given form fields. If validation
 * has not been performed yet, initialises
 * @param {Array.<string>} form field names.
 */
BaseForm.prototype._removeErrors = function(fields) {
  if (this._errors === null) {
    this._errors = ErrorObject()
  }
  else {
    this._errors.remove(NON_FIELD_ERRORS)
    this._errors.removeAll(fields)
  }
}

// ==================================== onChange & validation event handling ===

/**
 * This will always be hooked up to a wiget's onChange to ensure form.data is
 * kept up-to-date. Since we're here anyway, we can deal with onChange
 * validation too.
 */
BaseForm.prototype._handleFieldChange = function(e, validation) {
  // Get the data from the form element(s) in the DOM
  var htmlName = e.target.name
  var data = util.fieldData(e.target.form, htmlName)

  // Keep data up-to-date
  if (!this.isBound) {
    this.isBound = true
  }
  this.data[htmlName] = data
  this.onStateChange()

  // If we should be validating now, do so
  if (validation.event == 'onChange') {
    this._handleFieldValidation(e, validation)
  }
}

/**
 * Handles validating the field which is the target of the given event based
 * on its validation config. This will be hooked up to the appropriate event
 * as per the field's validation config. React special cases onChange to ensure
 * the controlled value is kept up to date, so we should be sure that the date
 * we'll be validating against is current.
 */
BaseForm.prototype._handleFieldValidation = function(e, validation) {
  // Special case for fields whose widget names aren't the same as their form
  // field name.
  var field = this.removePrefix(e.target.getAttribute('data-newforms-field') ||
                                e.target.name)
  if (validation.delay) {
    this._delayedFieldValidation(field, validation.delay)
  }
  else {
    this._immediateFieldValidation(field)
  }
}

/**
 * Validates a single field and notifies the React component that state has
 * changed.
 */
BaseForm.prototype._immediateFieldValidation = function(field) {
  this.partialClean([field])
  this.onStateChange()
}

/**
 * Sets up delayed validation of a single field with a debounced function and
 * calls it, or just calls the function again if it already exists to reset the
 * delay.
 */
BaseForm.prototype._delayedFieldValidation = function(field, delay) {
  if (!is.Function(this._pendingFieldValidation[field])) {
    this._pendingFieldValidation[field] = util.debounce(function() {
      delete this._pendingFieldValidation[field]
      this._immediateFieldValidation(field)
    }.bind(this), delay)
  }
  this._pendingFieldValidation[field]()
}

// ================================================================ Prefixes ===

/**
 * Adds an initial prefix for checking dynamic initial values.
 */
BaseForm.prototype.addInitialPrefix = function(fieldName) {
  return 'initial-' + this.addPrefix(fieldName)
}

/**
 * Prepends a prefix to a field name if this form has one set.
 * @param {string} fieldName a form field name.
 * @return {string} the field name with a prefix prepended if this form has a
 *   prefix set, otherwise the field name as-is.
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
 */
BaseForm.prototype.removePrefix = function(fieldName) {
  if (this.prefix !== null && fieldName.indexOf(this.prefix === 0)) {
      return fieldName.substring(this.prefix.length + 1)
  }
  return fieldName
}

// ========================================================= Misc. internals ===

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
 * Tries to construct a display name for the form for display im error messages.
 * @type {string}
 */
BaseForm.prototype._formName = function() {
  return (this.constructor.name ? "'" + this.constructor.name + "'" : 'Form')
}

/**
 * @return {boolean} true if the form or any of its fields have interactive
 *   validation configured, or are configured to generate controlled components.
 */
BaseForm.prototype._needsOnStateChange = function() {
  if (this.validation !== 'manual' || this.controlled === true) { return true }
  for (var name in this.fields) {
    if (!object.hasOwn(this.fields, name)) { continue }
    var field = this.fields[name]
    if (field.controlled === true || (field.validation !== null &&
                                      field.validation !== 'manual')) {
      return true
    }
  }
  return false
}

/**
 * Return a version of the given data object with prefixes added to the property
 * names if this form has a prefix, otherwise returns the object itself.
 * @param {Object.<string,*>} data
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

/**
 * Returns the raw value for a particular field name. This is just a convenient
 * wrapper around widget.valueFromData.
 * @param {?string} fieldName the name of a form field.
 */
BaseForm.prototype._rawValue = function(fieldName) {
  var field = this.fields[fieldName]
  var prefix = this.addPrefix(fieldName)
  return field.widget.valueFromData(this.data, this.files, prefix)
}

// ======================================================= Default rendering ===

BaseForm.prototype.render = function() {
  return this.asTable()
}

/**
 * Returns this form rendered as HTML <tr>s - excluding the <table>.
 */
BaseForm.prototype.asTable = (function() {
  function normalRow(key, cssClasses, label, field, helpText, errors, extraContent) {
    var contents = []
    if (errors) { contents.push(errors) }
    contents.push(field)
    if (helpText) {
      contents.push(React.DOM.br(null))
      contents.push(helpText)
    }
    if (extraContent) { contents.push.apply(contents, extraContent) }
    var rowAttrs = {key: key}
    if (cssClasses) { rowAttrs.className = cssClasses }
    return React.DOM.tr(rowAttrs
    , React.DOM.th(null, label)
    , React.DOM.td(null, contents)
    )
  }

  function errorRow(key, errors, extraContent, cssClasses) {
    var contents = []
    if (errors) { contents.push(errors) }
    if (extraContent) { contents.push.apply(contents, extraContent) }
    var rowAttrs = {key: key}
    if (cssClasses) { rowAttrs.className = cssClasses }
    return React.DOM.tr(rowAttrs
    , React.DOM.td({colSpan: 2}, contents)
    )
  }

  return function() { return this._htmlOutput(normalRow, errorRow) }
})()

/**
 * Returns this form rendered as HTML <li>s - excluding the <ul>.
 */
BaseForm.prototype.asUl = _singleElementRow(React.DOM.li)

/**
 * Returns this form rendered as HTML <div>s.
 */
BaseForm.prototype.asDiv = _singleElementRow(React.DOM.div)

/**
 * Helper function for outputting HTML.
 * @param {Function} normalRow a function which produces a normal row.
 * @param {Function} errorRow a function which produces an error row.
 * @return a list of React.DOM components representing rows.
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
  var helpText
  var extraContent
  var visibleBoundFields = this.visibleFields()
  for (i = 0, l = visibleBoundFields.length; i < l; i++) {
    bf = visibleBoundFields[i]
    bfErrors = bf.errors()

    // Variables which can be optional in each row
    errors = (bfErrors.isPopulated() ? bfErrors.render() : null)
    label = (bf.label ? bf.labelTag() : null)
    helpText = bf.helpText
    if (helpText) {
      helpText = ((is.Object(helpText) && object.hasOwn(helpText, '__html'))
                  ? React.DOM.span({className: 'helpText', dangerouslySetInnerHTML: helpText})
                  : React.DOM.span({className: 'helpText'}, helpText))
    }
    // If this is the last row, it should include any hidden fields
    extraContent = (i == l - 1 && hiddenFields.length > 0 ? hiddenFields : null)

    rows.push(normalRow(bf.htmlName,
                        bf.cssClasses(),
                        label,
                        bf.render(),
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
                          extraContent))
  }

  // Put hidden fields in their own error row if there were no rows to
  // display.
  if (hiddenFields.length > 0 && rows.length === 0) {
    rows.push(errorRow(this.addPrefix('__hiddenFields__'),
                       null,
                       hiddenFields,
                       this.hiddenFieldRowCssClass))
  }

  return rows
}

function _normalRow(reactEl, key, cssClasses, label, field, helpText, errors, extraContent) {
  var rowAttrs = {key: key}
  if (cssClasses) { rowAttrs.className = cssClasses }
  var contents = [rowAttrs]
  if (errors) { contents.push(errors) }
  if (label) { contents.push(label) }
  contents.push(' ')
  contents.push(field)
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
  if (object.hasOwn(prototypeProps, '__mixin__')) {
    var mixins = prototypeProps.__mixin__
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
    prototypeProps.__mixin__ = mixins
  }

  // Finally - extend the new form's own declaredFields over the top of
  // decalredFields being inherited, then delete any fields which have been
  // shadowed by a non-Field property in its prototype.
  object.extend(declaredFields, prototypeProps.declaredFields)
  Object.keys(prototypeProps).forEach(function(name) {
    if (object.hasOwn(declaredFields, name)) {
      delete declaredFields[name]
    }
  })

  prototypeProps.baseFields = declaredFields
  prototypeProps.declaredFields = declaredFields
}

var Form = BaseForm.extend({
  __meta__: DeclarativeFieldsMeta
, constructor: function Form() {
    BaseForm.apply(this, arguments)
  }
})

module.exports = {
  NON_FIELD_ERRORS: NON_FIELD_ERRORS
, BoundField: BoundField
, BaseForm: BaseForm
, DeclarativeFieldsMeta: DeclarativeFieldsMeta
, Form: Form
}
