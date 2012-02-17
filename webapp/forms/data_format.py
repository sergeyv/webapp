from datetime import datetime
import json
import cgi
import transaction
from zope.interface import Interface, implements

import schemaish as sc
import dottedish
import sqlalchemy as sa

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


class IDataFormatCreator(IDataFormat):
    """ """

_marker = []


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

        # Allow to specify callbacks defined on schema
        # to serialize specific attributes
        if hasattr(structure, 'serialize_' + name):
            meth = getattr(structure, 'serialize_' + name)
            value = meth(item)
        else:
            value = getattr(item, name, default)
        #structure_field = getattr(structure, name, default)


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
                if value is not None:
                    value = str(value)
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

        # Escape HTML tags!
        if isinstance(value, basestring):
            value = cgi.escape(value)

        data[name] = value

    print "EXTRACTED DATA: %s" % data
    return data


def _save_sequence(collection, schema, data, request):

    existing_items = {str(item.model.id): item for item in collection.get_items()}

    #seen_ids = []
    ids_to_delete = []

    # Manually create a Writer to serialize each individual item
    fmt = DataFormatWriter(structure=schema)
    fmt.__name__ = "@edit"


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

    print "DELETING: %s" % ids_to_delete
    collection.delete_subitems(ids_to_delete, request)


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


def _save_structure(resource, schema, data, request):

    attrs = schema.attrs

    model = resource.model

    print "SAVING %s INTO %s USING %s" % (data, model, schema)
    flattened = getattr(schema, "__flatten_subforms__", [])

    for (name, attr) in attrs:
        value = data.get(name, _marker)
        if value is _marker:
            print "### No data passed for attr %s <%s>" % (name, data)
            continue

        if hasattr(schema, 'deserialize_' + name):
            # Support for deserialization hooks for individual attributes
            meth = getattr(schema, 'deserialize_' + name)
            meth(model, value)
        elif isinstance(attr, sc.Structure):
            # Nested structures
            print "STRUCTURE!"
            subschema = attr
            if name in flattened:
                # Flattened subforms are saved directly into the model
                _save_structure(resource, subschema, value, request)
            else:

                # AutoFillDropdown requires the serializer
                # to flush the session session before serializing sequences
                # to load subobjects which were just linked to our model
                # Example:
                #     model.client_id =  123
                #     ... need to flush the session here so model.client is loaded
                #     model.client.name = "Client One"

                session = sa.orm.object_session(model)
                session.flush()

                submodel = getattr(model, name, None)
                print "SUBmodel: %s" % (value)
                if submodel is None:
                    # Do not create a submodel if all data fields are empty
                    # - this may not work with defaults
                    if _all_data_fields_are_empty(value):
                        continue

                    cls = _get_attribute_class(model, name)
                    submodel = cls()
                    setattr(model, name, submodel)
                subresource = resource.wrap_child(submodel, name=name)
                _save_structure(subresource, subschema, value, request)

        # Sequences of structures
        elif isinstance(attr, sc.Sequence):
            #collection = getattr(model, name)
            #submodels_cls = _get_attribute_class(model, name)
            # __getmodel__ takes care about inserting a collection
            # into the traversal context etc.

            ### Sequence saving is meant to operate in the context of
            ### the Resource - create a collection and use it for saving
            from webapp.rest import RestCollection

            collection = RestCollection(name, name)  # model[name]
            collection.__parent__ = resource

            #collection.__data_formats__ = {
            #    'edit': DataFormatWriter
            #}
            _save_sequence(collection, attr.attr, value, request)


        # Simple attributes
        elif isinstance(attr, sc.String):
            # Convert empty strings to NULLs
            # - otherwise it fails with empty values
            # in enums
            if value == '':
                value = None

            setattr(model, name, value)
        elif isinstance(attr, sc.Integer):
            if value:
                setattr(model, name, int(value))
            else:
                setattr(model, name, None)
        elif isinstance(attr, sc.Decimal):
            if value:
                setattr(model, name, Decimal(value))
            else:
                setattr(model, name, None)

        elif isinstance(attr, sc.Date):
            if value:
                # TODO: Need to improve this. Use dateutil?
                value = value.split('T')[0]  # strip off the time part
                d = datetime.strptime(value, "%Y-%m-%d")
            else:
                d = None
            setattr(model, name, d)
        elif isinstance(attr, sc.DateTime):
            if value:
                # TODO: proper format here
                dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
            else:
                dt = None
            setattr(model, name, dt)
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

            setattr(model, name, value)

        else:
            raise AttributeError("Don't know how to deserialize attribute %s of type %s" % (name, attr))


