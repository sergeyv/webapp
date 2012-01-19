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


class DataFormatReadWrite(DataFormatReader, DataFormatWriter):
    pass


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


    def get_items_listing(self, request, filter_condition=None):
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
        In case of `vocab` format the result is simpler::

            {
                'items': [(id, name), (id, name), (id, name)]
            }

        Also, batching is not applied in case of the `vocab` format.
        """

        collection = self.__parent__
        #format = request.GET.get('format', 'listing')

        order_by = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', None)


        # TODO: CHECK IF THERE'S A HOOK ON THE SCHEMA ?
        # See if a subclass defines a hook for processing this format
        #resource = collection.wrap_child(self.create_transient_subitem(), name="empty")

        #hook_name = "serialize_sequence_%s" % format
        #meth = getattr(resource, hook_name, None)
        #if meth is not None:
        #    return meth()

        # Proceed with the standard processing
        if order_by is not None:
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by


        data = {}

        query = collection.get_items_query(filter_condition=filter_condition, order_by=order_by)


        # CUSTOM QUERY MODIFIER
        ### An initial approach to be able to specify some hooks in the subclass
        ### so the client can invoke a filtering method by querying a special url:
        ### /rest/collection?format=aaa&filter=min_clients&filter_params=5
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

    def listing(self, request):
        #resource = self.__parent__
        #structure = self.structure

        return self.get_items_listing(request)
        #raise NotImplementedError("IMPLEMENT ME")
        #return _default_item_deserializer(model, structure, params, request)
