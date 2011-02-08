# -*- coding: utf-8 -*-

import schemaish as sc

import crud

from webapp.db import DBSession
from webapp.forms import get_form

class IRestRootCollection(crud.ICollection):
    pass


class RestCollection(crud.Collection):
    """
    Just like a normal crud.Collection but
    has some additional methods expected by rest views

    rest sections need to subclass this
    """

    ### Can be overridden in a subsclass
    RECORDS_PER_BATCH = 10
    LIMIT_INCREMENTAL_RESULTS = 25


    def get_items_listing(self, request, filter_condition=None):



        format = request.GET.get('format', 'listing')

        order_by = request.GET.get('order_by', None)

        ### 'vocab' format is a special (simplified) case
        ### - returns {'items': [(id, name), (id, name), ...]}
        if format=='vocab':
            items = self.get_items(order_by=order_by, wrap=False)
            result = [ (item.id, str(item)) for item in items ]
            return {'items':result}


        data = {}
        batch_start = int(request.GET.get('from', 0))

        model_class = self.subitems_source

        query = self.get_items_query(filter_condition = filter_condition, order_by=order_by)
        
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

        result = []

        # wrap SA objects
        items = [self.wrap_child(model=model, name=str(model.id)) for model in items]

        try:
            for item in items:
                i = item.get_data(format=format)

                result.append(i)
        except AttributeError, e:
            raise

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




class RestResource(crud.Resource):
    """
    Some additional methods for formatting
    """

    def get_data(self, format='default'):
        """
        """

        form_name = self.data_formats.get(format, None)
        if form_name is None:
            raise ValueError("Format '%s' is not registered for %s" % (format, self.__class__))

        form = get_form(self.data_formats[format])

        if form is None:
            raise ValueError("%s form is not registered, but is listed as the"\
            " '%s' format for %s class" % (form_name, format, self.__class__) )
        structure = form.structure.attr

        return self._extract_data_from_item(self.model, structure)


    def _extract_data_from_item(self, item, structure):
        data = {}
        # structure.attrs is a list of (name,field) tuples
        fieldnames = [ i[0] for i in structure.attrs ]
        default = object()

        for name in fieldnames:
            value = getattr(item, name, default)
            structure_field = getattr(structure, name, default)

            if value is not default:

                # Recursively serialize lists of subitems
                if isinstance(structure_field, sc.Tuple):
                    #import pdb; pdb.set_trace()

                    subitems_schema = structure_field.attrs[0]
                    subitems = []
                    for item in value:
                        subitems.append(self._extract_data_from_item(item, subitems_schema))
                    data[name] = subitems
                elif isinstance(structure_field, sc.Structure):
                    subitems_schema = structure_field
                    data[name] = self._extract_data_from_item(value, subitems_schema)
                else:
                    # if it's a callable then call it
                    # (using @property to imitate an attribute
                    # is not cool because it swallows any exceptions and just hides the property)

                    if callable(value):
                        value = value()
                    
                    
                    # We need to prevent classes and other
                    # non-serializable stuff from trying to sneak
                    # into the JSON serializer.
                    # So we convert everything except Nones to str
                    # which probably is not right
                    if value is not None:
                        value = str(value)
                    data[name] =value
        return data


