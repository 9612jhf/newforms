/**
 * @fileOverview Form Fields, which validate and normalise (or "clean") data.
 */

/* TODO Populate
var DEFAULT_DATE_INPUT_FORMATS =
    DEFAULT_TIME_INPUT_FORMATS =
    DEFAULT_DATETIME_INPUT_FORMATS =
*/

/**
 * An object that is responsible for doing validation and normalisation, or
 * "cleaning", for example: an {@link EmailField} makes sure its data is a valid
 * e-mail address and makes sure that acceptable "blank" values all have the
 * same representation.
 *
 * @param {Object} [kwargs] configuration options.
 * @config {Boolean} [required] determines if the field is required - defaults
 *                              to <code>true</code>.
 * @config {Widget} [widget] overrides the widget used to render the field - if
 *                           not provided, the field's default will be used.
 * @config {String} [label] the label to be displayed for the field - if not
 *                          provided, will be generated from the field's name.
 * @config [initial] an initial value for the field to be used if none is
 *                   specified by the field's form.
 * @config {String} [helpText] help text for the field.
 * @config {Object} [errorMessages] custom error messages for the field.
 * @config {Boolean} [showHiddenInitial] specifies if it is necessary to render a
                                         hidden widget with initial value after the
                                         widget.
 * @config {Array} [validators] list of addtional validators to use
 * @constructor
 */
function Field(kwargs)
{
    kwargs = extend({
        required: true, widget: null, label: null, initial: null, helpText: null,
        errorMessages: null, showHiddenInitial: false, validators: []
    }, kwargs || {});
    this.required = kwargs.required;
    this.label = kwargs.label;
    this.initial = kwargs.initial;
    this.showHiddenInitial = kwargs.showHiddenInitial;
    this.helpText = kwargs.helpText || "";

    var widget = kwargs.widget || this.widget;
    if (!(widget instanceof Widget))
    {
        // We must have a Widget constructor, so construct with it
        widget = new widget();
    }
    // Let the widget know whether it should display as required
    widget.required = this.required;
    // Hook into this.widgetAttrs() for any Field-specific HTML attributes
    extend(widget.attrs, this.widgetAttrs(widget));
    this.widget = widget;

    // Increment the creation counter and save our local copy
    this.creationCounter = Field.creationCounter++;

    // Copy error messages for this instance into a new object
    this.errorMessages =
        extend({}, this.defaultErrorMessages, kwargs.errorMessages || {});

    this.validators = this.defaultValidators.concat(kwargs.validators);
}
/**
 * Tracks each time a Field instance is created; used to retain order.
 */
Field.creationCounter = 0;
/**
 * Default widget to use when rendering this type of Field.
 */
Field.prototype.widget = TextInput;
/**
 * Default widget to use when rendering this type of field as hidden.
 */
Field.prototype.hiddenWidget = HiddenInput;
/**
 * Default set of validators.
 */
Field.prototype.defaultValidators = [];
/**
 * Default error messages.
 */
Field.prototype.defaultErrorMessages =
{
    required: "This field is required.",
    invalid: "Enter a valid value."
};

Field.prototype.prepareValue = function(value)
{
    return value;
};

Field.prototype.toJavaScript = function(value)
{
    return value;
};

Field.prototype.validate = function(value)
{
    if (this.required && contains(EMPTY_VALUES, value))
        throw new ValidationError(this.errorMessages.required);
};

Field.prototype.runValidators = fnction(value)
{
    if (contains(EMPTY_VALUES, value))
        throw new ValidationError(this.errorMessages.required);
    var errors = [];
    for (var i = 0, l= this.validators.length; i < l; i++)
    {
        try
        {
            callValidator(v, value);
        }
        catch (e)
        {
            if (!(e instanceof ValidationError))
                throw(e);
            if (typeof e.code != "undefined" and e.code in this.errorMessages)
            {
                var message = this.errorMessages[e.code];
                if (typeof e.params != undefined)
                    message = format(message, e.params)
                errors.push(message)
            }
            else
            {
                errors = errors.concat(e.messages);
            }
        }
    }
    if (errors.length > 0)
        throw new ValidationError(errors)
};


/**
 * Validates the given value and returns its "cleaned" value as an appropriate
 * JavaScript object.
 *
 * Raises ValidationError for any errors.
 *
 * @param {String} value the value to be validated.
 */
Field.prototype.clean = function(value)
{
    value = this.toJavaScript(value);
    this.validate(value);
    this.runValidators(value);
    return value;
};

/**
 * Return the value that should be shown for this field on render of a bound
 * form, given the submitted POST data for the field and the initial data, if
 * any.
 *
 * For most fields, this will simply be data; FileFields need to handle it a bit
 * differently.
 */
Field.prototype.boundValue = function(data, initial)
{
    return data;
};

/**
 * Specifies HTML attributes which should be added to a given widget for this
 * field.
 *
 * @param {Widget} widget a widget
 * @returns an object specifying HTML attributes that should be added to the
 *          given widget, based on this field.
 * @type Object
 */
Field.prototype.widgetAttrs = function(widget)
{
    return {};
};

/**
 * Validates that its input is a valid string.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Number} [maxLength] a maximum valid length for the input string.
 * @config {Number} [minLength] a minimum valid length for the input string.
 * @constructor
 */
function CharField(kwargs)
{
    kwargs = extend({
        maxLength: null, minLength: null
    }, kwargs || {});
    this.maxLength = kwargs.maxLength;
    this.minLength = kwargs.minLength;
    Field.call(this, kwargs);
    if (this.minLength !== null)
        this.validators.append(new MinLengthValidator(this.minLength));
    if (this.maxLength !== null)
        this.validators.append(new MaxLengthValidator(this.maxLength));
}
inheritFrom(CharField, Field);

