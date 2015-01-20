========
Formsets
========

A formset is a layer of abstraction to work with multiple forms on the same
page. It can be best compared to a data grid. Let's say you have the following
form:

.. code-block:: javascript

   var ArticleForm = forms.Form.extend({
     title: forms.CharField(),
     pubDate: forms.DateField()
   })

You might want to allow the user to create several articles at once. To create
a formset out of an ``ArticleForm`` you would use the :js:func:`FormSet.extend`
function:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({form: ArticleForm})

You now have created a formset named ``ArticleFormSet``. The formset gives you
the ability to iterate over the forms in the formset and display them as you
would with a regular form:

.. code-block:: javascript

   var formset = new ArticleFormSet()
   formset.forms().forEach(function(form) {
     print(reactHTML(<RenderForm form={form}/>))
   })
   /* =>
   <div>
     <div><label for="id_form-0-title">Title:</label> <input type="text" name="form-0-title" id="id_form-0-title"></div>
     <div><label for="id_form-0-pubDate">Pub date:</label> <input type="text" name="form-0-pubDate" id="id_form-0-pubDate"></div>
   </div>
   */

As you can see it only displayed one empty form. The number of empty forms
that is displayed is controlled by the ``extra`` parameter. By default,
:js:class:`FormSet` defines one extra form; the following example will
display two blank forms:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({form: ArticleForm, extra: 2})

Using initial data with a formset
=================================

Initial data is what drives the main usability of a formset. As shown above
you can define the number of extra forms. What this means is that you are
telling the formset how many forms to show in addition to the number of forms it
generates from the initial data. Let's take a look at an example:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({form: ArticleForm, extra: 2})
   var formset = new ArticleFormSet({initial: [
     {title: "Django's docs are open source!", pubDate: new Date()}
   ]})
   formset.forms().forEach(function(form) {
     print(reactHTML(<RenderForm form={form}/>))
   })
   /* =>
   <div>
     <div><label for="id_form-0-title">Title:</label> <input type="text" name="form-0-title" id="id_form-0-title" value="Django's docs are open source!"></div>
     <div><label for="id_form-0-pubDate">Pub date:</label> <input type="text" name="form-0-pubDate" id="id_form-0-pubDate" value="2014-02-28"></div>
   </div>
   <div>
     <div><label for="id_form-1-title">Title:</label> <input type="text" name="form-1-title" id="id_form-1-title"></div>
     <div><label for="id_form-1-pubDate">Pub date:</label> <input type="text" name="form-1-pubDate" id="id_form-1-pubDate"></div>
   </div>
   <div>
     <div><label for="id_form-2-title">Title:</label> <input type="text" name="form-2-title" id="id_form-2-title"></div>
     <div><label for="id_form-2-pubDate">Pub date:</label> <input type="text" name="form-2-pubDate" id="id_form-2-pubDate"></div>
   </div>
   */

There are now a total of three forms showing above. One for the initial data
that was passed in and two extra forms. Also note that we are passing in a
list of objects as the initial data.

Limiting the maximum number of forms
====================================

The ``maxNum`` parameter to :js:class:`FormSet` gives you the ability to
limit the maximum number of empty forms the formset will display:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({
     form: ArticleForm,
     extra: 2,
     maxNum: 1
   })
   var formset = new ArticleFormSet()
   formset.forms().forEach(function(form) {
     print(reactHTML(<RenderForm form={form}/>))
   })
   /* =>
   <div>
     <div><label for="id_form-0-title">Title:</label> <input type="text" name="form-0-title" id="id_form-0-title"></div>
     <div><label for="id_form-0-pubDate">Pub date:</label> <input type="text" name="form-0-pubDate" id="id_form-0-pubDate"></div>
   </div>
   */

If the value of ``maxNum`` is greater than the number of existing objects, up to
``extra`` additional blank forms will be added to the formset, so long as the
total number of forms does not exceed ``maxNum``.

Formset validation
==================

Validation with a formset is almost identical to a regular ``Form``. There's an
``isValid()`` method on the formset to provide a convenient way to validate
all forms in the formset:

