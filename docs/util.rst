Utilities
=========

Core utilities
--------------

Utilities which are of partcular interest when inplementing your own form
components are exposed on the ``forms`` namespace object.

.. js:class:: ErrorObject(errors)

   .. js:function:: ErrorObject.set()

   .. js:function:: ErrorObject.get()

   .. js:function:: ErrorObject.isPopulated()

   .. js:function:: ErrorObject.asUL()

   .. js:function:: ErrorObject.asText()

   .. js:function:: ErrorObject.defaultRendering()

   .. js:function:: ErrorObject.toString()

.. js:class:: ErrorList(errors)

   .. js:function:: ErrorList.extend()

   .. js:function:: ErrorList.isPopulated()

   .. js:function:: ErrorList.asUL()

   .. js:function:: ErrorList.asText()

   .. js:function:: ErrorList.defaultRendering()

   .. js:function:: ErrorList.toString()

.. js:class:: ValidationError(message, {code: null, params: null})

   Thrown by validation methods to indicate that invalid data was detected.
   The message argument can be a list of strings or a string, in which case
   an error code and a message parameters object can be provided to enable
   customisation of the resulting error message based on the code.

   This constructor is actually provided by the `validators`_ library, but is
   exposed as part of newforms' exports for convenience.

   .. _`validators`: https://github.com/insin/validators

.. js:function:: formData(form)

   Creates an object representation of a form's elements' contents.

   :param form:
      a form DOM node or a String specifying a form's ``name`` or ``id``
      attribute.

      If a String is given,  ``id`` is tried before ``name`` when attempting to
      find the form in the DOM. An error will be thrown if the form can't be
      found.

   :returns:
      an object representing the data present in the form. If the form could not
      be found, this object will be empty.
