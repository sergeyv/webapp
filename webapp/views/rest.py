# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import json

# from webob import Response

# import formish
# import schemaish as sc
import dottedish
from pyramid.view import view_config
import transaction

import crud

from webapp.db import get_session
from webapp.rest import IRestRootCollection
# from webapp.forms import get_form

# from webapp.testing import sluggish, explode


@view_config(name="new",
    context=crud.ICollection,
    permission="rest.list",
    request_method="GET",
    renderer="better_json")
def json_rest_empty(context, request):
    """
    Returns an empty item with all fields set to default values
    """
    #Specifc validation methods for remote validation here
    #To be used with the remote_method validator
    if len(request.subpath) > 1 and request.subpath[0] == u'validate':
        validation_name = str(request.subpath[1])
        field_name = str(request.params.keys()[0])
        if hasattr(context, 'validate_' + validation_name):
            result = getattr(context, 'validate_' + validation_name)(
                    request.params[field_name])
            return result
        else:
            raise AttributeError('No validation method on context')

    return context.get_empty(request)


def _create_item(context, request):
    """
    """
    if hasattr(context, "before_item_created"):
        context.before_item_created(request)
    params = json.loads(request.body)
    print "+JSON_REST_CREATE: %s" % (params)
    # Formish uses dotted syntax to deal with nested structures
    # we need to unflatten it
    params = dottedish.api.unflatten(params.items())


    # See if a subclass defines a hook for processing this format
    format = params.get('__formish_form__', None)

    if format is not None:
        # See if a subclass defines a hook for processing this format
        resource = context.wrap_child(context.create_transient_subitem(), name="empty")

        hook_name = "deserialize_sequence_%s" % format
        meth = getattr(resource, hook_name, None)
        if meth is not None:
            return meth(params)


    # TODO: Add validation here
    new_item = context.create_subitem(params=params, request=request)


    return {'item_id': new_item.id}



