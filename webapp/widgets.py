"""
Commonly needed form widgets.
"""

__all__ = ['LoadableListbox']

from convertish.convert import string_converter, \
        datetuple_converter,ConvertError
from schemaish.type import File as SchemaFile
import uuid

from formish import util
from formish.filestore import CachedTempFilestore
from validatish import Invalid

from formish.widgets import Widget



class LoadableListbox(Widget):
    """
    Basic input widget type, used for text input
    """

    type = 'LoadableListbox'
    template = 'field.LoadableListbox'

    def __init__(self, **k):
        self.load_from = k.pop('load_from', '')
        Widget.__init__(self, **k)
        #if not self.converter_options.has_key('delimiter'):
        #    self.converter_options['delimiter'] = ','

    #def from_request_data(self, field, request_data):
        #"""
        #Default to stripping whitespace
        #"""
        #if self.strip is True:
            #request_data = [request_data[0].strip()]
        #return super(Input, self).from_request_data(field, request_data)

    #def __repr__(self):
        #attributes = []
        #if self.strip is False:
            #attributes.append('strip=%r'%self.strip)
        #if self.converter_options != {'delimiter':','}:
            #attributes.append('converter_options=%r'%self.converter_options)
        #if self.css_class:
            #attributes.append('css_class=%r'%self.css_class)
        #if self.empty is not None:
            #attributes.append('empty=%r'%self.empty)

        #return 'formish.%s(%s)'%(self.__class__.__name__, ', '.join(attributes))

