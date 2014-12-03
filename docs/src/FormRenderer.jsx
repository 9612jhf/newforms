'use strict';

var React = require('react')

var Collapsible = require('./Collapsible')
var FormInspector = require('./FormInspector')
var IFrameMixin = require('./IFrameMixin')

var extend = require('./extend')
var renderField = require('./renderField')

/**
 * Generic form-rendering component for demo forms which just need to be wrapped
 * and rendered.
 */
var FormRenderer = React.createClass({
  mixins: [IFrameMixin],

  getDefaultProps: function() {
    return {
      submitButton: 'Submit'
    }
  },

  getInitialState() {
    return {
      form: this.createForm()
    }
  },

  createForm() {
    var args = extend({onChange: this.forceUpdate.bind(this)}, this.props.args)
    return new this.props.form(args)
  },

  onSubmit(e) {
    e.preventDefault()
    var form = this.state.form
    if (form.isAsync()) {
      form.validate(err => {})
    }
    else {
      form.validate()
    }
  },

  render() {
    var form = this.state.form
    return <div className="example-container">
      <form onSubmit={this.onSubmit} autoComplete="off" noValidate>
        {form.nonFieldErrors().render()}
        {form.boundFields().map(renderField)}
        <div>
          <button type="submit">{this.props.submitButton}</button>
        </div>
      </form>
      <hr/>
      <Collapsible name="inspect form" collapsed>
        <FormInspector form={form}/>
      </Collapsible>
    </div>
  }
})

module.exports = FormRenderer