CharField.prototype.toJavaScript = function(value)
{
    if (contains(EMPTY_VALUES, value))
        return "";
    return value;
};

/**
 * If this field is configured to enforce a maximum length, adds a suitable
 * <code>maxlength</code> attribute to text input fields.
 *
 * @param {Widget} widget the widget being used to render this field's value.
 *
 * @return additional attributes which should be added to the given widget.
 * @type Object
 */
CharField.prototype.widgetAttrs = function(widget)
{
    var attrs = {};
    if (this.maxLength !== null && (widget instanceof TextInput ||
                                    widget instanceof PasswordInput))
    {
        attrs.maxlength = this.maxLength.toString();
    }
    return attrs;
};

/**
 * Validates that its input is a valid integer.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Number} [maxValue] a maximum value for the input.
 * @config {Number} [minValue] a minimum value for the input.
 */
function IntegerField(kwargs)
{
    kwargs = extend({
        maxValue: null, minValue: null
    }, kwargs || {});
    this.maxValue = kwargs.maxValue;
    this.minValue = kwargs.minValue;
    Field.call(this, kwargs);

    if (this.minValue !== null)
        this.validators.append(new MinValueValidator(this.minValue));
    if (this.maxValue !== null)
        this.validators.append(new MaValueValidator(this.maxValue));
}
inheritFrom(IntegerField, Field);
IntegerField.prototype.defaultErrorMessages =
    extend({}, IntegerField.prototype.defaultErrorMessages, {
        invalid: "Enter a whole number.",
        maxValue': "Ensure this value is less than or equal to %(limit_value)s.",
        minValue': "Ensure this value is greater than or equal to %(limit_value)s."
    });

/**
 * Validates that Number() can be called on the input with a result that isn't
 * NaN and doesn't contain any decimal points.
 *
 * @param value the value to be val idated.
 * @return the result of Number(), or <code>null</code> for empty values.
 * @type Number
 */
IntegerField.prototype.toJavaScript = function(value)
{
    value = Field.prototype.toJavaScript.call(this, value);
    if (contains(EMPTY_VALUES, value))
        return null;
    value = Number(value);
    if (isNaN(value) || value.toString().indexOf(".") != -1)
        throw new ValidationError(this.errorMessages.invalid);
    return value;
};

/**
 * Validates that its input is a valid float.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Number} [maxValue] a maximum value for the input.
 * @config {Number} [minValue] a minimum value for the input.
 * @constructor
 */
function FloatField(kwargs)
{
    IntegerField.call(this, kwargs);
}
inheritFrom(FloatField, IntegerField);
FloatField.prototype.defaultErrorMessages =
    extend({}, FloatField.prototype.defaultErrorMessages, {
        invalid: "Enter a number."
    });

/**
 * Validates that Number() can be called on the input with a result that isn't
 * NaN.
 *
 * @param value the value to be validated.
 *
 * @return the result of Number(), or <code>null</code> for empty values.
 * @type Number
 */
FloatField.prototype.toJavaScript = function(value)
{
    value = Field.prototype.toJavaScript.call(this, value);
    if (contains(EMPTY_VALUES, value))
        return null;
    value = Number(value);
    if (isNaN(value))
        throw new ValidationError(this.errorMessages.invalid);
    return value;
};

/**
 * Validates that its input is a decimal number.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Number} maxValue a maximum value for the input.
 * @config {Number} minValue a minimum value for the input.
 * @config {Number} maxDigits the maximum number of digits the input may
 *                            contain.
 * @config {Number} decimalPlaces the maximum number of decimal places the input
 *                                may contain.
 * @constructor
 */
function DecimalField(kwargs)
{
    kwargs = extend({
      maxValue: null, minValue: null, maxDigits: null, decimalPlaces: null
    }, kwargs || {})
    this.maxValue = kwargs.maxValue;
    this.minValue = kwargs.minValue;
    this.maxDigits = kwargs.maxDigits;
    this.decimalPlaces = kwargs.decimalPlaces;
    Field.call(this, kwargs);

    if (this.minValue !== null)
        this.validators.append(new MinValueValidator(this.minValue));
    if (this.maxValue !== null)
        this.validators.append(new MaValueValidator(this.maxValue));
}
inheritFrom(DecimalField, Field);
/**
 * Decimal validation regular expression.
 */