def _default_item_deserializer(resource, schema, params, request):

    _save_structure(resource, schema, params, request)


class DataFormatBase(object):

    __allow_loadable__ = False

    def __init__(self, structure):

        self.structure = structure

    def __call__(self):
        return self.__class__(structure=self.structure)

    def __repr__(self):
        if hasattr(self,'structure'):
            return "<%s wrapping %s>" % (self.__class__.__name__, repr(self.structure))
        else:
            return "<%s wrapping >" % self.__class__.__name__

    @property
    def __acl__(self):
        return getattr(self.structure, '__acl__', [])


class DataFormatReader(DataFormatBase):
    implements(IDataFormatReader)

    def serialize(self, request):
        # our parent is a Resource
        model = self.__parent__.model
        structure = self.structure
        return _default_item_serializer(model, structure)

    def read(self, request):

        structure = self.structure

        # Structure can completely override the default logic
        if hasattr(structure, "read"):
            return structure.read(self, request)

        import webapp

        session = webapp.get_session()
        session.autoflush = False

        set_field = request.GET.get('set_field', None)
        if set_field is not None:
            set_value = request.GET.get('set_value', None)
            if set_value:
                # or use the deserialization machinery here?
                setattr(context.model, set_field, int(set_value))
                session.flush()

        only_fields = request.GET.get('only', None)
        if only_fields is not None:
            only_fields = [f.strip() for f in only_fields.split(',')]

        data = self.serialize(request)
        transaction.abort()
        return data


class DataFormatWriter(DataFormatBase):
    implements(IDataFormatWriter)

    __allow_loadable__ = True

    def deserialize(self, params, request):
        resource = self.__parent__
        structure = self.structure
        return _default_item_deserializer(resource, structure, params, request)


    def update(self, request):
        """
        Serializes the data from request into the resource
        (which is our parent here), checking if any hooks exist on
        the structure and on the resource and calling them if the exist.
        """

        resource = self.__parent__
        structure = self.structure

        # Structure can completely override the default logic
        if hasattr(structure, "update"):
            return structure.update(self, request)

        if hasattr(structure, "before_item_updated"):
            structure.before_item_updated(self, request)

        if hasattr(resource, "before_item_updated"):
            resource.before_item_updated(self, request)

        # Formish uses dotted syntax to deal with nested structures
        # we need to unflatten it
        params = request.json_body
        params = dottedish.api.unflatten(params.items())
        self.deserialize(params, request)

        #Flush session so changes have been applied
        # before we call the after context hook
        sa.orm.object_session(resource.model).flush()

        if hasattr(structure, "after_item_updated"):
            structure.after_item_updated(self, request)

        if hasattr(resource, "after_item_updated"):
            resource.after_item_updated(self, request)

        return {'item_id': resource.model.id}