@view_config(name="new",
    context=crud.ICollection,
    permission="rest.create",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain")
def json_rest_create_new(context, request):
    """
    """
    return _create_item(context, request)


@view_config(context=crud.ICollection,
    permission="rest.create",
    request_method="POST",
    renderer="better_json",
    accept="text/plain")
def json_rest_create(context, request):
    """
    """
    return _create_item(context, request)


@view_config(context=crud.ICollection,
    permission="rest.list",
    request_method="GET",
    renderer="better_json",
    accept="application/json")
def json_rest_list(context, request, permission=""):
    """
    """
    result = context.get_items_listing(request)
    return result


@view_config(name="filters",
    context=crud.ICollection,
    permission="rest.list",
    request_method="GET",
    renderer="better_json")
def json_rest_filters(context, request):
    """
    Returns a list of possible filters for the current section

    TODO: Is it restful or not?
    """
    print "JSON_REST_FILTERS: request body %s" % (request.body)

    fn = getattr(context, 'get_filters', None)
    if fn is not None:
        result = fn(request)
        return result

    # TODO: Do something meaningful
    return {'result': "HELLO! No filters found!"}


@view_config(name="incremental",
    context=crud.ICollection,
    permission="rest.list",
    request_method="GET",
    renderer="better_json")
def json_rest_incremental(context, request):
    """
    Returns a list of items which match a search string
    Should return just id:title pairs, not full objects

    TODO: Is it restful or not?
    """
    print "JSON_REST_INCREMENTAL: request body %s" % (request.body)

    fn = getattr(context, 'get_incremental', None)
    if fn is not None:
        result = fn(request)
        return result

    # TODO: Do something meaningful
    return {'result': "HELLO! Nothing found!"}



@view_config(context=crud.ICollection,
    permission="rest.delete",
    request_method="DELETE",
    renderer="better_json",
    accept="text/plain")
def json_rest_delete_subitems(context, request):
    """
    When a DELETE request is sent to a Collection,
    it expects its body to be a JSON dictionary of ids

    If there's no dictionary, we assume that the Collection is a scalar
    and attempt to delete the item itself

    """
    try:
        params = json.loads(request.body)
        # Formish uses dotted syntax to deal with nested structures
        # we need to unflatten it
        params = dottedish.api.unflatten(params.items())
        ids = params['id']
    except ValueError:
        ids = None

    context.delete_subitems(ids, request)

    # TODO: Do something meaningful
    return {'result': "OK"}



@view_config(context=crud.IResource,
    permission="rest.delete",
    request_method="DELETE",
    renderer="better_json",
    accept="text/plain")
def json_rest_delete_item(context, request):
    """
    When a DELETE request is sent to a Resource,
    it attempts to delete the item itself
    """
    result = context.delete_item(request)  # returns task_id

    if result is None:
        result = {'result': "OK"}

    return result





# @view_config(context=crud.IResource,
#     permission="rest.update",
#     request_method="PUT",
#     renderer="better_json",
#     accept="text/plain")
# def json_rest_update(context, request):
#     """
#     """
#     if hasattr(context, "before_item_updated"):
#         context.before_item_updated(request)

#     print "JSON_REST_UPDATE: request body %s" % (request.body)
#     params = json.loads(request.body)

#     # Formish uses dotted syntax to deal with nested structures
#     # we need to unflatten it
#     params = dottedish.api.unflatten(params.items())

#     # Resource.update returns nothing
#     context.update(params, request)

#     return {'item_id': context.model.id}


# TODO: OBSOLETE
# @view_config(context=crud.IResource,
#     permission="rest.view",
#     request_method="GET",
#     renderer="better_json",
#     accept="text/plain")
# def json_rest_get(context, request):
#     """
#     Returns a json dict representing the given object's data serialized using
#     one of the formats registered for the resource
#     """
#     annotate = bool(request.GET.get('ann', False))


#     # TODO: The code below has a lot of similarities with RestResource.get_empty
#     format_name = request.GET.get('format', 'default')

#     session = get_session()
#     session.autoflush = False

#     set_field = request.GET.get('set_field', None)
#     if set_field is not None:
#         set_value = request.GET.get('set_value', None)
#         if set_value:
#             # or use the deserialization machinery here?
#             setattr(context.model, set_field, int(set_value))
#             session.flush()

#     only_fields = request.GET.get('only', None)
#     if only_fields is not None:
#         only_fields = [f.strip() for f in only_fields.split(',')]

#     data = context.serialize(format=format_name, annotate=annotate, only_fields=only_fields)

#     transaction.abort()
#     return data


from webapp.forms.data_format import (
    IDataFormat,
    IDataFormatReader,
    IDataFormatWriter,
    IDataFormatLister,
    )


def context_implements(typ):
    """
    A custom predicate to implement matching views to resources which
    implement more than one interface - in this situation Pyramid has
    trouble matching views to the second registered interface. See
    https://github.com/Pylons/pyramid/issues/409#issuecomment-3578518
    """
    def inner(context, request):
        return typ.providedBy(context)
    return inner


# def is_a_reader(context, request):
#     resource = context.__parent__
#     format_name = context.__name__[1:]
#     return resource._check_format_type(format_name, 'read')



@view_config(context=IDataFormat,
    permission="rest.view",
    request_method="GET",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatReader),),
    )
def json_rest_get_f(context, request):
    """
    Returns a json dict representing the given object's data serialized using
    one of the formats registered for the resource
    """

    # TODO: Check if context implements IDataFormatReader, raise Http404 if not
    #annotate = bool(request.GET.get('ann', False))


    # TODO: The code below has a lot of similarities with RestResource.get_empty
    #format_name = request.GET.get('format', 'default')

    #import pdb; pdb.set_trace();
    session = get_session()
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

    data = context.serialize()

    transaction.abort()
    return data


@view_config(context=IDataFormat,
    permission="rest.list",
    request_method="GET",
    renderer="better_json",
    accept="application/json",
    custom_predicates=(context_implements(IDataFormatLister),),
    )
def json_rest_list_f(context, request, permission=""):
    """
    """
    # TODO: Check if context implements IDataFormatLister, raise Http404 if not

    result = context.get_items_listing(request)
    return result


@view_config(context=IDataFormat,
    permission="rest.update",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatWriter),),
    )
def json_rest_update_f(context, request):
    # TODO: Check if context implements IDataFormatWriter, raise Http404 if not

    return context.update(request)


### FOR DEBUG PURPOSES

@view_config(name="formats",
    context=crud.ITraversable,
    permission="rest.view",
    request_method="GET",
    renderer="string",
    accept="text/plain")
def list_resource_formats(context, request):

    return str(getattr(context, '__data_formats__', None))
