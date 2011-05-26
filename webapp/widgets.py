"""
Commonly needed form widgets.
"""

__all__ = ['LoadableListbox', 'FieldsetSwitcher', 'Calendar', 'Input']

from convertish.convert import string_converter, \
        datetuple_converter,ConvertError
from schemaish.type import File as SchemaFile
import uuid


from formish import util
from formish.filestore import CachedTempFilestore

from formish.widgets import Widget, SelectChoice, SequenceDefault, StructureDefault, Hidden




class LoadableListbox(Widget):
    """
    A listbox which loads its data from an external URL as json::

        def augment_form(self, form):
            form['controller_id'].widget = \\
                webapp.LoadableListbox(load_from="/rest/controllers?format=vocab")

    the only parameter is ``load_from``, which is the URL from which
    the widget will load its data.

    It's also possible to load data from a dynamic URL and to have dependent
    listboxes, i.e. when one changes another is reloaded::

        form['image_id'].widget = \\
            webapp.LoadableListbox(load_from="/rest/controllers/:%s/images?format=vocab" % form['controller_id'].cssname)

    if ``add_popup`` parameter is specified, a small + icon will be displayed
    next to the dropdown. Clicking on the icon will display a form which
    allows to add a new item to the list (the form needs to be configured separately)::

        form ['retailer_id'].widget = webapp.widgets.LoadableListbox(
            load_from="/rest/retailers?format=vocab",
            add_popup="#/retailers/add",
        )

    """

    type = 'LoadableListbox'
    template = 'field.LoadableListbox'

    def __init__(self, **k):
        self.load_from = k.pop('load_from', '')
        self.add_popup = k.pop('add_popup', '')

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