# -*- coding: utf-8 -*-

import json

from pyramid.view import view_config
from webob import Response

import formish
import schemaish as sc
import dottedish

import crud

from webapp.db import get_session
from webapp.rest import IRestRootCollection
from webapp.forms import get_form

from webapp.testing import sluggish, explode

@view_config(name="new", context=crud.ICollection, containment=IRestRootCollection, permission="rest.list", request_method="GET", renderer="better_json")
def json_rest_empty(context, request):
    """
    Returns an empty item with all fields set to default values
    """

    print "JSON_REST_EMPTY: request body %s" % (request.body)
    return context.get_empty(request)


def _create_item(context, request):
    """
    """
    if hasattr(context, "before_item_created"):
        context.before_item_created

    print "+JSON_REST_CREATE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "+JSON_REST_CREATE: %s" % (params)
    # Formish uses dotted syntax to deal with nested structures
    # we need to unflatten it
    params = dottedish.api.unflatten(params.items())

    # TODO: Add validation here
    new_item = context.create_subitem(params=params, request=request)

    #if new_item is not None:
    #    # The context may choose not to return the item added
    #    # and do everything itself
    #    session = get_session()


    return new_item.id


@view_config(name="new", context=crud.ICollection, containment=IRestRootCollection, permission="rest.create", request_method="PUT", renderer="better_json", accept="text/plain")
def json_rest_create_new(context, request):
    """
    """
    return _create_item(context, request)

@view_config(context=crud.ICollection, containment=IRestRootCollection, permission="rest.create", request_method="POST", renderer="better_json", accept="text/plain")
def json_rest_create(context, request):
    """
    """
    return _create_item(context, request)


@view_config(context=crud.ICollection, containment=IRestRootCollection, permission="rest.list", request_method="GET", renderer="better_json", xhr=True, accept="application/json")
def json_rest_list(context, request, permission=""):
    """
    """
    result = context.get_items_listing(request)
    return result


@view_config(name="filters", context=crud.ICollection, containment=IRestRootCollection, permission="rest.list", request_method="GET", renderer="better_json")
def json_rest_filters(context, request):
    """
    Returns a list of possible filters for the current section

    TODO: Is it restful or not?
    """
    print "JSON_REST_FILTERS: request body %s" % (request.body)

    fn =  getattr(context, 'get_filters', None)
    if fn is not None:
        result = fn(request)
        return result

    return {'result':"HELLO! No filters found!"}

@view_config(name="incremental", context=crud.ICollection, containment=IRestRootCollection, permission="rest.list", request_method="GET", renderer="better_json")
def json_rest_incremental(context, request):
    """
    Returns a list of items which match a search string
    Should return just id:title pairs, not full objects

    TODO: Is it restful or not?
    """
    print "JSON_REST_INCREMENTAL: request body %s" % (request.body)

    fn =  getattr(context, 'get_incremental', None)
    if fn is not None:
        result = fn(request)
        return result

    return {'result':"HELLO! Nothing found!"}



@view_config(context=crud.ICollection, containment=IRestRootCollection, permission="rest.delete", request_method="DELETE", renderer="better_json", accept="text/plain")
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
        ids=params['id']
    except ValueError:
        ids=None

    context.delete_subitems(ids, request)

    return {'result':"OK"}



@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.delete", request_method="DELETE", renderer="better_json", accept="text/plain")
def json_rest_delete_item(context, request):
    """
    When a DELETE request is sent to a Resource,
    it attempts to delete the item itself
    """
    result = context.delete_item(request) # returns task_id


    if hasattr(context, "after_item_deleted"):
        context.after_item_deleted(request)

    return result





@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.update", request_method="PUT", renderer="better_json", accept="text/plain")
def json_rest_update(context, request):
    """
    """
    if hasattr(context, "before_item_updated"):
        context.before_item_updated(request)

    print "JSON_REST_UPDATE: request body %s" % (request.body)
    params = json.loads(request.body)

    # Formish uses dotted syntax to deal with nested structures
    # we need to unflatten it
    params = dottedish.api.unflatten(params.items())
    context.update(params, request)

    return {'result':"HELLO FROM THE SERVER"}


@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.view", request_method="GET", renderer="better_json", accept="text/plain")
def json_rest_get(context, request):
    """
    """


    format_name = request.GET.get('format', 'default')
    annotate = bool(request.GET.get('ann', False))
    data = context.serialize(format=format_name, annotate=annotate)

    return data