class DataFormatCreator(DataFormatReader):
    """
    A data format which can create subitems in a collection.
    It also implements IDataFormatReader because the client needs
    to be able to load defaults etc.
    """
    implements(IDataFormatReader, IDataFormatCreator)

    __allow_loadable__ = True

    def serialize(self, request):
        # our parent is a Collection
        collection = self.__parent__
        model = collection.create_transient_subitem()
        structure = self.structure
        return _default_item_serializer(model, structure)

    def create_and_deserialize(self, params, request):
        """
        Creates an item and sets data passed in params
        """
        # our parent is a Collection

        structure = self.structure
        #return _default_item_deserializer(self.model, structure, params, request)
        collection = self.__parent__

        def _setter(resource):
            _default_item_deserializer(resource, structure, params, request)

        return collection.create_subitem(setter_fn=_setter, wrap=True)


    def create(self, request):
        """
        """

        structure = self.structure

        # Structure can completely override the default logic
        if hasattr(structure, "create"):
            return structure.create(self, request)

        params = json.loads(request.body)
        params = dottedish.api.unflatten(params.items())

        if hasattr(self.structure, "before_item_created"):
            self.structure.before_item_created(params, request)

        resource = self.create_and_deserialize(params, request)

        if hasattr(self.structure, "after_item_created"):
            self.structure.after_item_created(resource, request)

        if hasattr(resource, "after_item_created"):
            resource.after_item_created(self, request)

        return {'item_id': resource.model.id}


class DataFormatReadWrite(DataFormatReader, DataFormatWriter):
    implements(IDataFormatReader, IDataFormatWriter)

    __allow_loadable__ = True


class DataFormatLister(DataFormatBase):
    implements(IDataFormatLister)


    def _add_filters(self, query, request):
        """
        Add filter criteria to the query if there are `filter-<xxx>`
        parameters in the request
        """
        collection = self.__parent__

        model_class = collection.get_subitems_class()
        filter_values = []
        # NOTE: this should use collection.filter_fields as a basis
        # so it's not possible to filter by fileds not
        # explicitly listed in that property.
        for f in collection.filter_fields:
            val = request.GET.get("filter-%s" % f, None)
            if val:
                filter_values.append({'key': f, 'value': val})

        for f in filter_values:
            field = getattr(model_class, f['key'])
            if isinstance(field.impl.parent_token, sa.orm.properties.ColumnProperty):
                # The attribute is a simple column
                query = query.filter(field == f['value'])
            else:
                # The attribute is not a simple column so we suppose it's
                # a relation. TODO: we may need a better check here
                rel_class = collection.get_class_from_relation(field)
                if not isinstance(rel_class, type):
                    rel_class = rel_class.__class__

                id_attr = getattr(rel_class, 'id')

                query = query.join(rel_class).filter(id_attr == f['value'])

        return query

    def _add_search(self, query, request):
        """
        Adds a search criteria to the query if there's `search`
        parameter in the request
        """

        collection = self.__parent__

        model_class = collection.get_subitems_class()
        search_criterion = request.GET.get('search', None)
        # TODO: LIKE parameters need escaping. Or do they?
        if search_criterion:
            # search_fields is a tuple of fiels names
            #which need to be searched
            criteria = []
            for field_name in collection.search_fields:
                field_obj = getattr(model_class, field_name, None)
                if field_obj is not None:
                    criteria.append(field_obj.ilike('%' + search_criterion + '%'))
            query = query.filter(sa.sql.expression.or_(*criteria))
        return query


    def get_items_listing(self, request):
        """
        Understands the following request parameters:

            - filter-<field-name>:<value> - only return results where
              `field-name` == `value`. Works for simple relations, i.e.
              filter-client=49. (49 is client's `id` field, and this is
              hard-coded at the moment). The field must be listed in  the
              subclass's filter_fields property, which is a tuple.

            - search=<sometext> - return results where one of the fields listed
              in search_fields tuple (default - search_fields = ('name',)) is matched
              using SQL LIKE operator

            - meth=<methodname> - a subclass can define a method filter_methodname
              which is getting passed the query object and request, which can make some
              modifications of the query::

                  class CompaniesCollection(...):
                      def filter_has_vip_clients(self, query, request):
                          return query.filter(Client.company_id==Company.id)\
                              .filter(Client.is_vip==True)

              then the client will be able to use this filter by specifying &meth=is_vip in the URL

            - sort_on
            - sort_order
            - batch_size
            - batch_start

        Returns a dictionary in the following format::
            {
                'items': [{...}, {...}, {...}],
                'total_count': 123, # the total numbers of items matching the current query, without batching
                'has_more': True, # True if there are more items than returned (i.e. batching has limited the result)
                'next_batch_start': 123 # the start of the next batch sequence
            }
        """

        collection = self.__parent__
        #format = request.GET.get('format', 'listing')

        order_by = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', None)

        # Proceed with the standard processing
        if order_by is not None:
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by


        data = {}

        query = collection.get_items_query(order_by=order_by)


        # CUSTOM QUERY MODIFIER
        ### An initial approach to be able to specify some hooks in the subclass
        ### so the client can invoke a filtering method by querying a special url:
        ### /rest/collection/@aaa&filter=min_clients&filter_params=5
        ### would look for a method named 'filter_min_client' which is supposed
        ### to return an SA clause element suitable for passing to .filter()
        filter_meth_name = request.GET.get('meth', None)
        if filter_meth_name:
            # filter_param = request.get('param', None)
            meth = getattr(self, 'filter_' + filter_meth_name)
            query = meth(query, request)



        # FILTERING
        query = self._add_filters(query, request)

        # SEARCH
        query = self._add_search(query, request)


        ### VOCABS - if the format is vocab we abort early since
        ### we don't want/need batching
        ### 'vocab' format is a special (simplified) case
        ### - returns {'items': [(id, name), (id, name), ...]}
        if format == 'vocab':
            # items = self.get_items(order_by=order_by, wrap=False)
            items = query.all()
            result = [(item.id, str(item)) for item in items]
            return {'items': result}


        ## Now we have a full query which would retrieve all the objects
        ## We are using it to get count of objects available using the current
        ## filter settings
        count = query.count()
        data['total_count'] = count

        # BATCH
        # query = self._add_batch(query, request)
        batch_size = request.GET.get('batch_size', collection.DEFAULT_RECORDS_PER_BATCH)
        batch_size = int(batch_size)
        batch_size = max(batch_size, collection.MIN_RECORDS_PER_BATCH)
        batch_size = min(batch_size, collection.MAX_RECORDS_PER_BATCH)
        batch_start = int(request.GET.get('batch_start', 0))

        # Limit the result set to a single batch only
        # request one record more than needed to see if there are
        # more records
        query = query.offset(batch_start).limit(batch_size + 1)


        # query all the items
        items = query.all()

        if len(items) > batch_size:
            data['has_more'] = True
            data['next_batch_start'] = batch_start + batch_size

        result = []

        # # wrap SA objects
        # items = [collection.wrap_child(model=model, name=str(model.id)) for model in items]

        # # serialize the results
        # for item in items:
        #     i = item.serialize(format=format)
        #     result.append(i)

        for model in items:
            i = _default_item_serializer(model, self.structure)
            result.append(i)

        # except AttributeError, e:
        #     raise

        ### FOR DEBUG REASONS
        data['query'] = str(query)

        data['items'] = result
        return data