DecimalField.DECIMAL_REGEXP = new RegExp(/^[-+]?(?:\d+(?:\.\d+)?|(?:\d+)?\.\d+)$/;
DecimalField.prototype.defaultErrorMessages =
    extend({}, DecimalField.prototype.defaultErrorMessages, {
        invalid: "Enter a number.",
        maxValue: "Ensure this value is less than or equal to %(limit_value)s.",
        minValue: "Ensure this value is greater than or equal to %(limit_value)s.",
        maxDigits: "Ensure that there are no more than %(maxDigits)s digits in total.",
        maxDecimalPlaces: "Ensure that there are no more than %(maxDecimalPlaces)s decimal places.",
        maxWholeDigits: "Ensure that there are no more than %(maxWholeDigits)s digits before the decimal point."
    });

/**
 * Validates that the input looks like a decimal number.In lieu of a built-in
 * Decimal type for JavaScript, this method uses Number() and returns the result.
 *
 * @param value the value to be validated.
 *
 * @return a Number, or <code>null</code> for empty values.
 * @type Number
 */
DecimalField.prototype.toJavaScript = function(value)
{
    if (contains(EMPTY_VALUES, value))
        return null;
    value = strip(value);
    // TODO We should be attempting to create a Decimal object instead - are
    //      there any decent JavaScript equivalents?
    if (!DecimalField.DECIMAL_REGEXP.test(value))
        throw new ValidationError(this.errorMessages.invalid);
    value = Number(value);
    if (isNaN(value)):
        throw new ValidationError(this.errorMessages.invalid);
    return value;
};

/**
 * Ensures that there are no more than maxDigits in the number, and no more than
 * decimalPlaces digits after the decimal point.
 */
DecimalField.prototype.validate = function(value)
{
    Field.prototype.validate.call(this, value);
    if (contains(EMPTY_VALUES, value))
        return
    // Check for NaN, Inf and -Inf values
    if (isNaN(value) || value == Number.POSITIVE_INFINITY || value == Number.NEGATIVE_INFINITY)
        throw new ValidationError(this.errorMessages.invalid);
    // Perform remaining checks against a string representation...
    value = ""+value;
    // Strip sign, if present
    if (value.charAt(0) == "-")
        value = value.substr(1);
    var pieces = value.split("."),
        wholeDigits = pieces[0].length,
        decimals = (pieces.length == 2 ? pieces[1].length : 0),
        digits = wholeDigits + decimals;

    if (this.maxDigits !== null && digits > this.maxDigits)
        throw new ValidationError(format(this.errorMessages.maxDigits,
                                  {maxDigits: this.maxDigits}));
    if (this.decimalPlaces !== null && decimals > this.decimalPlaces)
        throw new ValidationError(format(this.errorMessages.maxDecimalPlaces,
                                  {maxDecimalPlaces: this.decimalPlaces}));
    if (this.maxDigits !== null &&
        this.decimalPlaces !== null &&
        wholeDigits > (this.maxDigits - this.decimalPlaces))
        throw new ValidationError(format(this.errorMessages.maxWholeDigits,
                                  {maxWholeDigits: (this.maxDigits - this.decimalPlaces)}));
};

/**
 * Validates that its input is a date.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Array} [inputFormats] a list of {@link time.strptime} input formats
 *                                which are considered valid - if not provided,
 *                                {@link DateField.DEFAULT_DATE_INPUT_FORMATS}
 *                                will be used.
 * @constructor
 */
function DateField(kwargs)
{
    kwargs = extend({
        inputFormats: null
    }, kwargs || {});
    Field.call(this, kwargs);
    this.inputFormats =
        kwargs.inputFormats || DateField.DEFAULT_DATE_INPUT_FORMATS;
}

/**
 * Default {@link time.strptime} input formats which are considered valid.
 */
DateField.DEFAULT_DATE_INPUT_FORMATS = [
    "%Y-%m-%d",              // "2006-10-25"
    "%m/%d/%Y", "%m/%d/%y",  // "10/25/2006", "10/25/06"
    "%b %d %Y", "%b %d, %Y", // "Oct 25 2006", "Oct 25, 2006"
    "%d %b %Y", "%d %b, %Y", // "25 Oct 2006", "25 Oct, 2006"
    "%B %d %Y", "%B %d, %Y", // "October 25 2006", "October 25, 2006"
    "%d %B %Y", "%d %B, %Y"  // "25 October 2006", "25 October, 2006"
];

inheritFrom(DateField, Field);
DateField.prototype.defaultErrorMessages =
    extend({}, DateField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid date."
    });

/**
 * Validates that the input can be converted to a date.
 *
 * @param value the value to be validated.
 *
 * @return a <code>Date</code> object with its year, month and day attributes
 *         set, or <code>null</code> for empty values.
 * @type Date
 */
DateField.prototype.clean = function(value)
{
    Field.prototype.clean.call(this, value);

    if (contains(EMPTY_VALUES, value))
    {
        return null;
    }

    if (value instanceof Date)
    {
        return new Date(value.getFullYear(),
                        value.getMonth(),
                        value.getDate());
    }

    for (var i = 0, l = this.inputFormats.length; i < l; i++)
    {
        try
        {
            var t = time.strptime(value, this.inputFormats[i]);
            return new Date(t[0], t[1] - 1, t[2]);
        }
        catch (e)
        {
            continue;
        }
    }

    throw new ValidationError(this.errorMessages.invalid);
};

/**
 * Validates that its input is a time.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Array} [inputFormats] a list of {@link time.strptime} input formats
 *                                which are considered valid - if not provided,
 *                                {@link TimeField.DEFAULT_TIME_INPUT_FORMATS}
 *                                will be used.
 * @constructor
 */
function TimeField(kwargs)
{
    kwargs = extend({
        inputFormats: null
    }, kwargs || {});
    Field.call(this, kwargs);
    this.inputFormats =
        kwargs.inputFormats || TimeField.DEFAULT_TIME_INPUT_FORMATS;
}

/**
 * Default {@link time.strptime} input formats which are considered valid.
 */
TimeField.DEFAULT_TIME_INPUT_FORMATS = [
    "%H:%M:%S", // "14:30:59"
    "%H:%M"     // "14:30"
];

inheritFrom(TimeField, Field);
TimeField.prototype.widget = TimeInput;
TimeField.prototype.defaultErrorMessages =
    extend({}, TimeField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid time."
    });

/**
 * Validates that the input can be converted to a time.
 *
 * @param value the value to be validated.
 *
 * @return a <code>Date</code> object with its date set to 1st January, 1900 and
 *         its hour, minute and second attributes set to the given time, or
 *         <code>null</code> for empty values.
 * @type Date
 */
