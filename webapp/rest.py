# -*- coding: utf-8 -*-

import schemaish as sc

import crud

from webapp.db import get_session
from webapp.forms import get_form

class IRestRootCollection(crud.ICollection):
    pass

_marker = []

class RestCollection(crud.Collection):
    """
    Just like a normal crud.Collection but
    has some additional methods expected by rest views

    rest sections need to subclass this
    """

    ### Can be overridden in a subsclass
    RECORDS_PER_BATCH = 100
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

        query = get_session().query(model_class)


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

    def get_data(self, format='default', annotate=False):
        """
        - requires 'format' parameter - which must correspond to one of formats
        registered in `data_formats` property. This will determine which fields
        will be serialized

        - optionally takes an "annotate" parameter - in this case the returned
        dict will have `_ann` attribute, which will be a list of a schema fields:
        _ann: [{name:'fieldname', title: 'Field Title'}, ...]
        """

        form_name = self.data_formats.get(format, None)
        if form_name is None:
            from pyramid.exceptions import ExceptionResponse
            e = ExceptionResponse("Format '%s' is not registered for %s" % (format, self.__class__))
            e.status = '444 Data Format Not Found'
            raise e

        form = get_form(self.data_formats[format])

        if form is None:
            raise ValueError("%s form is not registered, but is listed as the"\
            " '%s' format for %s class" % (form_name, format, self.__class__) )
        structure = form.structure.attr

        data = self._extract_data_from_item(self.model, structure)
        
        if annotate:
            data['_ann'] = self._annotate_fields(structure)

        return data


    def _extract_data_from_item(self, item, structure):
        data = {}
        # structure.attrs is a list of (name,field) tuples
        fieldnames = [ i[0] for i in structure.attrs ]
        default = object()

        print "=========="
        print "Serializing %s" % item
        print "----------"
        for name in fieldnames:
            value = getattr(item, name, default)
            structure_field = getattr(structure, name, default)

            if value is not default:

                # Recursively serialize lists of subitems
                if isinstance(structure_field, sc.Tuple):
                    print "SERIALIZING A TUPLE: %s -> %s" % (name, structure_field)
                    subitems_schema = structure_field.attrs[0]
                    subitems = []
                    for item in value:
                        subitems.append(self._extract_data_from_item(item, subitems_schema))
                    data[name] = subitems
                elif isinstance(structure_field, sc.Structure):
                    print "SERIALIZING A STRUCTURE: %s -> %s" % (name, structure_field)
                    subitems_schema = structure_field
                    data[name] = self._extract_data_from_item(value, subitems_schema)
                else:
                    # if it's a callable then call it
                    # (using @property to imitate an attribute
                    # is not cool because it swallows any exceptions 
                    # and just pretens there's no such property)
                    print "SERIALIZING A SIMPLE ATTRIBUTE: %s -> %s" % (name, structure_field)
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
                'title':field.title,
            }
            data.append(f)

        return data



    def update_model(self, params):
        """
        Recursively applies data from a Formish form to an SA model,
        using the form's schema to ensure only the attributes from the form are set.
        This supposes that the form submitted is a formish form
        """
        # TODO: Add validation here

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

            for (name, attr) in attrs:
                value = data.get(name, _marker)
                if value is _marker:
                    print "### No data passed for attr %s <%s>" % (name, data)
                    continue
                    
                print "### Saving attribute %s with value %s" % (name, value)
                if isinstance(attr, sc.Structure):
                    print "STRUCTURE!"
                    subschema = attr
                    subitem = getattr(item, name, None)
                    if subitem is None:
                        cls = _get_attribute_class(item, name)
                        subitem = cls()
                        setattr(item, name, subitem)
                    _save_structure(subitem, subschema, value)
                    
                elif isinstance(attr, sc.String):
                    setattr(item, name, value)

        item = self.model

        form_name = params.get('__formish_form__')
        form = get_form(form_name)
        schema = form.structure
        
        _save_structure(item, schema, params)


                
