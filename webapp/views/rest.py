# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import json
import time

# from webob import Response

# import formish
# import schemaish as sc
import dottedish
from pyramid.view import view_config
from pyramid.httpexceptions import HTTPNotFound

import crud

from webapp.forms.data_format import (
    IDataFormat,
    IDataFormatReader,
    IDataFormatWriter,
    IDataFormatLister,
    IDataFormatCreator
    )

# from webapp.testing import sluggish, explode


# TODOXXX: fix remote validation
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



@view_config(name="filters",
    context=IDataFormatLister,
    permission="rest.list",
    request_method="GET",
    renderer="better_json")
def json_rest_filters(context, request):
    """
    Returns a list of possible filters for the current collection
    (although it's called in the context of a DataFormat, like this:
    /rest/servers/@listing/filters )
    """
    fn = getattr(context.__parent__, 'get_filters', None)
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

    TODOXXX: This should work in the context of a DataFormatListing,
    so if no listing format then there'd be no listing. Currently it's not possible
    to restrict the incremental search per-collection
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


def context_implements(*types):
    """
    A custom predicate to implement matching views to resources which
    implement more than one interface - in this situation Pyramid has
    trouble matching views to the second registered interface. See
    https://github.com/Pylons/pyramid/issues/409#issuecomment-3578518

    Accepts a list of interfaces - if ANY of them are implemented the function
    returns True
    """
    def inner(context, request):
        for typ in types:
            if typ.providedBy(context):
                return True
        return False
    return inner


# TODOXXX: The method should be POST
@view_config(context=IDataFormat,
    permission="rest.create",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatCreator),)
    )
def json_rest_create_f(context, request):
    return context.create(request)



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
    the current data format
    """
    return context.read(request)


@view_config(context=IDataFormat,
    permission="rest.update",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatWriter),)
    )
def json_rest_update_f(context, request):
    """
    """
    return context.update(request)


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
    start = time.time()
    data = context.get_items_listing(request)
    data['stats']['total_time'] = time.time() - start
    return data


# Remote validation

def _do_validate(context, request):
    """
    The client invokes an url like /rest/users/123/@view/v/name?name=john;
    this function checks if there's a validation hook named "validate_name"
    either on the structure or on the resource and calls them.

    If no hook found raises 404
    """

    if len(request.subpath) != 1:
        raise HTTPNotFound("Need to provide validator name")

    validator_name = 'validate_' + request.subpath[0]

    format = context
    res_or_coll = format.__parent__
    structure = format.structure


    if hasattr(structure, validator_name):
        return getattr(structure, validator_name)(format, request)
    if hasattr(res_or_coll, validator_name):
        return getattr(res_or_coll, validator_name)(format, request)

    raise HTTPNotFound("No validator found for attribute %s" % request.subpath[0])


@view_config(name="v",  # for 'Vendetta', obviously
    context=IDataFormatWriter,
    permission="rest.update",
    request_method="GET",
    renderer="better_json",
    accept="text/plain",
    )
def validate_on_update(context, request):
    return _do_validate(context, request)


@view_config(name="v",  # for 'Vendetta', obviously
    context=IDataFormatCreator,
    permission="rest.create",
    request_method="GET",
    renderer="better_json",
    accept="text/plain",
    )
def validate_on_create(context, request):
    return _do_validate(context, request)


### FOR DEBUG PURPOSES

@view_config(name="formats",
    context=crud.ITraversable,
    permission="rest.view",
    request_method="GET",
    renderer="string",
    accept="text/plain")
def list_resource_formats(context, request):

    return str(getattr(context, '__data_formats__', None))