TimeField.prototype.clean = function(value)
{
    Field.prototype.clean.call(this, value);

    if (contains(EMPTY_VALUES, value))
    {
        return null;
    }

    if (value instanceof Date)
    {
        return new Date(1900,
                        0,
                        1,
                        value.getHours(),
                        value.getMinutes(),
                        value.getSeconds());
    }

    for (var i = 0, l = this.inputFormats.length; i < l; i++)
    {
        try
        {
            var t = time.strptime(value, this.inputFormats[i]);
            return new Date(1900, 0, 1, t[3], t[4], t[5]);
        }
        catch (e)
        {
            continue;
        }
    }

    throw new ValidationError(this.errorMessages.invalid);
};

/**
 * Validates that its input is a date/time.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Array} [inputFormats] a list of {@link time.strptime} input formats
 *                                which are considered valid - if not provided,
 *                                {@link DateTimeField.DEFAULT_TIME_INPUT_FORMATS}
 *                                will be used.
 * @constructor
 */
function DateTimeField(kwargs)
{
    kwargs = extend({
        inputFormats: null
    }, kwargs || {});
    Field.call(this, kwargs);
    this.inputFormats =
        kwargs.inputFormats || DateTimeField.DEFAULT_DATETIME_INPUT_FORMATS;
}

/**
 * Default {@link time.strptime} input formats which are considered valid.
 */
DateTimeField.DEFAULT_DATETIME_INPUT_FORMATS = [
    "%Y-%m-%d %H:%M:%S", // "2006-10-25 14:30:59"
    "%Y-%m-%d %H:%M",    // "2006-10-25 14:30"
    "%Y-%m-%d",          // "2006-10-25"
    "%m/%d/%Y %H:%M:%S", // "10/25/2006 14:30:59"
    "%m/%d/%Y %H:%M",    // "10/25/2006 14:30"
    "%m/%d/%Y",          // "10/25/2006"
    "%m/%d/%y %H:%M:%S", // "10/25/06 14:30:59"
    "%m/%d/%y %H:%M",    // "10/25/06 14:30"
    "%m/%d/%y"           // "10/25/06"
]

inheritFrom(DateTimeField, Field);
DateTimeField.prototype.widget = DateTimeInput;
DateTimeField.prototype.defaultErrorMessages =
    extend({}, DateTimeField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid date/time."
    });

/**
 * Validates that the input can be converted to a date/time.
 *
 * @param value the value to be validated.
 *
 * @return a <code>Date</code> object, or <code>null</code> for empty values.
 * @type Date
 */
DateTimeField.prototype.clean = function(value)
{
    Field.prototype.clean.call(this, value);

    if (contains(EMPTY_VALUES, value))
    {
        return null;
    }

    if (value instanceof Date)
    {
        return value;
    }

    if (isArray(value))
    {
        // Input comes from a SplitDateTimeWidget, for example, so it's two
        // components: date and time.
        if (value.length != 2)
        {
            throw new ValidationError(this.errorMessages.invalid);
        }
        value = value.join(" ");
    }

    for (var i = 0, l = this.inputFormats.length; i < l; i++)
    {
        try
        {
            var t = time.strptime(value, this.inputFormats[i]);
            return new Date(t[0], t[1] - 1, t[2], t[3], t[4], t[5]);
        }
        catch (e)
        {
            continue;
        }
    }

    throw new ValidationError(this.errorMessages.invalid);
};

/**
 * Validates that its input matches a given regular expression.
 *
 * @param regex a <code>RegExp</code> or a <code>String</code> containing a
 *              pattern. If a <code>String</code> is given, it will be compiled
 *              to a <code>RegExp</code>.
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field} and {@link CharField}.
 * @constructor
 */
function RegexField(regex, kwargs)
{
    CharField.call(this, kwargs);
    if (isString(regex))
    {
        regex = new RegExp(regex);
    }
    this.regex = regex;
}

inheritFrom(RegexField, CharField);

/**
 * Validates that the given value matches the regular expression defined for
 * this Field.
 *
 * @param {String} value the value to be validated.
 *
 * @return a string which matches the regular expresson defined for this field.
 * @type String
 */
RegexField.prototype.clean = function(value)
{
    value = CharField.prototype.clean.call(this, value);
    if (value !== "" && !this.regex.test(value))
    {
        throw new ValidationError(this.errorMessages.invalid);
    }
    return value;
};

/**
 * Validates that its input appears to be a valid e-mail address.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link RegexField}.
 * @constructor
 */
function EmailField(kwargs)
{
    RegexField.call(this, EmailField.EMAIL_REGEXP, kwargs);
}

/**
 * E-mail validation regular expression.
 */
EmailField.EMAIL_REGEXP = new RegExp(
    "(^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(\\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*" +                                // Dot-atom
    "|^\"([\\001-\\010\\013\\014\\016-\\037!#-\\[\\]-\\177]|\\\\[\\001-011\\013\\014\\016-\\177])*\"" + // Quoted-string
    ")@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\\.)+[A-Z]{2,6}\\.?$",                                                   // Domain
    "i");

inheritFrom(EmailField, RegexField);

EmailField.prototype.defaultErrorMessages =
    extend({}, EmailField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid e-mail address."
    });

/**
 * A wrapper for files uploaded in a {@link FileField}.
 *
 * @param {String} filename the file's name.
 * @param {String} content the file's contents.
 * @constructor
 */
function UploadedFile(filename, content)
{
    this.filename = filename;
    this.content = content;
}

UploadedFile.prototype.toString = function()
{
    return this.filename;
};

/**
 * Validates that its input is a valid uploaded file.
 * <p>
 * This field is mostly meaningless on the client-side, but is included for
 * future use in any future server-side implementation.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field}.
 * @constructor
 */
function FileField(kwargs)
{
    kwargs = extend({maxLength: null}, kwargs);
    this.maxLength = kwargs.maxLength;
    delete kwargs.maxLength;
    Field.call(this, kwargs);
}

