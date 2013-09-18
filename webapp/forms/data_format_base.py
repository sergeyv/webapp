#!/usr/bin/env python
# -*- coding: utf-8 -*-

import cgi
from datetime import datetime
from decimal import Decimal

import schemaish as sc
import sqlalchemy as sa

from webapp import DynamicDefault
from webapp.forms import Literal
from webapp.exc import WebappError

_marker = []

from .fields import SafeHTML


def _all_data_fields_are_empty(value):
    """
    Returns True if all fields of a dict are false-y
    """
    if not value:
        return True
    for v in value.values():
        if v:
            return False

    return True


def _get_attribute_class(item, name):
    """
    nicked from crud - returns an SA relation given an attribute name
    """
    relation = getattr(item.__class__, name)
    arg = relation.property.argument
    if callable(arg):
        related_class = arg()
    else:
        related_class = arg.class_
    return related_class


def _save_sequence(collection, schema, data, request):

    existing_items = {}
    for item in collection.get_items():
        existing_items[str(item.model.id)] = item

    #seen_ids = []
    ids_to_delete = []

    from .data_format import DataFormatWriter

    # Manually create a Writer to serialize each individual item
    fmt = DataFormatWriter(structure=schema)
    fmt.__name__ = "@edit"

    for (order_idx, value) in data.items():
        if order_idx == '*':
            continue
        # the data must contain 'id' parameter
        # if the data should be saved into an existing item
        item_id = value.get('id', None)
        #print "PROCESSING ITEM %s" % item_id

        if value.get('__delete__', False):
            # Existing item must be deleted
            ids_to_delete.append(item_id)
            #print "WILL_BE_DELETED: %s" % item_id

        else:
            item = existing_items.get(item_id, None)
            del value['id']
            value['__schema__'] = schema
            if item is not None:
                # insert the writer into the traversal context
                fmt.__parent__ = item
                fmt.deserialize(value, request)
            else:
                if value.get('__new__', False):
                    def _setter(resource):
                        # a callback is called from create_subitem after
                        # the item was created but before it was flushed
                        fmt.__parent__ = resource
                        fmt.deserialize(value, request)
                    item = collection.create_subitem(setter_fn=_setter, wrap=True)
                else:
                    # Item has not been found and the client does not indicate
                    # that it's a new item - something is wrong
                    raise ValueError("Nowhere to save data: %s" % (value,))

    #print "DELETING: %s" % ids_to_delete
    collection.delete_subitems(ids_to_delete, request)


