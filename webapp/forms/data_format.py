import schemaish as sc

from zope.interface import Interface
from zope.interface import implements
# from zope.interface import providedBy

import cgi
from webapp.forms import Literal
from webapp import DynamicDefault
from webapp.exc import WebappError


class IDataFormat(Interface):
    """ """


def _default_item_serializer(item, structure, only_fields=None):

    data = {}
    default = object()

    flattened = getattr(structure, "__flatten_subforms__", [])

    # print "FLATTENED: %s (%s)" % (flattened, structure)

    for (name, structure_field) in structure.attrs:

        # the client is not interested in this field, skip
        if (only_fields is not None) and (name not in only_fields):
            print "SKIPPING FIELD %s" % name
            continue


        value = getattr(item, name, default)
        #structure_field = getattr(structure, name, default)

        # print "Starting with %s of %s" % (name, item)


        if name in flattened:
            # This is to support __flatten_subforms__ attrubute of a schema
            # - we may choose to build a form from several sc.Structure blocks to separate the data logically (and visually) but still
            # be able to save it as it was a sigle flat form
            print "FLAT!"
            value = _default_item_serializer(item, structure_field)
        elif value is not default:

            # if it's a callable then call it
            # (using @property to imitate an attribute
            # is not cool because it swallows any exceptions
            # and just pretends there's no such property)
            if callable(value):
                value = value()

            # Recursively serialize lists of subitems
            if isinstance(structure_field, sc.Sequence):
                print "SERIALIZING A SEQUENCE: %s -> %s" % (name, structure_field)

                subitems_schema = structure_field.attr
                subitems = []
                for subitem in value:  # take care not to name it "item" or it'll override the function-wide variable
                    subitems.append(_default_item_serializer(subitem, subitems_schema))
                value = subitems
            elif isinstance(structure_field, sc.Structure):
                print "SERIALIZING A STRUCTURE: %s -> %s" % (name, structure_field)
                subitems_schema = structure_field
                value = _default_item_serializer(value, subitems_schema)
            elif isinstance(structure_field, sc.String):
                #print "SERIALIZING A STRING ATTRIBUTE: %s -> %s" % (name, structure_field)
                if value is not None:
                    value = str(value)
            elif isinstance(structure_field, sc.Integer):
                #print "SERIALIZING AN INTEGER ATTRIBUTE: %s -> %s" % (name, structure_field)
                if value is not None:
                    value = int(value)
            elif isinstance(structure_field, sc.Decimal):
                #print "SERIALIZING A DECIMAL ATTRIBUTE: %s -> %s" % (name, structure_field)
                if value is not None:
                    value = float(value)
            elif isinstance(structure_field, sc.Boolean):
                #print "SERIALIZING A BOOLEAN ATTRIBUTE: %s -> %s" % (name, structure_field)
                if value is not None:
                    value = bool(value)
            elif isinstance(structure_field, sc.Date):
                #print "SERIALIZING A DATE ATTRIBUTE: %s -> %s = %s" % (name, structure_field, value)
                pass
            elif isinstance(structure_field, sc.DateTime):
                #print "SERIALIZING A DATETIME ATTRIBUTE: %s -> %s" % (name, structure_field)
                pass
            elif isinstance(structure_field, Literal):
                #print "SERIALIZING A LITERAL ATTRIBUTE: %s -> %s" % (name, structure_field)
                pass
            else:
                raise WebappError("Don't know how to serialize attribute '%s' of type '%s' with value '%s'" % (name, structure_field, value))
        else:
            value = None

        # If the model does not provide a value, use
        # form's default
        if value is None:
            value = getattr(structure_field, 'default', None)

            if isinstance(value, DynamicDefault):
                value = value(item, name)

        # Escape HTML tags!
        if isinstance(value, basestring):
            value = cgi.escape(value)

        data[name] = value

    print "EXTRACTED DATA: %s" % data
    return data



class DataFormat(sc.Structure):
    implements(IDataFormat)

    def serialize(self):
        # our parent is a Resource
        model = self.__parent__.model
        return _default_item_serializer(model, self)