inheritFrom(FileField, Field);
FileField.prototype.widget = FileInput;
FileField.prototype.defaultErrorMessages =
    extend({}, FileField.prototype.defaultErrorMessages, {
        invalid: "No file was submitted. Check the encoding type on the form.",
        empty: "The submitted file is empty.",
        maxLength: "Ensure this filename has at most %(max)s characters (it has %(length)s)."
    });

/**
 * Validates that the given data appears to be a valid uploaded file.
 *
 * @param {Object} data uploaded file data.
 * @config {String} filename the file's name.
 * @config {String} content the file's content.
 * @param {String} [initial] the path of an existing file.
 *
 * @return an object representing uploaded file data, or <code>null</code> for
 *         empty values.
 * @type UploadedFile
 */
FileField.prototype.clean = function(data, initial)
{
    Field.prototype.clean.call(this, initial || data);
    if (!this.required && contains(EMPTY_VALUES, data))
    {
        return null;
    }
    else if (!data && initial)
    {
        return initial;
    }

    // UploadedFile objects should have name and size attributes
    if (typeof data.name == "undefined" || typeof data.size == "undefined")
    {
        throw new ValidationError(this.errorMessages.invalid);
    }

    var fileName = data.name;
    var fileSize = data.size;

    if (this.maxLength !== null && fileName.length > this.maxLength)
    {
        throw new ValidationError(
            format(this.errorMessages.maxLength,
                         {max: this.maxLength, length: fileName.length}));
    }

    if (!fileName)
    {
        throw new ValidationError(this.errorMessages.invalid);
    }

    if (!fileSize)
    {
        throw new ValidationError(this.errorMessages.empty);
    }

    return data;
};

/**
 * Validates that its input is a valid uploaded image.
 * <p>
 * This field is mostly meaningless on the client-side, but is included for
 * future use in any future server-side implementation.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link FileField}.
 * @constructor
 */
function ImageField(kwargs)
{
    FileField.call(this, kwargs);
}

inheritFrom(ImageField, FileField);
ImageField.prototype.defaultErrorMessages =
    extend({}, ImageField.prototype.defaultErrorMessages, {
        invalidImage: "Upload a valid image. The file you uploaded was either not an image or a corrupted image."
    });

/**
 * Checks that the file-upload field data contains a valid image.
 */
ImageField.prototype.clean = function(data, initial)
{
    var f = FileField.prototype.clean.call(this, data, initial);
    if (f === null)
    {
        return null;
    }
    else if (!data && initial)
    {
        return initial;
    }

    // TODO Plug in image processing code when js-forms can be run in
    //           appropriate environments.

    return f;
};

/**
 * Validates that its input appears to be a valid URL.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link RegexField}.
 * @config {Boolean} [verifyExists] should the field attempt to verify if the
 *                                  address exists by accessing it? Defaults to
 *                                  <code>false</code>.
 * @config {String} [userAgent] the user agent string to use when attempting URL
 *                              verification.
 * @constructor
 */
function URLField(kwargs)
{
    kwargs = extend({
        verifyExists: false, userAgent: URLField.URL_VALIDATOR_USER_AGENT
    }, kwargs || {})
    RegexField.call(this, URLField.URL_REGEXP, kwargs);
    this.verifyExists = kwargs.verifyExists;
    this.userAgent = kwargs.userAgent;
}

/**
 * URL validation regular expression.
 */
URLField.URL_REGEXP = new RegExp(
    "^https?://" +                                                     // http:// or https://
    "(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\\.)+[A-Z]{2,6}\\.?|" + // Domain...
    "localhost|" +                                                     // ...localhost...
    "\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})" +                     // ...or ip
    "(?::\\d+)?" +                                                     // Optional port
    "(?:/?|/\\S+)$",
    "i")

/**
 * Default URL validation user agent.
 */
URLField.URL_VALIDATOR_USER_AGENT =
    "js-forms (http://code.google.com/p/js-forms/)";

inheritFrom(URLField, RegexField);
URLField.prototype.defaultErrorMessages =
    extend({}, URLField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid URL.",
        invalidLink: "This URL appears to be a broken link."
    });

/**
 * Validates that the given value appears to be a valid URL.
 *
 * @param {String} value the value to be validated.
 *
 * @return a valid URL.
 * @type String
 */
URLField.prototype.clean = function(value)
{
    // If no URL scheme was given, assume http://
    if (value && value.indexOf("://") == -1)
    {
        value = "http://" + value;
    }
    // If no URL path given, assume /
    if (value && !parseUri(value).path)
    {
        value += "/";
    }
    value = RegexField.prototype.clean.call(this, value);
    if (value === "")
    {
        return value;
    }
    if (this.verifyExists === true)
    {
        // TODO Implement URL verification when js-forms can be run in
        //      appropriate environments.
    }
    return value
};

/**
 * Normalises its input to a <code>Boolean</code> primitive.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field}.
 * @constructor
 */
function BooleanField(kwargs)
{
    Field.call(this, kwargs);
}

inheritFrom(BooleanField, Field);
BooleanField.prototype.widget = CheckboxInput;

/**
 * Normalises the given value to a <code>Boolean</code> primitive.
 *
 * @param {String} value the value to be validated.
 *
 * @return the value's normalised boolean representation.
 * @type Boolean
 */
