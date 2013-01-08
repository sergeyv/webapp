# from datetime import datetime
# from decimal import Decimal
# import json
# import cgi
import time
import transaction
from zope.interface import Interface, implements

import dottedish
import sqlalchemy as sa

# from webapp.forms import Literal
# from webapp import DynamicDefault
# from webapp.exc import WebappError
from webapp.db import get_session

from .data_format_base import DataFormatBase


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


class DataFormatReader(DataFormatBase):
    implements(IDataFormatReader)

    def serialize(self, request):
        """
        Returns a dict which represents the model of our parent Resource
        """
        # our parent is a Resource
        model = self.__parent__.model
        return self.serialize_item(model)

    def read(self, request):
        """
        This is what is actually called by the view
        """

        structure = self.structure

        # Structure can completely override the default logic
        if hasattr(structure, "read"):
            return structure.read(self, request)

        ### TODOXXX: This set_field/set_value stuff is used by
        # the AutoFillDropdown. I don't like the whole approach
        # hope we will be able to get rid of it completely
        set_field = request.GET.get('set_field', None)
        if set_field is not None:

            import webapp
            session = webapp.get_session()
            session.autoflush = False

            set_value = request.GET.get('set_value', None)
            if set_value:
                # or use the deserialization machinery here?
                # setattr(context.model, set_field, int(set_value))

                raise ValueError("AutoFillDropdown does not work")
                session.flush()

        only_fields = request.GET.get('only', None)
        if only_fields is not None:
            only_fields = [f.strip() for f in only_fields.split(',')]

        data = self.serialize(request)

        ### TODOXXX: We don't really want to rollback it, but we have to
        # in case of set_field present, because it modifies and flushes the
        # model. Ugly-ugly-ugly.
        if set_field is not None:
            transaction.abort()

        # A hook for Structure to post-process the data
        if hasattr(structure, "post_process_data"):
            return structure.post_process_data(self, data, request)

        return data


class DataFormatWriter(DataFormatBase):
    implements(IDataFormatWriter)

    __allow_loadable__ = True

    def deserialize(self, params, request):
        resource = self.__parent__
        structure = self.structure
        return self._default_item_deserializer(resource, structure, params, request)

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

        # Formish uses dotted syntax to deal with nested structures
        # we need to unflatten it
        params = request.json_body
        params = dottedish.api.unflatten(params.items())

        if hasattr(structure, "before_item_updated"):
            structure.before_item_updated(self, params, request)

        if hasattr(resource, "before_item_updated"):
            resource.before_item_updated(self, params, request)


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
        """
        This method creates a transient item (because no actual item exists)
        and serializes it. It server to load defaults etc. when a create from is
        displayed.

        Our parent here is a Collection
        """
        collection = self.__parent__
        model = collection.create_transient_subitem()
        return self.serialize_item(model)

    def create_and_deserialize(self, params, request):
        """
        Creates an item and sets data passed in params
        """
        # our parent is a Collection

        structure = self.structure
        #return _default_item_deserializer(self.model, structure, params, request)
        collection = self.__parent__

        def _setter(resource):
            self._default_item_deserializer(resource, structure, params, request)

        return collection.create_subitem(setter_fn=_setter, wrap=True)

    def create(self, request):
        """
        Creates an item and returns item's id

        Checks if the structure has a create method and calls the structuye's
        method if exists, otherwise calls do_create
        """
        # Structure can completely override the default logic
        if hasattr(self.structure, "create"):
            return self.structure.create(self, request)

        resource = self.do_create(request)
        return {'item_id': resource.model.id}

    def do_create(self, request):
        """
        Creates an item and returns the item
        """
        params = request.json_body  # json.loads(request.body)
        params = dottedish.api.unflatten(params.items())

        if hasattr(self.structure, "before_item_created"):
            self.structure.before_item_created(self, params, request)

        resource = self.create_and_deserialize(params, request)

        if hasattr(self.structure, "after_item_created"):
            self.structure.after_item_created(resource, request)

        if hasattr(resource, "after_item_created"):
            resource.after_item_created(self, request)

        return resource


class DataFormatReadWrite(DataFormatReader, DataFormatWriter):
    implements(IDataFormatReader, IDataFormatWriter)

    __allow_loadable__ = True


def _add_filters_to_query(collection, query, filter_fields, request):
    """
    Add filter criteria to the query if there are `filter-<xxx>`
    parameters in the request
    """
    model_class = collection.get_subitems_class()
    filter_values = []

    # NOTE: this should use filter_fields as a basis
    # to iterate over (and not the data in the request)
    # so it's not possible to filter by fileds not
    # explicitly passed to the function.
    for f in filter_fields:
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


def _add_search_to_query(collection, query, request):
    """
    Adds a search criteria to the query if there's `search`
    parameter in the request
    """

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


def _add_eagerload_to_query(format, query):
    structure = format.structure

    for rel in getattr(structure, '__sa_eagerload__', []):
        query = query.options(sa.orm.joinedload_all(rel))

    return query


def _add_stats(data, request):
    """
    Add `stats` key to the data which contains info on SQl queries executed
    """
    settings = request.registry.settings
    if settings is not None:
        import webapp
        sess = webapp.get_session()

        if hasattr(sess, "stats"):
            if settings.get('debug_templates', False):
                stats = {
                    'query_count': sess.stats.query_count,
                    'queries': sess.stats.queries,
                }
            else:
                stats = {
                    'query_count': sess.stats.query_count,
                }

            data['stats'] = stats
    return data