class DataFormatBase(object):

    __allow_loadable__ = False

    def __init__(self, structure):

        self.structure = structure

    def __call__(self):
        return self.__class__(structure=self.structure)

    def __repr__(self):
        if hasattr(self, 'structure'):
            return "<%s wrapping %s>" % (self.__class__.__name__, repr(self.structure))
        else:
            return "<%s wrapping >" % self.__class__.__name__

    def get_acl(self):

        # raises AttributeError if the __acl__ does not exist
        acl = self.structure.__acl__

        if callable(acl):
            return acl(self)
        return acl

    def get_local_roles(self, request):
        """
        Return structure's local roles - if the method does not exist
        the access will raise AttributeError which will signal the callee
        to proceed up the traversal chain
        """
        return self.structure.get_local_roles(self, request)

    def _type_deserialize_string(self, value):
        # Convert empty strings to NULLs
        # and prevent storing None as 'None' string
        # - otherwise it fails with empty values
        # in enums
        if not value:
            return None

        value = cgi.escape(value)
        # SA presents values which are read from the database
        # as unicode, so setting an encoded string, while working in general,
        # fails when trying to join new and existing fields etc.
        return unicode(value)  # .encode('utf-8')

    def _type_deserialize_int(self, value):
        if value:
            return int(value)
        return None

    def _type_deserialize_decimal(self, value):
        if value:
            return Decimal(value)
        return None

    def _type_deserialize_date(self, value):
        if value:
            # TODO: Need to improve this. Use dateutil?
            value = value.split('T')[0]  # strip off the time part
            d = datetime.strptime(value, "%Y-%m-%d")
        else:
            d = None
        return d

    def _type_deserialize_datetime(self, value):
        if value:
            # Make sure the format is in sync with
            # webapp.renderers._JSONDateEncoder
            dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
        else:
            dt = None
        return dt

    def _type_deserialize_boolean(self, value):
        if str(value).lower() in ('true', 'yes', '1'):
            value = True
        elif str(value).lower() in ('false', 'no', '0'):
            value = False
        else:
            if value == '':
                value = None
            if value is not None:
                raise AttributeError("Wrong boolean value: %s" % (value))
        return value

    def _type_deserialize_html(self, value):

        return SafeHTML.clean(value)

    TYPE_SERIALIZERS_MAP = {
        sc.String: _type_deserialize_string,
        sc.Integer: _type_deserialize_int,
        sc.Decimal: _type_deserialize_decimal,
        sc.Date: _type_deserialize_date,
        sc.DateTime: _type_deserialize_datetime,
        sc.Boolean: _type_deserialize_boolean,
        SafeHTML: _type_deserialize_html,
    }

    def _save_structure(self, resource, schema, data, request):

        attrs = schema.attrs
        model = resource.model

        session = sa.orm.object_session(model)

        flattened = getattr(schema, "__flatten_subforms__", [])

        ignore_attrs = getattr(schema, '__readonly_attributes__', [])

        for (name, attr) in attrs:
            value = data.get(name, _marker)
            if value is _marker:
                ### No data passed for attr - should we ignore or raise an error?
                continue

            if name in ignore_attrs:
                continue

            if hasattr(schema, 'attr_deserialize_' + name):
                # Support for deserialization hooks for individual attributes
                meth = getattr(schema, 'attr_deserialize_' + name)
                meth(self, model, value, request)
            elif isinstance(attr, sc.Structure):
                # Nested structures
                #print "STRUCTURE!"
                subschema = attr
                if name in flattened:
                    # Flattened subforms are saved directly into the model
                    self._save_structure(resource, subschema, value, request)
                else:

                    # AutoFillDropdown requires the serializer
                    # to flush the session session before serializing sequences
                    # to load subobjects which were just linked to our model
                    # Example:
                    #     model.client_id =  123
                    #     ... need to flush the session here so model.client is loaded
                    #     model.client.name = "Client One"

                    # session = sa.orm.object_session(model)
                    # session.flush()

                    submodel = getattr(model, name, None)
                    #print "SUBmodel: %s" % (value)
                    if submodel is None:
                        # Do not create a submodel if all data fields are empty
                        # - this may not work with defaults
                        if _all_data_fields_are_empty(value):
                            continue

                        cls = _get_attribute_class(model, name)
                        submodel = cls()
                        setattr(model, name, submodel)
                    subresource = resource.wrap_child(submodel, name=name)
                    self._save_structure(subresource, subschema, value, request)

            # Sequences of structures
            elif isinstance(attr, sc.Sequence):
                # if a sequence contains just one element, we receive it as a single
                # string. We just convert it to a list then
                if isinstance(value, basestring):
                    value = [value, ]

                # When we use sc.Sequence with a multiselect widget, in only returns us
                # a list of ids, not whole objects which we need to save. This is kinda
                # "sequence without modifying the linked objects"
                if isinstance(value, list) and all([isinstance(s, basestring) for s in value]):
                    submodels_cls = _get_attribute_class(model, name)
                    items = []
                    for id in value:
                        item = session.query(submodels_cls).get(id)
                        items.append(item)

                    setattr(model, name, items)
                else:
                    ###This is a standard Sequence widget which allows to edit the linked items
                    ### Sequence saving is meant to operate in the context of
                    ### the Resource - create a collection and use it for saving
                    from webapp.rest import RestCollection

                    collection = RestCollection(name, name)  # model[name]
                    collection.__parent__ = resource

                    #collection.__data_formats__ = {
                    #    'edit': DataFormatWriter
                    #}
                    _save_sequence(collection, attr.attr, value, request)
            else:
                try:
                    meth = self.TYPE_SERIALIZERS_MAP[attr.__class__]
                    setattr(model, name, meth(self, value))
                except KeyError:
                    raise AttributeError("Don't know how to deserialize attribute %s of type %s" % (name, attr))

    def _default_item_deserializer(self, resource, schema, params, request):
        self._save_structure(resource, schema, params, request)

    def _default_item_serializer(self, item, structure, request):

        data = {}
        default = object()

        flattened = getattr(structure, "__flatten_subforms__", [])

        for (name, structure_field) in structure.attrs:

            # Allow to specify callbacks defined on schema
            # to serialize specific attributes
            if hasattr(structure, 'attr_serialize_' + name):
                meth = getattr(structure, 'attr_serialize_' + name)
                value = meth(self, item, request)
            else:
                value = getattr(item, name, default)

                if name in flattened:
                    # This is to support __flatten_subforms__ attrubute of a schema
                    # - we may choose to build a form from several sc.Structure blocks to separate the data logically (and visually) but still
                    # be able to save it as it was a sigle flat form
                    #print "FLAT!"
                    value = self._default_item_serializer(item, structure_field, request)
                elif value is not default:

                    # if it's a callable then call it
                    # (using @property to imitate an attribute
                    # is not cool because it swallows any exceptions
                    # and just pretends there's no such property)
                    if callable(value):
                        value = value()

                    # Recursively serialize lists of subitems
                    if isinstance(structure_field, sc.Sequence):
                        subitems_schema = structure_field.attr
                        subitems = []

                        # Here we only support 2 cases we're actually using:
                        # - a sequence of sc.Structure
                        # - a sequence of integers
                        ### TODOXXX: We may need to generalize this whole method
                        if isinstance(subitems_schema, sc.Structure):
                            for subitem in value:  # take care not to name it "item" or it'll override the function-wide variable
                                subitems.append(self._default_item_serializer(subitem, subitems_schema, request))
                            value = subitems

                        elif isinstance(structure_field, sc.Integer):
                            for subitem in value:
                                subitems.append(int(subitem))
                            value = subitems

                    elif isinstance(structure_field, sc.Structure):
                        #print "SERIALIZING A STRUCTURE: %s -> %s" % (name, structure_field)
                        subitems_schema = structure_field
                        value = self._default_item_serializer(value, subitems_schema, request)
                    elif isinstance(structure_field, sc.String):
                        if value is not None:
                            if isinstance(value, unicode):
                                value = value.encode('utf-8')
                            elif isinstance(value, str):
                                value = value.decode('utf-8').encode('utf-8')
                            else:
                                value = unicode(value).encode('utf-8')

                    elif isinstance(structure_field, sc.Integer):
                        if value is not None:
                            value = int(value)
                    elif isinstance(structure_field, sc.Decimal):
                        if value is not None:
                            value = float(value)
                    elif isinstance(structure_field, sc.Boolean):
                        if value is not None:
                            value = bool(value)
                    elif isinstance(structure_field, sc.Date):
                        pass
                    elif isinstance(structure_field, sc.DateTime):
                        # dates are serialized by the better_json renderer
                        pass
                    elif isinstance(structure_field, Literal):
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

            # Escape HTML tags if the name of the attribute not in __no_html_escape__
            # attribute of the structure
            #if isinstance(value, basestring) and name not in getattr(structure, '__no_html_escape__', set()):
            #    value = cgi.escape(value)

            # skip None values from the output to make the output more compact
            # this potentially may break the forms, need to check
            if value is not None or getattr(structure, '__serialize_nulls__', False):
                data[name] = value

        return data

    def serialize_item(self, item, request):
        """
        Serializes the `item` using the format's structure
        and returns the resulting dict, basically, it's a public
        interface to _default_item_serializer
        """
        return self._default_item_serializer(item, self.structure, request)
