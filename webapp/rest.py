# -*- coding: utf-8 -*-

import schemaish as sc

from sqlalchemy.orm import object_session

import crud

from webapp.db import get_session
from webapp.forms import get_form, Literal
from webapp import DynamicDefault

from datetime import datetime, date
from decimal import Decimal

class IRestRootCollection(crud.ICollection):
    pass

_marker = []

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

    def get_items_listing(self, request, filter_condition=None):


        format = request.GET.get('format', 'listing')

        order_by = request.GET.get('sort_on', None)
        sort_order = request.GET.get('sort_order', None)
        batch_size = request.GET.get('batch_size', self.DEFAULT_RECORDS_PER_BATCH)
        batch_size = int(batch_size)
        batch_size = max(batch_size, self.MIN_RECORDS_PER_BATCH)
        batch_size = min(batch_size, self.MAX_RECORDS_PER_BATCH)
        batch_start = int(request.GET.get('batch_start', 0))


        if order_by is not None:
            if sort_order == 'desc':
                order_by = "-%s" % order_by
            else:
                order_by = "+%s" % order_by

        ### 'vocab' format is a special (simplified) case
        ### - returns {'items': [(id, name), (id, name), ...]}
        if format=='vocab':
            items = self.get_items(order_by=order_by, wrap=False)
            result = [ (item.id, str(item)) for item in items ]
            return {'items':result}


        data = {}

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
        query = query.offset(batch_start).limit(batch_size+1)
        items = query.all()

        if len(items) > batch_size:
            data['has_more'] = True
            data['next_batch_start'] = batch_start + batch_size

        result = []

        # wrap SA objects
        items = [self.wrap_child(model=model, name=str(model.id)) for model in items]

        try:
            for item in items:
                i = item.serialize(format=format)

                result.append(i)
        except AttributeError, e:
            raise

        data['items'] = result
        return data


    def get_empty(self, request):
        """
        Returns an empty subitem - i.e. with all fields either
        empty or set to default values
        """
        format = request.GET.get('format', 'listing')

        item = self.create_transient_subitem()
        resource = self.wrap_child(item, name="empty")
        data = resource.serialize(format = format)
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

    #default_datetime_format = "%d %b %Y %M:%I %p"

    def serialize(self, format='default', annotate=False):
        """
        - requires 'format' parameter - which must correspond to one of formats
          registered in `data_formats` property. This will determine which
          fields will be serialized

        - optionally takes an "annotate" parameter - in this case the returned
          dict will have `_ann` attribute, which will be a list of a schema
          fields: _ann: [{name:'fieldname', title: 'Field Title'}, ...]

        """

        form_name = self.data_formats.get(format, None)
        if form_name is not None:
            form = get_form(self.data_formats[format])
        else:
            # A client can either pass a format name (i.e. 'add'),
            # or, as a shortcut for forms, directly the form name (i.e. 'ServerAddForm')
            # so we don't need to specify the format in the route's definition.
            # in the latter case we still want to make sure the form is listed as
            # on of our formats.
            if format in self.data_formats.values():
                form = get_form(format)
            else:
                from pyramid.exceptions import ExceptionResponse
                e = ExceptionResponse("Format '%s' is not registered for %s" % (format, self.__class__))
                e.status = '444 Data Format Not Found'
                raise e


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
        print "Serializing %s values of %s" % (fieldnames, item, )
        print "----------"
        for name in fieldnames:
            value = getattr(item, name, default)
            structure_field = getattr(structure, name, default)

            print "Starting with %s of %s" % (name, item)
            if value is not default:

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
                    for subitem in value: # take care not to name it "item" or it'll override the function-wide variable
                        subitems.append(self._extract_data_from_item(subitem, subitems_schema))
                        pass
                    value = subitems
                elif isinstance(structure_field, sc.Structure):
                    print "SERIALIZING A STRUCTURE: %s -> %s" % (name, structure_field)
                    subitems_schema = structure_field
                    value = self._extract_data_from_item(value, subitems_schema)
                elif isinstance(structure_field, sc.String):
                    print "SERIALIZING A STRING ATTRIBUTE: %s -> %s" % (name, structure_field)

                    if value is not None:
                        value = str(value)
                elif isinstance(structure_field, sc.Integer):
                    print "SERIALIZING AN INTEGER ATTRIBUTE: %s -> %s" % (name, structure_field)
                    if value is not None:
                        value = int(value)
                elif isinstance(structure_field, sc.Decimal):
                    print "SERIALIZING A DECIMAL ATTRIBUTE: %s -> %s" % (name, structure_field)
                    if value is not None:
                        value = float(value)
                elif isinstance(structure_field, sc.Boolean):
                    print "SERIALIZING A BOOLEAN ATTRIBUTE: %s -> %s" % (name, structure_field)
                    if value is not None:
                        value = bool(value)
                elif isinstance(structure_field, sc.Date):
                    print "SERIALIZING A DATE ATTRIBUTE: %s -> %s = %s" % (name, structure_field, value)
                elif isinstance(structure_field, sc.DateTime):
                    print "SERIALIZING A DATETIME ATTRIBUTE: %s -> %s" % (name, structure_field)
                elif isinstance(structure_field, Literal):
                    print "SERIALIZING A LITERAL ATTRIBUTE: %s -> %s" % (name, structure_field)
                    pass
                else:
                    print "Don't know how to serialize attribute '%s' of type '%s' with value '%s'" % (name, structure_field, value)
                    raise AttributeError("Don't know how to serialize attribute '%s' of type '%s' with value '%s'" % (name, structure_field, value))
            else:
                value = None

            # If the model does not provide a value, use
            # form's default
            if value is None:
                #import pdb; pdb.set_trace()
                value = getattr(structure_field, 'default', None)

                if isinstance(value, DynamicDefault):
                    value = value(item, name)

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
                'title':field.title,
            }
            data.append(f)

        return data



    def deserialize(self, params, request):
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

                print "### Saving attribute %s (type %s) with value %s" % (name, attr, value)
                # Nested structures
                if isinstance(attr, sc.Structure):
                    print "STRUCTURE!"
                    subschema = attr
                    subitem = getattr(item, name, None)
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
                        value = value.split('T')[0] # strip off the time part
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
                        if value not in (None, ''):
                            raise AttributeError("Wrong boolean value for %s: %s" % (name, value))

                else:
                    raise AttributeError("Don't know how to deserialize attribute %s of type %s" % (name, attr))

        def _save_sequence(collection, schema, data):


            existing_items = { str(item.model.id):item for item in collection.get_items() }

            seen_ids = []

            for (order_idx, value) in data.items():
                if order_idx == '*':
                    continue;
                item_id = value.get('id', None)
                # the data must contain 'id' parameter
                # if the data should be saved into an existing item
                item = existing_items.get(item_id, None)
                del value['id']
                value['__schema__'] = schema
                if item is not None:
                    seen_ids.append(str(item_id))
                    item.update(value, request)
                else:
                    item = collection.create_subitem(params=value, request=request, wrap=True)


            ids_to_delete = [id for id in existing_items.keys() if id not in seen_ids]
            collection.delete_subitems(ids_to_delete, request)


        item = self.model

        schema = params.get('__schema__')
        if schema is None:
            form_name = params.get('__formish_form__')
            form = get_form(form_name)
            schema = form.structure

        _save_structure(item, schema, params)