class VocabLister(DataFormatLister):
    """
    In case of `vocab` format the result is simpler::

        { 'items': [(id, name), (id, name), (id, name)] }

    Also, batching is not applied in case of the `vocab` format.

    """
    implements(IDataFormatLister)

    def __init__(self, dummy=None):
        pass

    def get_items_listing(self, request):

        collection = self.__parent__
        order_by = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', None)

        # Proceed with the standard processing
        if order_by is not None:
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by

        data = {}
        query = collection.get_items_query(order_by=order_by)
        # CUSTOM QUERY MODIFIER
        ### An initial approach to be able to specify some hooks in the subclass
        ### so the client can invoke a filtering method by querying a special url:
        ### /rest/collection/@aaa&filter=min_clients&filter_params=5
        ### would look for a method named 'filter_min_client' which is supposed
        ### to return an SA clause element suitable for passing to .filter()
        filter_meth_name = request.GET.get('meth', None)
        if filter_meth_name:
            meth = getattr(collection, 'filter_' + filter_meth_name)
            query = meth(query, request)

        # FILTERING
        query = self._add_filters(query, request)

        # SEARCH
        query = self._add_search(query, request)

        ### 'vocab' format is a special (simplified) case
        ### - returns {'items': [(id, name), (id, name), ...]}
        items = query.all()
        result = [(item.id, str(item)) for item in items]
        return {'items': result}