BooleanField.prototype.clean = function(value)
{
    Field.prototype.clean.call(this, value);
    // Explicitly check for the strings "False" or "false", which is what a
    // hidden field will submit for false. Also check for '0', since this is
    // what RadioSelect will provide. Because Boolean("anything") == true, we
    // don't need to handle that explicitly.
    if (value == "False" || value == "false" || value == "0")
    {
        value = false;
    }
    else
    {
        value = Boolean(value);
    }

    Field.prototype.clean.call(this, value);
    if (!value && this.required)
    {
        throw new ValidationError(this.errorMessages.required);
    }
    return value;
};

/**
 * A field whose valid values are <code>null</code>, <code>true</code> and
 * <code>false</code>. Invalid values are cleaned to <code>null</code>.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link BooleanField}.
 * @constructor
 */
function NullBooleanField(kwargs)
{
    BooleanField.call(this, kwargs);
}

inheritFrom(NullBooleanField, BooleanField);
NullBooleanField.prototype.widget = NullBooleanSelect;

NullBooleanField.prototype.clean = function(value)
{
    // Explicitly checks for the string 'True' and 'False', which is what a
    // hidden field will submit for true and false, and for '1' and '0', which
    // is what a RadioField will submit. Unlike the Booleanfield we also need
    // to check for true, because we are not using Boolean() function.
    if (value === true || value == "True" || value == "true" || value == "1")
    {
        return true;
    }
    else if (value === false || value == "False" || value == "false" || value == "0")
    {
        return false;
    }
    else
    {
        return null;
    }
};

/**
 * Validates that its input is one of a valid list of choices.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Array} [choices] a list of choices - each choice should be specified
 *                           as a list containing two items; the first item is
 *                           a value which should be validated against, the
 *                           second item is a display value for that choice, for
 *                           example:
 *                           <code>{choices: [[1, "One"], [2, "Two"]]}</code>.
 *                           Defaults to an empty <code>Array</code>.
 * @constructor
 */
function ChoiceField(kwargs)
{
    /*
    this.__defineGetter__("choices", function()
    {
        return this._choices;
    });
    this.__defineSetter__("choices", function(choices)
    {
        // Setting choices also sets the choices on the widget
        this._choices = this.widget.choices = choices;
    });
    */

    kwargs = extend({
        choices: []
    }, kwargs || {});
    Field.call(this, kwargs);
    this.setChoices(kwargs.choices);
}

inheritFrom(ChoiceField, Field);
ChoiceField.prototype.widget = Select;
ChoiceField.prototype.defaultErrorMessages =
    extend({}, ChoiceField.prototype.defaultErrorMessages, {
        invalidChoice: "Select a valid choice. %(value)s is not one of the available choices."
    });
ChoiceField.prototype.choices = function() { return this._choices; };
ChoiceField.prototype.setChoices = function(choices)
{
    // Setting choices also sets the choices on the widget
    this._choices = this.widget.choices = choices;
};

/**
 * Validates that the given value is in this field's choices.
 *
 * @param {String} value the value to be validated.
 *
 * @return a valid choice.
 * @type String
 */
ChoiceField.prototype.clean = function(value)
{
    value = Field.prototype.clean.call(this, value);

    if (contains(EMPTY_VALUES, value))
    {
        return "";
    }

    value = "" + value;
    if (value === "")
    {
        return value;
    }

    if (!this.validValue(value))
    {
        throw new ValidationError(format(
            this.errorMessages.invalidChoice, {value: value}));
    }

    return value;
};

/**
 * Checks to see if the provided value is a valid choice.
 *
 * @param {String} value the value to be validated.
 *
 * @type Boolean
 */
ChoiceField.prototype.validValue = function(value)
{
    for (var i = 0, l = this.choices().length; i < l; i++)
    {
        if (isArray(this.choices()[i][1]))
        {
            // This is an optgroup, so look inside the group for options
            var optgroupChoices = this.choices()[i][1];
            for (var j = 0, k = optgroupChoices.length; j < k; j++)
            {
                if (value === ("" + optgroupChoices[j][0]))
                {
                    return true;
                }
            }
        }
        else if (value === ("" + this.choices()[i][0]))
        {
            return true;
        }
    }
    return false;
};

/**
 * A {@link ChoiceField} which returns a value coerced by some provided
 * function.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link ChoiceField}.
 * @config {Function} [coerce] a function which takes the String value output by
 *                             ChoiceField's clean method and coerces it to
 *                             another type - defaults to a function which
 *                             returns the given value unaltered.
 * @config {Object} [emptyValue] the value which should be returned if the
 *                               selected value can be validly empty - defaults
 *                               to an empty string.
 * @constructor
 */
function TypedChoiceField(kwargs)
{
    kwargs = extend({
        coerce: function(val) { return val; }, emptyValue: ""
    }, kwargs || {});
    this.coerce = kwargs.coerce;
    this.emptyValue = kwargs.emptyValue;
    delete kwargs.coerce;
    delete kwargs.emptyValue;
    ChoiceField.call(this, kwargs);
}

inheritFrom(TypedChoiceField, ChoiceField);

/**
 * Validates that the value is in this.choices and can be coerced to the right
 * type.
 */
TypedChoiceField.prototype.clean = function(value)
{
    var value = ChoiceField.prototype.clean.call(this, value);
    if (value === this.emptyValue || contains(EMPTY_VALUES, value))
    {
        return this.emptyValue;
    }

    try
    {
        value = this.coerce(value)
    }
    catch (e)
    {
        throw new ValidationError(format(
            this.errorMessages.invalidChoice, {value: value}));
    }
    return value;
};

/**
 * Validates that its input is one or more of a valid list of choices.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link ChoiceField}.
 * @constructor
 */
function MultipleChoiceField(kwargs)
{
    ChoiceField.call(this, kwargs);
}