.. code-block:: javascript

   var data = {
     'form-TOTAL_FORMS': '1'
   , 'form-INITIAL_FORMS': '0'
   , 'form-MAX_NUM_FORMS': ''
   }
   var formset = new ArticleFormSet({data: data})
   print(formset.isValid()
   // => true

If we provide an invalid article:

.. code-block:: javascript

   var data = {
     'form-TOTAL_FORMS': '2'
   , 'form-INITIAL_FORMS': '0'
   , 'form-MAX_NUM_FORMS': ''
   , 'form-0-title': 'Test'
   , 'form-0-pubDate': '1904-06-16'
   , 'form-1-title': 'Test'
   , 'form-1-pubDate': '' // <-- this date is missing but required
   }
   var formset = new ArticleFormSet({data: data})
   print(formset.isValid())
   // => false
   print(formset.errors().map(function(e) { return e.toJSON() }))
   // => [{}, {pubDate: [{message: 'This field is required.', code: 'required'}]}]

To check how many errors there are in the formset, we can use the
``totalErrorCount()`` method:

.. code-block:: javascript

   formset.totalErrorCount()
   // => 1

We can also check if form data differs from the initial data (i.e. the form was
sent without any data):

.. code-block:: javascript

   var data = {
     'form-TOTAL_FORMS': '1'
   , 'form-INITIAL_FORMS': '0'
   , 'form-MAX_NUM_FORMS': ''
   , 'form-0-title': ''
   , 'form-0-pubDate': ''
   }
   var formset = new ArticleFormSet({data: data})
   print(formset.hasChanged())
   // => false

Understanding the ManagementForm
--------------------------------

You may have noticed the additional data (``form-TOTAL_FORMS``,
``form-INITIAL_FORMS`` and ``form-MAX_NUM_FORMS``) included in the formset's
data above. This data is handled by the ``ManagementForm``. This form defines
hidden fields which are used to submit information about the number of forms in
the formset. It's intended for use when a FormSet's inputs are being used for a
regular form submission to be handled on the server-side. If you're using
newforms on the server to handle formsets bound to data from an HTTP POST and
you don't provide this management data, an Error will be thrown:

.. code-block:: javascript

   var data = {
     'form-0-title': ''
   , 'form-0-pubDate': ''
   }
   try {
     var formset = new ArticleFormSet({data: data})
   }
   catch (e) {
     print(e.message)
   }
   // => ManagementForm data is missing or has been tampered with

It is used to keep track of how many form instances are being displayed. If
you are adding new forms via JavaScript, you should increment the count fields
in this form as well. On the other hand, if you are using JavaScript to allow
deletion of existing objects, then you need to ensure the ones being removed
are properly marked for deletion by including ``form-#-DELETE`` in the ``POST``
data. It is expected that all forms are present in the ``POST`` data regardless.

``totalFormCount()`` and ``initialFormCount()``
-----------------------------------------------

``FormSet`` has a couple of methods that are closely related to the
``ManagementForm``, ``totalFormCount`` and ``initialFormCount``.

``totalFormCount`` returns the total number of forms in this formset.
``initialFormCount`` returns the number of forms in the formset that were
pre-filled, and is also used to determine how many forms are required.

Client-side FormSets
====================

When FormSets are used on the client-side, the ManagementForm isn't necessary.
The formset's own form management configuration is used whether or not the
formset is boound.

Of particular interest is the formset's ``extra`` property, which can be used to
implement "add another" functionality -- since this is a common use case,
formsets have an ``addAnother()`` method does this for you.

Formsets also have a ``removeForm(index)`` method which takes care of the internal
details of removing an extra form. *This should only ever be called with the index
of an extra form in the formset.* To ensure this, if you're displaying a formset
which contains both initial forms for existing data, and extra forms for new data
which support deletion, use both :js:func:`FormSet.initialForms` and
:js:func:`FormSet.extraForms` when rendering instead of looping over
:js:func:`FormSet.forms`.

If you ever have a need to use FormSets on the client side *and* perform a regular
HTTP POST request to process the form, you can still render
``formset.managmentForm()`` -- its hidden fields will be kept in sync with any
changes made to the forset's form management configuration.

Updating a formset's data
-------------------------

Similar to Forms, a FormSet has a ``formset.setData()`` method which can be used
to update the data bound to the formset and its forms.

This will also trigger validation -- updating each form's ``form.errors()`` and
``form.cleanedData``, and returning the result of ``formset.isValid()``.

Validating a formset on-demand
------------------------------

To force full validation of the current state of a formset and its forms' input
data, call ``formset.validate()``.

Custom formset validation
=========================

A formset has a ``clean()`` method similar to the one on a ``Form`` class. This
is where you define your own validation that works at the formset level:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({
     form: ArticleForm,
     /** Checks that no two articles have the same title. */
     clean: function() {
       if (this.totalErrorCount() !== 0) {
         // Don't bother validating the formset unless each form is valid on its own
         return
       }
       var titles = {}
       this.forms().forEach(function(form) {
         var title = form.cleanedData.title
         if (title in titles) {
           throw forms.ValidationError('Articles in a set must have distinct titles.')
         }
         titles[title] = true
       })
     }
   })

   var data = {
     'form-TOTAL_FORMS': '2'
   , 'form-INITIAL_FORMS': '0'
   , 'form-MAX_NUM_FORMS': ''
   , 'form-0-title': 'Test'
   , 'form-0-pubDate': '1904-06-16'
   , 'form-1-title': 'Test'
   , 'form-1-pubDate': '1912-06-23'
   }
   var formset = new ArticleFormSet({data: data})
   print(formset.isValid())
   // => false
   print(formset.errors().map(function(e) { return e.toJSON() }))
   // => [{}, {}])
   print(formset.nonFormErrors().messages())
   // => ['Articles in a set must have distinct titles.']

Using more than one formset in a ``<form>``
===========================================

Just like Forms, FormSets can be given a ``prefix`` to prefix form field names
to allow more than one formset to be used in the same ``<form>`` without their
input ``name`` attributes clashing.

For example, if we had a ``Book`` form which also had a "title" field - this is
how we could avoid field names for ``Article`` and ``Book`` forms clashing:

.. code-block:: javascript

   var ArticleFormSet = forms.FormSet.extend({form: Article})
   var BookFormSet = forms.FormSet.extend({form: Book})

   var PublicationManager = React.createClass({
     getInitialState: function() {
       return {
         articleFormset: new ArticleFormSet({prefix: 'articles'})
       , bookFormset: new BookFormSet({prefix: 'books'})
       }
     },

     // ...rendering implemented as normal...

     onSubmit: function(e) {
       e.preventDefault()
       var articlesValid = this.state.articleFormset.validate()
       var booksValid = this.state.bookFormset.validate()
       if (articlesValid && booksValid) {
         // Do something with cleanedData() on the formsets
       }
     }
   })

For server-side usage, it's important to point out that you need to pass
``prefix`` every time you're creating a new formset instance -- on both POST and
non-POST cases -- so expected input names match up when submitted data is being
processed.
