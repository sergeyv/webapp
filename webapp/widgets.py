##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

"""
Commonly needed form widgets.
"""

__all__ = ['LoadableListbox', 'FieldsetSwitcher', 'Calendar', ]

from formish.widgets import Widget, SelectChoice, SequenceDefault, Hidden, StructureDefault


class LoadableListbox(Widget):
    """
    A listbox which loads its data from an external URL as json::

        def augment_form(self, form):
            form['controller_id'].widget = \\
                webapp.LoadableListbox(load_from="/rest/controllers/@vocab")

    *Parameters:*

    - ``load_from`` is the URL from which
    the widget will load its data.

    It's also possible to load data from a dynamic URL and to have dependent
    listboxes, i.e. when one changes another is reloaded::

        form['image_id'].widget = \\
            webapp.LoadableListbox(load_from="/rest/controllers/:%s/images/@vocab" % form['controller_id'].cssname)

    - if ``add_popup`` parameter is specified, a small + icon will be displayed
    next to the dropdown. Clicking on the icon will display a form which
    allows to add a new item to the list (the form needs to be configured separately)::

        form ['retailer_id'].widget = webapp.widgets.LoadableListbox(
            load_from="/rest/retailers/@vocab",
            add_popup="#/retailers/add",
        )

    - 'disabled_display' - if set to "disabled", any dependent loadables which are
    not yet loaded will be rendered as disabled Chosen selects. If omitted or set to
    "hidden", the dependent loadables will be hidden.

    - 'default_text' - placeholder displayed when nothing is selected. Defaults to "(please select)"

    """

    type = 'LoadableListbox'
    template = 'field.LoadableListbox'

    def __init__(self, **k):
        self.load_from = k.pop('load_from', '')
        self.add_popup = k.pop('add_popup', '')
        self.disabled_display = k.pop('disabled_display', '')
        self.multiselect = k.pop('multiselect', False)
        self.default_text = k.pop('default_text', '(please select)')

        Widget.__init__(self, **k)


class FieldsetSwitcher(SelectChoice):
    """
    A listbox which will switch subforms based on which item is selected::

        form['connection_method'].widget = \\
            webapp.widgets.FieldsetSwitcher((
            ('ssh', 'Use the main server''s SSH connection'),
            ('https', 'Connect via HTTPS'),
            ('http', 'Connect via HTTP'),
        ))

    The widget above will show a subform named "http" and hide all the other subforms when 'Connect via HTTP' is selected etc.
    """

    type = 'FieldsetSwitcher'
    template = 'field.FieldsetSwitcher'


class Calendar(Widget):
    """
    An input field with a JQuery UI datepicker widget linked to it::

        form['renewal_date'].widget = webapp.widgets.Calendar()

    The widget is designed to work with schemaish.Date field
    """

    type = 'Calendar'
    template = 'field.Calendar'

    def __init__(self, **k):
        #self.load_from = k.pop('load_from', '')

        Widget.__init__(self, **k)

#class Input(Widget):
    #"""
    #"""

    #type = 'Input'
    #template = 'field.Input'


class Tabular(SequenceDefault):
    """
    Tabular widget for a sequence
    """
    type = 'Tabular'
    template = 'tabular.-'

    def child_schema_as_a_row(self, field):

        child_schema = field
        output = ['<tr id="%s--field" class="%s sequenceItem">' % (field.cssname, field.classes)]
        for f in child_schema.fields:
            output.append('<td style="%s" id="%s--field" class="%s">%s</td>' % (self.column_visibility(f), f.cssname, f.classes, f.inputs()))

        output.append("""<td class="field">
            <input type="hidden" class="deletedMarker" name="{f.name}.__delete__" id="{f.cssname}-__delete__" value="" />
            <input type="hidden" class="newMarker" name="{f.name}.__new__" id="{f.cssname}-__new__" value="" />{seqdelete}</td>""".format(f=field, seqdelete=field.seqdelete()))
        output.append('</tr>')

        return "".join(output)

    def column_visibility(self, field):
        """
        Checks if the column is hidden and outputs a bit of css to hide it
        """

        # field.widget is a BoundWidget instance here, and it has .widget attribute
        if isinstance(field.widget.widget, Hidden):
            return "display: none"
        return ""


class AutoFillDropdown(LoadableListbox):
    """
        Widget to be used with a subform that when a value is selected
        from a dropdown box it will fill the subform with the information
        from the selected dropdown
    """

    type = 'AutoFillDropdown'
    template = "field.AutoFillDropdown"

    def __init__(self, **k):
        """
        dependent_fields is a comma-separated list of fields to be pre-filled
        """
        self.dependent_fields = k.pop('dependent_fields', '')
        #self.form_load_from = k.pop('form_load_from', '')
        super(AutoFillDropdown, self).__init__(**k)


class CombinationField(Widget):
    """
        Widget that makes a combination of two different fields
        on a form and sends it off as a different field name
        as a hidden value.
        eg:
        <input type="text" name="domain_name" value="foobar"/>
        <select name="suffix">
            <option value=".com.au">.com.au</option>
            <option value=".net.au">.net.au</option>
        </select>
        <input type="hidden" name="name" value="foobar.com.au" />
    """

    type = 'CombinationField'
    template = "field.CombinationField"

    def __init__(self, **k):
        self.combination_fields = k.pop('combination_fields', '')
        super(CombinationField, self).__init__(**k)


class PhoneNumber(StructureDefault):
    """
    Widget in a similar fashion to a combination of fields
    i.e it'll retrieve the information from field of some sort and do shit with it yaaaay
    """
    type = 'PhoneNumber'
    template = 'phonenumber.-'

    def __init__(self, **k):
        self.show_extension = k.pop('show_extension', '')
        super(PhoneNumber, self).__init__(**k)