inheritFrom(MultipleChoiceField, ChoiceField);
MultipleChoiceField.prototype.widget = SelectMultiple;
MultipleChoiceField.prototype.hiddenWidget = MultipleHiddenInput;
MultipleChoiceField.prototype.defaultErrorMessages =
    extend({}, MultipleChoiceField.prototype.defaultErrorMessages, {
        invalidChoice: "Select a valid choice. %(value)s is not one of the available choices.",
        invalidList: "Enter a list of values."
    });

/**
 * Validates that the input is a list and that each item is in this field's
 * choices.
 *
 * @param value the input to be validated.
 *
 * @return a list of valid values, which have been normalised to
 *         <code>String</code>s.
 * @type Array
 */
MultipleChoiceField.prototype.clean = function(value)
{
    if (this.required && !value)
    {
        throw new ValidationError(this.errorMessages.required);
    }
    else if (!this.required && !value)
    {
        return [];
    }

    // The similar else branch below is required due to empty Arrays not being
    // falsy in JavaScript.
    if (!(isArray(value)))
    {
        throw new ValidationError(this.errorMessages.invalidList);
    }
    else if (value.length == 0)
    {
        if (this.required)
        {
            throw new ValidationError(this.errorMessages.required);
        }
        else
        {
            return [];
        }
    }

    var stringValues = [];
    for (var i = 0, l = value.length; i < l; i++)
    {
        var stringValue = "" + value[i];
        if (!this.validValue(stringValue))
        {
            throw new ValidationError(format(
                this.errorMessages.invalidChoice, {value: stringValue}));
        }
        stringValues[stringValues.length] = stringValue;
    }
    return stringValues;
};

/**
 * A Field whose <code>clean()</code> method calls multiple Field
 * <code>clean()</code> methods.
 *
 * @param {Object} [kwargs] configuration options additional to those specified
 *                          in {@link Field}.
 * @config {Array} [fields] fields which will be used to perform cleaning in the
 *                          order they're given in.
 * @constructor
 */
function ComboField(kwargs)
{
    kwargs = extend({fields: []}, kwargs || {});
    Field.call(this, kwargs);

    // Set "required" to False on the individual fields, because the required
    // validation will be handled by ComboField, not by those individual fields.
    for (var i = 0, l = kwargs.fields.length; i < l; i++)
    {
        kwargs.fields[i].required = false;
    }
    this.fields = kwargs.fields;
}

inheritFrom(ComboField, Field);

ComboField.prototype.clean = function(value)
{
    Field.prototype.clean.call(this, value);
    for (var i = 0, l = this.fields.length; i < l; i++)
    {
        value = this.fields[i].clean(value);
    }
    return value;
};

/**
 * A Field that aggregates the logic of multiple Fields.
 * <p>
 * Its <code>clean()</code> method takes a "decompressed" list of values, which
 * are then cleaned into a single value according to <code>this.fields</code>.
 * Each value in this list is cleaned by the corresponding field -- the first
 * value is cleaned by the first field, the second value is cleaned by the
 * second field, etc. Once all fields are cleaned, the list of clean values is
 * "compressed" into a single value.
 * <p>
 * Subclasses should not have to implement <code>clean()</code>. Instead, they
 * must implement <code>compress()</code>, which takes a list of valid values
 * and returns a "compressed" version of those values -- a single value.
 * <p>
 * You'll probably want to use this with {@link MultiWidget}.
 *
 * @param {Object} [kwargs] configuration options additional to those supplied
 *                          in {@link Field}.
 * @config {Array} [fields] a list of fields to be used to clean a
 *                          "decompressed" list of values.
 * @constructor
 */
function MultiValueField(kwargs)
{
    kwargs = extend({fields: []}, kwargs || {});
    Field.call(this, kwargs);
    // Set required to false on the individual fields, because the required
    // validation will be handled by MultiValueField, not by those individual
    // fields.
    for (var i = 0, l = kwargs.fields.length; i < l; i++)
    {
        kwargs.fields[i].required = false;
    }
    this.fields = kwargs.fields;
}

inheritFrom(MultiValueField, Field);
MultiValueField.prototype.defaultErrorMessages =
    extend({}, MultiValueField.prototype.defaultErrorMessages, {
        invalid: "Enter a list of values."
    });

/**
 * Validates every value in the given list. A value is validated against the
 * corresponding Field in <code>this.fields</code>.
 * <p>
 * For example, if this MultiValueField was instantiated with
 * <code>{fields: [new DateField(), new TimeField()]}, <code>clean()</code>
 * would call <code>DateField.clean(value[0])</code> and
 * <code>TimeField.clean(value[1])<code>.
 *
 * @param {Array} value the input to be validated.
 *
 * @return the result of calling <code>compress()</code> on the cleaned input.
 */
MultiValueField.prototype.clean = function(value)
{
    var cleanData = [];
    var errors = new ErrorList();

    if (!value || isArray(value))
    {
        var allValuesEmpty = true;
        if (isArray(value))
        {
            for (var i = 0, l = value.length; i < l; i++)
            {
                if (value[i])
                {
                    allValuesEmpty = false;
                    break;
                }
            }
        }

        if (!value || allValuesEmpty)
        {
            if (this.required)
            {
                throw new ValidationError(this.errorMessages.required);
            }
            else
            {
                return this.compress([]);
            }
        }
    }
    else
    {
        throw new ValidationError(this.errorMessages.invalid);
    }

    for (var i = 0, l = this.fields.length; i < l; i++)
    {
        var field = this.fields[i];
        var fieldValue = value[i];
        if (fieldValue === undefined)
        {
            fieldValue = null;
        }

        if (this.required && contains(EMPTY_VALUES, fieldValue))
        {
            throw new ValidationError(this.errorMessages.required);
        }

        try
        {
            cleanData[cleanData.length] = field.clean(fieldValue);
        }
        catch (e)
        {
            if (e instanceof ValidationError)
            {
                errors.extend(e.messages);
            }
            else
            {
                throw e;
            }
        }
    }

    if (errors.isPopulated())
    {
        throw new ValidationError(errors.errors);
    }

    return this.compress(cleanData);
};

