# -*- coding: utf-8 -*-

import crud

from webapp.db import DBSession
from webapp.forms import get_form

class IRestRootSection(crud.ISection):
    pass


class RestSection(crud.Section):
    """
    Just like a normal crud.Section but
    has some additional methods expected by rest views

    rest sections need to subclass this
    """

    ### Can be overridden in a subsclass
    RECORDS_PER_BATCH = 10
    LIMIT_INCREMENTAL_RESULTS = 25

    def get_items_listing(self, request):

        data = {}
        batch_start = int(request.GET.get('from', 0))

        model_class = self.subitems_source
        query = DBSession.query(model_class)

        #query = DBSession.query(Project).options(sa.orm.eagerload('client'))

        # TODO: Filtering support
        #status_filter = request.GET.get('status', None)
        #if status_filter:
        #    query = query.filter(Project.status_id == int(status_filter))

        #client_filter = request.GET.get('client', None)
        #if client_filter:
        #    query = query.filter(Project.client_id == int(client_filter))


        ### Sorting
        sort_on = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', 'asc')

        if sort_on:
            f = getattr(model_class, sort_on, None)
            if f is not None:
                if sort_order == 'desc':
                    f = f.desc()

                query = query.order_by(f)

        ## Now we have a full query which would retrieve all the objects
        ## We are using it to get count of objects available using the current
        ## filter settings
        count = query.count()
        data['total_count'] = count

        # Limit the result set to a single batch only
        # request one record more than needed to see if there are
        # more records
        query = query.offset(batch_start).limit(self.RECORDS_PER_BATCH+1)
        items = query.all()

        if len(items) > self.RECORDS_PER_BATCH:
            data['has_more'] = True
            data['next_batch_start'] = batch_start + self.RECORDS_PER_BATCH
        #items = context.get_items(order_by="last_name", wrap=False)

        result = []

        # wrap SA objects
        items = [self.wrap_child(model=model, name=str(model.id)) for model in items]

        format = request.GET.get('format', 'listing')

        for item in items:
            i = item.get_data(format=format)

            #i['id'] = item.id
            #i['title'] = item.title

            result.append(i)

        data['items'] = result
        return data




    def get_incremental(self, request):
        """
        Generic method for incremental search -
        requires the object to have 'name' attribute

        Returns just a list of strings
        """

        data = {}

        model_class = self.subitems_source

        query = DBSession.query(model_class)


        get_id_for = request.GET.get('get_id_for', None)
        if get_id_for is not None:
            cli = query.filter(model_class.name==get_id_for).one()
            return {'id': cli.id, 'name': cli.name}

        ### Filter-able fields:
        name_filter = request.GET.get('term', None)

        # TODO: LIKE parameters need escaping
        if name_filter:
            query = query.filter(model_class.name.ilike(name_filter+'%'))

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




class RestProxy(crud.ModelProxy):
    """
    Some additional methods for formatting
    """

    def get_data(self, format='default'):
        """
        """
        form = get_form(self.data_formats[format])

        structure = form.structure

        data = {}
        # structure.attrs is a list of (name,field) tuples
        fieldnames = [ i[0] for i in structure.attrs ]
        default = object()

        for name in fieldnames:
            value = getattr(self.model, name, default)
            if value is not default:
                # We need to prevent classes and other
                # non-serializable stuff from trying to sneak
                # into the JSON serializer.
                # So we convert everything except Nones to str
                # which probably is not right
                if value is not None:
                    value = str(value)
                data[name] =value
        return data


class VocabSection(crud.Section):

    def get_items_listing(self, request=None):
        """
        Returns a vocab in format {items : [(id, name), (id, name),]}
        """
        items = self.get_items(order_by="name", wrap=False)
        result = [ (item.id, str(item)) for item in items ]
        return {'items':result}

    def create_new_item(self, params):
        """
        Adds a new item to the collection, then returns
        the full collections and the ID of the new item in the following format:
        { new_id: 123, items: [(id, name), (id, name),] }
        """

        from webapp import DBSession

        new_item = self.create_subitem()
        new_item.name = params['name']
        DBSession.add(new_item)

        result = self.get_items_listing()
        result['new_id'] = new_item.id
        return result