class DataFormatLister(DataFormatBase):
    implements(IDataFormatLister)

    def get_items_listing(self, request):
        """
        Understands the following request parameters:

            - filter-<field-name>:<value> - only return results where
              `field-name` == `value`. Works for simple relations, i.e.
              filter-client=49. (49 is client's `id` field, and this is
              hard-coded at the moment). The field must be listed in  the
              structure's __filter_fields__ property, which is a tuple.

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
        structure = self.structure

        # Structure can completely override the default logic
        if hasattr(structure, "listing"):
            return structure.listing(self, request)

        collection = self.__parent__

        order_by = request.GET.get('sort_on', None)

        # Proceed with the standard processing
        if order_by is not None:
            sort_order = request.GET.get('sort_order', None)
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by
        else:
            if hasattr(structure, '__order_by__'):
                order_by = structure.__order_by__

        data = {}

        # a structure can override get_items_query method
        if hasattr(structure, "get_items_query"):
            query = structure.get_items_query(self, collection, order_by=order_by)
        else:
            query = collection.get_items_query(order_by=order_by)

        # CUSTOM QUERY MODIFIER
        ### An initial approach to be able to specify some hooks in the collection
        ### so the client can invoke a filtering method by querying a special url:
        ### /rest/collection/@aaa&filter=min_clients&filter_params=5
        ### would look for a method named 'filter_min_client' which is supposed
        ### to return an SA clause element suitable for passing to .filter()
        filter_meth_name = request.GET.get('meth', None)
        if filter_meth_name:
            # filter_param = request.get('param', None)
            meth = getattr(collection, 'filter_' + filter_meth_name)
            query = meth(query, request)

        # EAGERLOAD
        query = _add_eagerload_to_query(self, query)

        # FILTERING
        query = _add_filters_to_query(
            collection=self.__parent__,
            query=query,
            filter_fields=getattr(self.structure, '__filter_fields__', []),
            request=request)

        # SEARCH
        query = _add_search_to_query(self.__parent__, query, request)

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
        sa_start = time.time()
        items = query.all()
        sa_end = time.time()

        if len(items) > batch_size:
            data['has_more'] = True
            data['next_batch_start'] = batch_start + batch_size

        result = []

        serialize_start = time.time()
        for model in items:
            i = self.serialize_item(model)
            result.append(i)
        serialize_end = time.time()

        data['items'] = result

        data = _add_stats(data, request)

        if 'stats' in data:
            data['stats']['main_query_time'] = sa_end - sa_start
            data['stats']['serialize_time'] = serialize_end - serialize_start

        # A hook for Structure to post-process the data
        if hasattr(structure, "post_process_data"):
            return structure.post_process_data(self, data, request)

        return data

    def get_filters(self, request):
        """
        Returns a dict with filters and possible values; the keys of the dict
        are field names and the values a 3-tuples of id, name and count::

            {
                "type": [
                    [1, "Fruit", 576],
                    [2, "Vegetables", 37],
                    [3, "Berries", 288],
                ]
            }
        """

        data = {}

        collection = self.__parent__
        model_class = collection.get_subitems_class()
        parent_inst = getattr(collection.__parent__, 'model', None)
        session = get_session()

        filter_fields = getattr(self.structure, '__filter_fields__', [])

        for attribute_name in filter_fields:
            field = getattr(model_class, attribute_name, None)
            if field is None:

                raise AttributeError("Class %s has no attribute %s" % (model_class, attribute_name))

            if isinstance(field.impl.parent_token, sa.orm.properties.ColumnProperty):
                # The attribute is a simple column

                q = session.query(field, sa.func.count(field))\
                    .group_by(field)\
                    .order_by(field)

                if parent_inst is not None:
                    # limit the query only to items which belong to our parent
                    q = q.with_parent(parent_inst)

                result = q.all()

                d = []
                for r in result:
                    d.append([str(r[0]), str(r[0]), str(r[1])])
                data[attribute_name] = d
            else:
                # The attribute is not a simple column so we suppose it's
                # a relation. TODO: we may need a better check here
                rel_class = collection.get_class_from_relation(field)
                if not isinstance(rel_class, type):
                    rel_class = rel_class.__class__

                # Note: initially it was using session.query(...).join(model_class)...
                # but it was producing an extra join so the counts were all wrong
                # .select_from() fixes the problem
                q = session.query(rel_class.id, rel_class.name, sa.func.count(model_class.id))\
                    .select_from(sa.orm.join(model_class, rel_class))\
                    .group_by(rel_class.id, rel_class.name)\
                    .order_by(rel_class.name)

                if parent_inst is not None:
                    # limit the query only to items which belong to our parent
                    q = q.with_parent(parent_inst)

                result = q.all()
                r = []
                for item in result:
                    r.append([item.id, item.name, item[2]])
                data[attribute_name] = r

        return data


class VocabLister(object):
    """
    In case of `vocab` format the result is simpler::

        { 'items': [(id, name), (id, name), (id, name)] }

    Also, batching is not applied in case of the `vocab` format.

    Note that it inherits from object, not from DataFormatBase
    because the latter has __acl__ property so we can't set our
    __acl__ attribute

    """
    implements(IDataFormatLister)

    def __init__(self, dummy=None):
        self.__acl__ = []
        pass

    def __call__(self):
        return self

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

        # NO FILTERING - figure out where to get __filter_fields__ from in this case
        # query = _add_filters_to_query(self.__parent__, query, request)

        # SEARCH
        query = _add_search_to_query(self.__parent__, query, request)

        ### 'vocab' format is a special (simplified) case
        ### - returns {'items': [(id, name), (id, name), ...]}
        items = query.all()
        result = [(item.id, str(item)) for item in items]
        return {'items': result}
