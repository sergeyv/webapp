"""
Commonly needed form widgets.
"""

__all__ = ['LoadableListbox', 'FieldsetSwitcher', 'Calendar']

from convertish.convert import string_converter, \
        datetuple_converter,ConvertError
from schemaish.type import File as SchemaFile
import uuid

from formish import util
from formish.filestore import CachedTempFilestore

from formish.widgets import Widget, SelectChoice



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


    """

    type = 'LoadableListbox'
    template = 'field.LoadableListbox'

    def __init__(self, **k):
        self.load_from = k.pop('load_from', '')

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
