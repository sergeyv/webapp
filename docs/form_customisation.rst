###################
Form customisation
###################

Simple customisations
#####################

Changing widgets
================

If a loadable form (i.e. a ``schemaish.Structure`` subclass marked with ``@webapp.loadable``) has ``augment_form`` method, the method will be called before rendering the form, allowing to change widgets and modify form appearance::

    class ClientDetailsSubform(sc.Structure):

        name = sc.String()
        tax = sc.String()
        tax_number = sc.String()
        taxable = sc.Boolean()
        base_currency_id = sc.Integer(title="Base Currency")
        notes = sc.String()

        def augment_form(self, form):

            form['tax'].widget = formish.SelectChoice(
                options = [('ABN','ABN'),('ACN','ACN')])

            form['taxable'].widget = formish.SelectChoice(
                options = [(True,'Yes'), (False,'No')])

            form['base_currency_id'].widget = webapp.widgets.LoadableListbox(
                load_from="/vocabs/currencies/@vocab")


If a Structure has ``get_html(self, form)`` method, it will be called
instead of the built-in one, which allows to add some bits of html before or after
the form, or possibly to completely override the HTML output of the form::

    class ClientDetailsSubform(sc.Structure):

        def get_html(self, form):
            return "<h1>BEFORE</h1>" + form() + "<h2>AFTER</h2>"

or, to override the form completely::

    class ClientDetailsSubform(sc.Structure):

        def get_html(self, form):
            return "<form method="POST">...</form>"

Of course, using a template would be much better in the second case.


Subforms
========

A form can contain a subform::

    class AddressSubform(sc.Structure):
        street_address = sc.String()
        city = sc.String()
        postcode = sc.String()
        ...

    @webapp.loadable
    class PersonForm(sc.Structure):
        name = sc.String()
        address = AddressSubform(title = "Person's address")

The form will be renedered inside a <fieldset /> with a nice header.

When the form is serialized/deserialized, the data will contain a nested "address" object:

.. code-block:: javascript

    {
        name: "John Smith",
        address: {
            street_address: "1, John Smith drive",
            city: "City Name",
            postcode: "1234"
        }
    }

So, for the data to be properly saved, the model needs to have a scalar ``address`` attribute which should be an object with fields matching the ``AddressSubform``::

    class Address(Base):
        id = sa.Column(sa.Integer, primary_key=True)
        street_address = sa.Column(sa.String)
        city = sa.Column(sa.String)
        postcode = sa.Column(sa.String)
        ...

    class Person(Base):
        id = sa.Column(sa.Integer, primary_key=True)
        name = sa.Column(sa.String)
        address_id = sa.Column(sa.Integer, sa.ForeignKey('addresses.id'))
        address = sa.orm.relationship('Address')

If ``address`` is None, the serializer will create an instance of ``Address`` and assign it to the ``address`` attribute (it'll know which class to create from the
relationship configured on the ``Person`` model)

"Flat" subforms
===============

In some cases we want to divide a form into some logical sections, but our data model is just a single object with all the fields being "flat"::

    class Person(Base):
        id = sa.Column(sa.Integer, primary_key=True)
        name = sa.Column(sa.String)
        street_address = sa.Column(sa.String)
        city = sa.Column(sa.String)
        postcode = sa.Column(sa.String)

In this case we can still use subforms but give the serializer a hint that those subforms need to be "flattened"::

    class AddressSubform(sc.Structure):
        street_address = sc.String()
        city = sc.String()
        postcode = sc.String()
        ...

    @webapp.loadable
    class PersonForm(sc.Structure):
        name = sc.String()
        address = AddressSubform(title = "Person's address")

        __flatten_subforms__ = ("address")


Sequences in forms
==================

Creating a form which allows to add/edit multiple items at once is easy::


    @webapp.loadable
    class CompanyForm(sc.Structure):

        name = sc.String()
        departments = sc.Sequence(DepartmentSubform())

The subform used as an element of the sequence is required to have an ``id``
attribute, which usually you'll want to be a hidden field. Modifying the widgets a form which is used in a sequence is also a bit different::

    class DepartmentSubform(NameAndId):

        id = sc.Integer()
        name = sc.Integer()

        def augment_form(self, form):
            from formish.forms import starify
            id_name = form.get_field('id').name
            form.form.set_item_data(starify(id_name), 'widget', formish.Hidden())


