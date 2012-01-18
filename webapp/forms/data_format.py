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


class IDataFormatReader(IDataFormat):
    """ """


class IDataFormatWriter(IDataFormat):
    """ """


class IDataFormatLister(IDataFormat):
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


def _default_item_deserializer(model, schema, params, request):

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

    def _save_structure(item, schema, data):

        attrs = schema.attrs

        print "SAVING %s INTO %s USING %s" % (data, item, schema)
        flattened = getattr(schema, "__flatten_subforms__", [])

        for (name, attr) in attrs:
            value = data.get(name, _marker)
            if value is _marker:
                print "### No data passed for attr %s <%s>" % (name, data)
                continue

            # Nested structures
            if isinstance(attr, sc.Structure):
                print "STRUCTURE!"
                subschema = attr
                if name in flattened:
                    # Flattened subforms are saved directly into the item
                    _save_structure(item, subschema, value)
                else:

                    # AutoFillDropdown requires the serializer
                    # to flush the session session before serializing sequences
                    # to load subobjects which were just linked to our item
                    # Example:
                    #     item.client_id =  123
                    #     ... need to flush the session here so item.client is loaded
                    #     item.client.name = "Client One"

                    session = sa.orm.object_session(item)
                    session.flush()

                    subitem = getattr(item, name, None)
                    print "SUBITEM: %s" % (value)
                    if subitem is None:
                        # Do not create a subitem if all data fields are empty
                        # - this may not work with defaults
                        if _all_data_fields_are_empty(value):
                            continue

                        cls = _get_attribute_class(item, name)
                        subitem = cls()
                        setattr(item, name, subitem)
                    _save_structure(subitem, subschema, value)

            # Sequences of structures
            elif isinstance(attr, sc.Sequence):
                #collection = getattr(item, name)
                #subitems_cls = _get_attribute_class(item, name)
                # __getitem__ takes care about inserting a collection
                # into the traversal context etc.
                collection = self[name]
                _save_sequence(collection, attr.attr, value)


            # Simple attributes
            elif isinstance(attr, sc.String):
                # Convert empty strings to NULLs
                # - otherwise it fails with empty values
                # in enums
                if value == '':
                    value = None

                setattr(item, name, value)
            elif isinstance(attr, sc.Integer):
                if value:
                    setattr(item, name, int(value))
                else:
                    setattr(item, name, None)
            elif isinstance(attr, sc.Decimal):
                if value:
                    setattr(item, name, Decimal(value))
                else:
                    setattr(item, name, None)

            elif isinstance(attr, sc.Date):
                if value:
                    # TODO: Need to improve this. Use dateutil?
                    value = value.split('T')[0]  # strip off the time part
                    d = datetime.strptime(value, "%Y-%m-%d")
                else:
                    d = None
                setattr(item, name, d)
            elif isinstance(attr, sc.DateTime):
                if value:
                    # TODO: proper format here
                    dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
                else:
                    dt = None
                setattr(item, name, dt)
            elif isinstance(attr, sc.Boolean):
                if str(value).lower() in ('true', 'yes', '1'):
                    value = True
                elif str(value).lower() in ('false', 'no', '0'):
                    value = False
                else:
                    if value == '':
                        value = None
                    if value is not None:
                        raise AttributeError("Wrong boolean value for %s: %s" % (name, value))

                setattr(item, name, value)

            else:
                raise AttributeError("Don't know how to deserialize attribute %s of type %s" % (name, attr))

    def _save_sequence(collection, schema, data):

        existing_items = {str(item.model.id): item for item in collection.get_items()}

        #seen_ids = []
        ids_to_delete = []

        print "EXISTING ITEMS: %s" % (existing_items,)
        for (order_idx, value) in data.items():
            if order_idx == '*':
                continue
            # the data must contain 'id' parameter
            # if the data should be saved into an existing item
            item_id = value.get('id', None)
            print "PROCESSING ITEM %s" % item_id

            if value.get('__delete__', False):
                # Existing item must be deleted
                ids_to_delete.append(item_id)
                print "WILL_BE_DELETED: %s" % item_id

            else:
                item = existing_items.get(item_id, None)
                del value['id']
                value['__schema__'] = schema
                if item is not None:
                    # update an existing item
                    #seen_ids.append(str(item_id))
                    item.update(value, request)
                else:
                    if value.get('__new__', False):
                        # create a new item
                        item = collection.create_subitem(params=value, request=request, wrap=True)
                    else:
                        # Item has not been found and the client does not indicate
                        # that it's a new item - something is wrong
                        raise ValueError("Nowhere to save data: %s" % (value,))


        #ids_to_delete = [id for id in existing_items.keys() if id not in seen_ids]
        print "DELETING: %s" % ids_to_delete
        collection.delete_subitems(ids_to_delete, request)


    #schema = params.get('__schema__')
    #form_name = schema.__class__.__name__

    #if schema is None:
    #    form_name = params.get('__formish_form__')
    #    schema = self._find_schema_for_data_format(form_name)


    _save_structure(model, schema, params)


class DataFormatBase(object):

    def __init__(self, structure):

        self.structure = structure

    def __call__(self):
        return self.__class__(structure=self.structure)


class DataFormatReader(DataFormatBase):
    implements(IDataFormatReader)

    def serialize(self):
        # our parent is a Resource
        model = self.__parent__.model
        structure = self.structure
        return _default_item_serializer(model, structure)


class DataFormatWriter(DataFormatBase):
    implements(IDataFormatWriter)

    def deserialize(self, params, request):
        model = self.__parent__.model
        structure = self.structure
        return _default_item_deserializer(model, structure, params, request)


class DataFormatLister(DataFormatBase):
    implements(IDataFormatLister)

    def listing(self, params, request):
        model = self.__parent__.model
        structure = self.structure
        raise NotImplementedError("IMPLEMENT ME")
        #return _default_item_deserializer(model, structure, params, request)
