# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import cgi
from datetime import datetime, date
from decimal import Decimal


import sqlalchemy as sa
import schemaish as sc
from zope.interface import implements

import crud

from webapp.db import get_session
from webapp.forms import get_form, Literal
from webapp import DynamicDefault


class IRestRootCollection(crud.ICollection):
    pass

_marker = []


class RestSubobject(crud.Traversable):
    """
    A base class for a "virtual" subobject which has no database-level
    representation::

        class AutoresponderResource(webapp.RestSubobject):

            def serialize(self, format='default', annotate=False, only_fields=None):
                email = self.__parent__.model
                print "TADA, serialize called"
                return email.invoke_action('get_autoresponder')

            def deserialize(self, params, request):
                email = self.__parent__.model
                return invoke_action_async(email, "set_autoresponder", params)

    Then we can use it like this::

        @crud.resource(models.EmailAddress)
        class EmailAddressResource(RecordableResource):

            subsections = {
                'autoresponder': AutoresponderResource,
            }

    And finally, we can have a REST API endpoint at /rest/emails/123/autoresponder -
    a GET request would return autoresponder status, a PUT request would set autoresponder

    We can directly see and manipulate the data in a form::

        c.route("/emails/:item_id/set-autoresponder", new webapp.Form({
            title: "Set Automatic Reply",
            identifier: "EmailAddressSetAutoresponder",
            rest_service_root: "/rest/emails/:item_id/autoresponder"
        }));

    """
    implements(crud.IResource)

    def update(self, params, request):
        """
        Override the crud's method to call "item updated" hooks
        """
        self.deserialize(params, request)
        if hasattr(self, "after_item_updated"):
            self.after_item_updated(request)