More radical stuff
##################

There are three approaches to form customisation: using CSS, JavaScript and directly modifying HTML output of formish.

Using stylesheets
=================

All forms generated by formish have extensive CSS hooks so it's possible to address each and every form, widget and label either individually by id or by widget type or field type:

.. code-block:: html

    <div class="field ClientEditForm-address-timezone_id type-integer widget-loadablelistbox" id="ClientEditForm-address-timezone_id--field" style="display: block;">
        <label for="ClientEditForm-address-timezone_id">Timezone</label>
        <div class="inputs">
            <div class="loadableListbox">
                <select href="/vocabs/timezones/@vocab" class="" name="address.timezone_id" type="text" id="ClientEditForm-address-timezone_id" data-original_value="">
                    <option value="">- choose -</option>
                    <option value="1">(None) Brisbane</option>
                </select>
            </div>
        </div>
        &nbsp;
    </div>

As you can see, there are tons and tons of css hooks.

Using JavaScript
================

In the form declaration it it possible to specify callback functions which will be called
after the form is rendered. The application can register callbacks to modify forms appearance:

.. code-block:: javascript

    c.route("/clients/add",  new webapp.Form({
        title: "Add Client",
        button_title: "Add Client",
        identifier: "ClientAddForm",
        rest_service_root: "/clients",

        before_view_shown: function (fragment) {
            var $view = this.view,
            id = this.options.identifier;

            $view.find("#" + id + "-departments--field > a.adderlink").text("Add another department");
            $view.find("#" + id + "-contacts--field > a.adderlink").text("Add another contact");
        }
    }));

The example above changes "Add" links generated by formish into something more user-friendly.

The callbacks are `before_view_shown` and `after_view_shown`


Customizing Formish output
==========================

If nothing else helps, we can override widgets either for the whole form or for individual widgets.

For this to work, firstly we need to register a template directory which will override webapp and formish templates::

    webapp.LoadableForm.add_overrides_directory("myapp", "templates/mako")

where ``myapp`` is a package name and ``templates/mako`` are directories.

Overriding single widgets
-------------------------

Overriding single widgets is straightforward::

    @webapp.loadable
    class TestForm(sc.Structure):

        test = sc.String(title="Test!")

        def augment_form(self, form):
                form['test'].widget.template = "field.test"

Then create ``myapp/templates/mako/formish/widgets/test`` directory and copy formish's ``templates/mako/formish/widgets/Input`` contents there. Customize ``widget.html`` to your taste:

.. code-block:: mako

    <%page args="field" />
    <%!
    from webapp.forms import get_field_class_with_validators
    %>
    <input style="font-size:200%; border:4px solid red;" id="${field.cssname}" type="text" name="${field.name}" value="${
    ${get_field_class_with_validators(field, classes)|n}
    placeholder="${field.attr.description or ''}"
    />


The ``widget.template`` attribute expects a string in format ``<widget_type>.<widget_name>``, i.e. ``field.Input``. The first element is responsible for displaying field label, description, error message etc., templates for which are loaded from ``templates/mako/formish/field``, and the second displays the widget itself, loading the templates from ``templates/mako/formish/widgets/Input``

When customizing a widget, we can override the label and other things on a per-widget base by placing ``field`` directory inside ``templates/mako/formish/widgets/<widget_name>/`` and copying the templates from ``/templates/mako/formish/field`` there.

Overriding a structure
----------------------

To radically change how widgets are layed out in a form, one can override ``templates/mako/formish/form`` directory, copying it to, say, your project's ``templates/mako/formish/custom_user_form``. Then edit fields.html, possibly even invoking individual widgets one by one:

.. code-block:: mako

    <%page args="field" />
    <table>
        <tr>
            <th>First Name</th>
            <th>Last Name</th>
        </tr>
        <tr>
            <td>${field.get_field("first_name").widget()|n}</td>
            <td>${field.get_field("last_name").widget()|n}</td>
        </tr>
    </table>

To use the form, assign it to the form's widget::

    def augment_form(self, form):
            form.widget.template = "custom_user_form.blah-blah"

I couldn't find out if the ``blah-blah`` part is used in any way but it is still required.