/**
 * Returns a single value for the given list of values. The values can be
 * assumed to be valid.
 * <p>
 * For example, if this MultiValueField was instantiated with
 * <code>{fields: [new DateField(), new TimeField()]}</code>, this might return
 * a <code>Date</code> object created by combining the date and time in
 * <code>dataList</code>.
 *
 * @param {Array} dataList
 */
MultiValueField.prototype.compress = function(dataList)
{
    throw new Error("Subclasses must implement this method.");
};

/**
 * Allows choosing from files inside a certain directory.
 *
 * @param {String} path The absolute path to the directory whose contents you
 *                      want listed - this directory must exist.
 * @param {Object} [kwargs] configuration options additional to those supplied
 *                          in {@link ChoiceField}.
 * @config {String} [match] a regular expression pattern - if provided, only
 *                          files with names matching this expression will be
 *                          allowed as choices.
 * @config {Boolean} [recursive] if <code>true</code>, the directory will be
 *                               descended into recursively and all descendants
 *                               will be listed as choices - defaults to
 *                               <code>false</code>.
 * @constructor
 */
function FilePathField(path, kwargs)
{
    kwargs = extend({
        match: null, recursive: false, required: true, widget: null,
        label: null, initial: null, helpText: null
    }, kwargs);

    this.path = path;
    this.match = kwargs.match;
    this.recursive = kwargs.recursive;
    delete kwargs.match;
    delete kwargs.recursive;

    kwargs.choices = [];
    ChoiceField.call(this, kwargs);

    if (this.required)
    {
        this.setChoices([]);
    }
    else
    {
        this.setChoices([["", "---------"]]);
    }

    if (this.match !== null)
    {
        this.matchRE = new RegExp(this.match);
    }

    // TODO Populate this.choices with file paths when js-forms can be run in
    //      appropriate environments.

    this.widget.choices = this.choices();
}

inheritFrom(FilePathField, ChoiceField);

/**
 * A {@link MultiValueField} consisting of a {@link DateField} and a
 * {@link TimeField}.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field} and {@link MultiValueField}.
 * @constructor
 */
function SplitDateTimeField(kwargs)
{
    kwargs = extend({}, kwargs || {});
    var errors = extend({}, this.defaultErrorMessages);
    if (typeof kwargs.errorMessages != "undefined")
    {
        extend(errors, kwargs.errorMessages);
    }
    kwargs.fields =
        [new DateField({errorMessages: {invalid: errors.invalidDate}}),
         new TimeField({errorMessages: {invalid: errors.invalidTime}})];
    MultiValueField.call(this, kwargs);
}

inheritFrom(SplitDateTimeField, MultiValueField);
SplitDateTimeField.prototype.widget = SplitDateTimeWidget;
SplitDateTimeField.prototype.defaultErrorMessages =
    extend({}, SplitDateTimeField.prototype.defaultErrorMessages, {
        invalidDate: "Enter a valid date.",
        invalidTime: "Enter a valid time."
    });

/**
 * Validates that, if given, its input does not contain empty values.
 *
 * @param {Array} [dataList] a two-item list consisting of two <code>Date</code>
 *                           objects, the first of which represents a date, the
 *                           second a time.
 *
 * @return a <code>Date</code> object representing the given date and time, or
 *         <code>null</code> for empty values.
 * @type Date
 */
SplitDateTimeField.prototype.compress = function(dataList)
{
    if (isArray(dataList) && dataList.length > 0)
    {
        var d = dataList[0], t = dataList[1];
        // Raise a validation error if date or time is empty (possible if
        // SplitDateTimeField has required == false).
        if (contains(EMPTY_VALUES, d))
        {
           throw new ValidationError(this.errorMessages.invalidDate);
        }
        else if (contains(EMPTY_VALUES, t))
        {
           throw new ValidationError(this.errorMessages.invalidTime);
        }
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                        t.getHours(), t.getMinutes(), t.getSeconds());
    }
    return null;
};

/**
 * Validates that its input is a valid IPv4 address.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field} and {@link CharField}.
 * @constructor
 */
function IPAddressField(kwargs)
{
    RegexField.call(this, IPAddressField.IPV4_REGEXP, kwargs);
};

/**
 * IPv4 address validation regular expression.
 */
IPAddressField.IPV4_REGEXP =
    /^(25[0-5]|2[0-4]\d|[0-1]?\d?\d)(\.(25[0-5]|2[0-4]\d|[0-1]?\d?\d)){3}$/;

inheritFrom(IPAddressField, RegexField);
IPAddressField.prototype.defaultErrorMessages =
    extend({}, IPAddressField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid IPv4 address."
    });

/**
 * Validates that its input is a valid slug.
 *
 * @param {Object} [kwargs] configuration options, as specified in
 *                          {@link Field} and {@link CharField}.
 * @constructor
 */
function SlugField(kwargs)
{
    RegexField.call(this, SlugField.SLUG_REGEXP, kwargs);
};

/**
 * Slug validation regular expression.
 */
SlugField.SLUG_REGEXP = /^[-\w]+$/;

inheritFrom(SlugField, RegexField);
SlugField.prototype.defaultErrorMessages =
    extend({}, SlugField.prototype.defaultErrorMessages, {
        invalid: "Enter a valid 'slug' consisting of letters, numbers, underscores or hyphens."
    });