class RestCollection(crud.Collection):
    """
    Just like a normal crud.Collection but
    has some additional methods expected by rest views

    rest sections need to subclass this
    """

    ### Some 'sane' defaults for an unlikely case the frontent does not tell
    ### us how much results it wants or asks for an unrelistic or stupid number
    DEFAULT_RECORDS_PER_BATCH = 50
    MIN_RECORDS_PER_BATCH = 3
    MAX_RECORDS_PER_BATCH = 400
    LIMIT_INCREMENTAL_RESULTS = 25

    filter_fields = ()

    # by default we search by 'name' field. A subclass may
    # override this setting to provide more than one field
    # which will be ORed togeter
    # i.e. ... WHERE name LIKE 'abc%' OR hostname LIKE 'abc%' ...
    search_fields = ('name',)

    def _add_filters(self, query, request):
        """
        Add filter criteria to the query if there are `filter-<xxx>`
        parameters in the request
        """

        model_class = self.get_subitems_class()
        filter_values = []
        # NOTE: this should use self.filter_fields as a basis
        # so it's not possible to filter by fileds not
        # explicitly listed in that property.
        for f in self.filter_fields:
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
                rel_class = self.get_class_from_relation(field)
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


        model_class = self.get_subitems_class()
        search_criterion = request.GET.get('search', None)
        # TODO: LIKE parameters need escaping. Or do they?
        if search_criterion:
            # search_fields is a tuple of fiels names
            #which need to be searched
            criteria = []
            for field_name in self.search_fields:
                field_obj = getattr(model_class, field_name, None)
                if field_obj is not None:
                    criteria.append(field_obj.ilike('%' + search_criterion + '%'))
            query = query.filter(sa.sql.expression.or_(*criteria))
        return query


    def get_items_listing(self, request, filter_condition=None):
        """
        Understands the following request parameters:

            - format

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

        format = request.GET.get('format', 'listing')

        order_by = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', None)


        # See if a subclass defines a hook for processing this format
        resource = self.wrap_child(self.create_transient_subitem(), name="empty")

        hook_name = "serialize_sequence_%s" % format
        meth = getattr(resource, hook_name, None)
        if meth is not None:
            return meth()

        # Proceed with the standard processing
        if order_by is not None:
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by


        data = {}

        query = self.get_items_query(filter_condition=filter_condition, order_by=order_by)


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
        batch_size = request.GET.get('batch_size', self.DEFAULT_RECORDS_PER_BATCH)
        batch_size = int(batch_size)
        batch_size = max(batch_size, self.MIN_RECORDS_PER_BATCH)
        batch_size = min(batch_size, self.MAX_RECORDS_PER_BATCH)
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

        # wrap SA objects
        items = [self.wrap_child(model=model, name=str(model.id)) for model in items]

        # try:

        # serialize the results
        for item in items:
            i = item.serialize(format=format)
            result.append(i)

        # except AttributeError, e:
        #     raise

        ### FOR DEBUG REASONS
        data['query'] = str(query)

        data['items'] = result
        return data


    def get_filters(self, request):

        data = {}

        model_class = self.get_subitems_class()

        session = get_session()

        for attribute_name in self.filter_fields:
            field = getattr(model_class, attribute_name, None)
            if field is None:

                raise AttributeError("Class %s has no attribute %s" % (model_class, attribute_name))


            if isinstance(field.impl.parent_token, sa.orm.properties.ColumnProperty):
                # The attribute is a simple column
                result = session.query(field, sa.func.count(field))\
                    .group_by(field)\
                    .order_by(field)\
                    .all()

                d = []
                for r in result:
                    d.append([str(r[0]), str(r[0]), str(r[1])])
                data[attribute_name] = d
            else:
                # The attribute is not a simple column so we suppose it's
                # a relation. TODO: we may need a better check here
                rel_class = self.get_class_from_relation(field)
                if not isinstance(rel_class, type):
                    rel_class = rel_class.__class__

                id_attr = getattr(rel_class, 'id')
                name_attr = getattr(rel_class, 'name')
                q = session.query(id_attr, name_attr, sa.func.count(model_class.id))\
                    .join(model_class)\
                    .group_by(id_attr, name_attr)\
                    .order_by(name_attr)

                #q = q.with_parent(self.model, attribute_name)
                result = q.all()
                r = []
                for item in result:
                    r.append([item.id, item.name, item[2]])
                data[attribute_name] = r

                #raise AttributeError("You're trying to order by '%s', which is not a proper column (a relationship maybe?)" % attribute_name)

        return data



    def get_empty(self, request):
        """
        Returns an empty subitem - i.e. with all fields either
        empty or set to default values
        """
        format = request.GET.get('format', 'listing')

        session = get_session()
        session.autoflush = False

        item = self.create_transient_subitem()
        session.add(item)

        resource = self.wrap_child(item, name="empty")

        set_field = request.GET.get('set_field', None)
        if set_field is not None:
            set_value = request.GET.get('set_value', None)
            if set_value:
                # or use the deserialization machinery here?
                setattr(item, set_field, int(set_value))

                # AutoFillDropdown is not compatible with models which have
                # nullable fields because to load relations we're temporariliy
                # saving the object to the database before rolling the transaction back.
                # The line below is an ugly hack to make Domain register form work.
                # TODO: Need to remove the constraint from the field.
                item.name = "xxx"
                session.flush()

        only_fields = request.GET.get('only', None)
        if only_fields is not None:
            only_fields = [f.strip() for f in only_fields.split(',')]

        data = resource.serialize(format=format, only_fields=only_fields)

        import transaction
        transaction.abort()
        return data



    def get_incremental(self, request):
        """
        Generic method for incremental search -
        requires the object to have 'name' attribute

        Returns just a list of strings
        """

        data = {}

        model_class = self.subitems_source

        query = get_session().query(model_class)


        get_id_for = request.GET.get('get_id_for', None)
        if get_id_for is not None:
            cli = query.filter(model_class.name == get_id_for).one()
            return {'id': cli.id, 'name': cli.name}

        ### Filter-able fields:
        name_filter = request.GET.get('term', None)

        # TODO: LIKE parameters need escaping
        if name_filter:
            query = query.filter(model_class.name.ilike(name_filter + '%'))

        query = query.order_by(model_class.name)

        items = query[:self.LIMIT_INCREMENTAL_RESULTS]

        result = []

        for item in items:
            i = {}
            i['id'] = item.id
            i['title'] = str(item)
            result.append(str(item))

        data = result
        return data




class RestResource(crud.Resource):
    """
    Some additional methods for formatting
    """

    @classmethod
    def _find_schema_for_data_format(cls, format):


        if isinstance(format, sc.Structure):
            return format

        schema = None

        form_name = cls.data_formats.get(format, None)
        form = None
        if form_name is not None:
            form = get_form(cls.data_formats[format])
            schema = form.structure.attr
        else:
            # A client can either pass a format name (i.e. 'add'),
            # or, as a shortcut for forms, directly the form name (i.e. 'ServerAddForm')
            # so we don't need to specify the format in the route's definition.
            # in the latter case we still want to make sure the form is listed as
            # on of our formats.
            if format in cls.data_formats.values():
                form = get_form(format)
                schema = form.structure.attr
            else:
                from crud.registry import get_resource_for_model, get_model_for_resource
                model_cls = get_model_for_resource(cls)
                for parent_class in model_cls.__bases__:
                    resource_class = get_resource_for_model(parent_class)
                    print "GOT PARENT RESOURCE: %s" % resource_class
                    if hasattr(resource_class, "_find_schema_for_data_format"):
                        schema = resource_class._find_schema_for_data_format(format)
                        if schema is not None:
                            break


                if schema is None:
                    from pyramid.httpexceptions import HTTPBadRequest
                    e = HTTPBadRequest("Format '%s' is not registered for %s" % (format, cls))
                    e.status = '444 Data Format Not Found'
                    raise e



        if schema is None:
            raise ValueError("%s form is not registered, but is listed as the"\
                " '%s' format for %s class" % (form_name, format, cls))
        return schema


    def serialize(self, format='default', annotate=False, only_fields=None):
        """
        - requires 'format' parameter - which must correspond to one of formats
          registered in `data_formats` property. This will determine which
          fields will be serialized

        - optionally takes an "annotate" parameter - in this case the returned
          dict will have `_ann` attribute, which will be a list of a schema
          fields: _ann: [{name:'fieldname', title: 'Field Title'}, ...]

        - only_fields tells the serializer to omit the fields which are not in the list
          (the fields still need to be in the schema though)

        """

        structure = self._find_schema_for_data_format(format)

        # A subclass may define a method serialize_formatname(self, item, structure) which will be called instead of the standard serializer
        meth = getattr(self, "serialize_%s" % format, self._default_item_serializer)

        data = meth(self.model, structure, only_fields=only_fields)

        if annotate:
            data['_ann'] = self._annotate_fields(structure)

        return data


    def _default_item_serializer(self, item, structure, only_fields=None):

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
                value = self._default_item_serializer(item, structure_field)
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
                        subitems.append(self._default_item_serializer(subitem, subitems_schema))
                    value = subitems
                elif isinstance(structure_field, sc.Structure):
                    print "SERIALIZING A STRUCTURE: %s -> %s" % (name, structure_field)
                    subitems_schema = structure_field
                    value = self._default_item_serializer(value, subitems_schema)
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
                    raise AttributeError("Don't know how to serialize attribute '%s' of type '%s' with value '%s'" % (name, structure_field, value))
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

    def _annotate_fields(self, structure):
        """
        Extract some additional data from our schema
        (namely - field titles) to facilitate automated rendering
        """
        data = []
        # structure.attrs is a list of (name,field) tuples
        for (name, field) in structure.attrs:
            f = {
                'name': name,
                'title': field.title,
            }
            data.append(f)

        return data

    def default_item_deserializer(self, params, request):

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


        schema = params.get('__schema__')
        form_name = schema.__class__.__name__

        if schema is None:
            form_name = params.get('__formish_form__')
            schema = self._find_schema_for_data_format(form_name)


        _save_structure(self.model, schema, params)



    def deserialize(self, params, request):
        """
        Recursively applies data from a Formish form to an SA model,
        using the form's schema to ensure only the attributes from the form are set.
        This supposes that the form submitted is a formish form
        """
        # TODO: Add validation here

        schema = params.get('__schema__')

        if schema is not None:
            form_name = schema.__class__.__name__
        else:
            form_name = params.get('__formish_form__')

        # A Resource can define a deserialization hook
        # be declaring a method deserialize_FormName.
        meth = getattr(self, 'deserialize_%s' % form_name, None)
        if meth is not None:
            return meth(params, request)

        if schema is None:
            schema = self._find_schema_for_data_format(form_name)

        # Alternatively, the form can define a custom
        # deserializer. This approach seems to be better, so
        # custom deserializers on a resource should be deprecated.
        # In fact, the default deserializer can be moved to a base class
        # from which all forms will be subclassed
        meth = getattr(schema, 'deserialize', None)
        if meth is not None:
            return meth(self, params, request)


        self.default_item_deserializer(params, request)


    def update(self, params, request):
        """
        Override the crud's method to compute a diff of item's state
        before and after the update and call "item updated" hooks
        """

        form_name = params.get('__formish_form__')


        #old_data = self.serialize(format=form_name)
        self.deserialize(params, request)
        #new_data = self.serialize(format=form_name)
        #diff = _dict_diff(old_data, new_data)
        #request['webapp_update_diff'] = diff

        #Flush session so changes have been applied
        # before we call the after context hook
        sa.orm.object_session(self.model).flush()

        if hasattr(self, "after_item_updated"):
            self.after_item_updated(request)


