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
from webapp.forms import Literal, get_form_registry_by_name
from webapp import DynamicDefault
from webapp.exc import WebappFormError


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

    @property
    def model(self):
        return self.__parent__.model

    def update(self, params, request):
        """
        Override the crud's method to call "item updated" hooks
        """
        self.deserialize(params, request)
        if hasattr(self, "after_item_updated"):
            self.after_item_updated(request)


from webapp.forms.data_format import DataFormatReader, DataFormatWriter, DataFormatLister

DATA_FORMAT_MAPPING = {
    'read':  DataFormatReader,
    'write': DataFormatWriter,
    'list': DataFormatLister,
}


class FormAwareMixin(object):
    """
    A mixin which enables "local form-awareness", i.e. we can register
    a form registry on a node in our content tree, and all sub-nodes within that
    branch will find and use that registry
    """

    form_registry = None

    def find_form_registry(self):
        if self.form_registry is not None:
            if isinstance(self.form_registry, basestring):
                return get_form_registry_by_name(self.form_registry)
            return self.form_registry

        if (self.__parent__ is not None) and hasattr(self.__parent__, 'find_form_registry'):
            return self.__parent__.find_form_registry()

        return get_form_registry_by_name('default')

    def __getitem__(self, name):

        #if isinstance(self, RestCollection):
        #    import pdb; pdb.set_trace()

        if name.startswith('@'):
            data_format_factory = self._find_data_format(name[1:])
            data_format_obj = data_format_factory()
            data_format_obj.__name__ = name
            data_format_obj.__parent__ = self
            return data_format_obj

        return crud.Traversable.__getitem__(self, name)

    def _find_data_format(self, format):

        return self.__data_formats__['all'][format]

    def _check_format_type(self, format, format_type):
        """
        Checks if the format was registered with the format_type
        used in view predicates to raise a 404 if, say, a "reader" format
        is POSTed to.
        """
        return format_type in self.__data_formats__ and \
               format in self.__data_formats__[format_type]

    @classmethod
    def _data_format_decorator(cls, name_or_cls, format_types):
        """
        Base class for reader, writer and other decorator methods
        """

        if isinstance(name_or_cls, basestring):
            additional_name = name_or_cls
        else:
            additional_name = None

        def inner(schemaish_cls):
            if not hasattr(cls, '__data_formats__'):
                cls.__data_formats__ = {'all': {}}


            all_format_types = ('all', ) + format_types
            for format_type in all_format_types:
                data_format_factory_class = DATA_FORMAT_MAPPING[format_type]
                data_format_factory = data_format_factory_class(schemaish_cls)
                format_dict = cls.__data_formats__.setdefault(data_format_factory, {})
                format_dict[schemaish_cls.__name__] = data_format_factory
                if additional_name is not None:
                    format_dict[additional_name] = data_format_factory
            # it's important to return it otherwise nested decorators won't work
            return schemaish_cls


        if isinstance(name_or_cls, basestring):
            # we were passed a string which means the decorator was called
            # with @Resource.reader('name') syntax - return the inner function
            # which in turn will be called
            # with the DataFormat class as its parameter
            return inner

        # we were passed a class, which means the decorater was used without
        # ('name') so we invoke the inner function directly
        return inner(name_or_cls)

    @classmethod
    def readonly_format(cls, name_or_cls):
        """
        A decorator to assign a DataFormat subclass as a READ data format
        for the given resource::

                @ContactResource.reader
                class ContactResourceView(DataFormat):

        in which case the format will be available as `/rest/contacts/123`

        Alternatively, we can pass a name to the decorator::

                @ContactResource.reader('test')
                class ContactResourceView(DataFormat):
        """

        return cls._data_format_decorator(name_or_cls, ('read', ))

    @classmethod
    def writeonly_format(cls, name_or_cls):
        """
        """
        return cls._data_format_decorator(name_or_cls, ('write', ))

    @classmethod
    def readwrite_format(cls, name_or_cls):
        """
        """
        return cls._data_format_decorator(name_or_cls, ('read', 'write', ))



class RestCollection(FormAwareMixin, crud.Collection):
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





class RestResource(FormAwareMixin, crud.Resource):
    """
    Some additional methods for formatting
    """


    #@classmethod
    def _find_schema_for_data_format(self, format):

        form_registry = self.find_form_registry()

        if isinstance(format, sc.Structure):
            return format

        schema = None

        form_name = self.data_formats.get(format, None)
        form = None
        if form_name is not None:
            form = form_registry.get_form(self.data_formats[format])
            if form is None:
                raise ValueError("Can't find form %s for %s" % (form_name, self.__class__.__name__))
            schema = form.structure.attr
        else:
            # A client can either pass a format name (i.e. 'add'),
            # or, as a shortcut for forms, directly the form name (i.e. 'ServerAddForm')
            # so we don't need to specify the format in the route's definition.
            # in the latter case we still want to make sure the form is listed as
            # one of our formats.
            if format in self.data_formats.values():
                form = form_registry.get_form(format)
                schema = form.structure.attr

            ### Support for finding format in class parents - I'm not sure
            ### we're using this anywhere
            #else:
                #from crud.registry import get_resource_for_model, get_model_for_resource
                #model_cls = get_model_for_resource(cls)
                #for parent_class in model_cls.__bases__:
                    #resource_class = get_resource_for_model(parent_class)
                    #print "GOT PARENT RESOURCE: %s" % resource_class
                    #if hasattr(resource_class, "_find_schema_for_data_format"):
                        #schema = resource_class._find_schema_for_data_format(format)
                        #if schema is not None:
                            #break


                #if schema is None:
                    #from pyramid.httpexceptions import HTTPBadRequest
                    #e = HTTPBadRequest("Format '%s' is not registered for %s" % (format, cls))
                    #e.status = '444 Data Format Not Found'
                    #raise e



        if schema is None:
            raise WebappFormError("%s form is not registered, but is listed as the"\
                " '%s' format for %s class" % (form_name, format, self.__class__))
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

        # A form can define a serialization hook
        if hasattr(structure, "serialize"):
            return structure.serialize(self)

        # OBSOLETE, being phases out
        # A subclass may define a method serialize_formatname(self, item, structure) which will be called instead of the standard serializer
        # meth = getattr(self, "serialize_%s" % format, self._default_item_serializer)

        # data = meth(self.model, structure, only_fields=only_fields)

        # if annotate:
        #     data['_ann'] = self._annotate_fields(structure)

        # return data


    # def _annotate_fields(self, structure):
    #     """
    #     Extract some additional data from our schema
    #     (namely - field titles) to facilitate automated rendering
    #     """
    #     data = []
    #     # structure.attrs is a list of (name,field) tuples
    #     for (name, field) in structure.attrs:
    #         f = {
    #             'name': name,
    #             'title': field.title,
    #         }
    #         data.append(f)

    #     return data




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


