# -*- coding: utf-8 -*-

import json

from pyramid.view import view_config
from webob import Response

import formish
import schemaish as sc
import validatish as v
import dottedish

import crud

from webapp import DBSession
from webapp.rest import IRestRootCollection
from webapp.forms import get_form


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


@view_config(context=crud.ICollection, containment=IRestRootCollection, permission="rest.create", request_method="POST", renderer="better_json", accept="text/plain")
def json_rest_create(context, request):
    """
    """
    print "JSON_REST_CREATE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "JSON_REST_CREATE: %s" % (params)

    # TODO: This is uncool. VocabCollection uses that.
    if hasattr(context, 'create_new_item'):
        return context.create_new_item(params, request)

    # TODO: A generic case which probably should be moved to the
    # base class of our context

    # Formish uses dotted syntax to deal with nested structures
    # we need to unflatten it
    params = dottedish.api.unflatten(params.items())
    
    # TODO: Add validation here
    new_item = context.create_subitem(params=params, request=request)

    if new_item is not None:
        # The context may choose not to return the item added
        # and do everything itself
        DBSession.add(new_item)

    return {'result':"HELLO FROM THE SERVER"}



@view_config(context=crud.ICollection, containment=IRestRootCollection, permission="rest.delete", request_method="DELETE", renderer="better_json", accept="text/plain")
def json_rest_delete_subitems(context, request):
    """
    When a DELETE request is sent to a Collection,
    it expects its body to be a JSON dictionary of ids

    If there's no dictionary, we assume that the Collection is a scalar
    and attempt to delete the item itself

    """
    print "JSON_REST_DELETE_SUBITEMS: request body %s" % (request.body)
    try:
        params = json.loads(request.body)
        ids=params['id']
    except ValueError:
        ids=None
        
    context.delete_subitems(ids)
    
    return {'result':"OK"}



@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.delete", request_method="DELETE", renderer="better_json", accept="text/plain")
def json_rest_delete_item(context, request):
    """
    When a DELETE request is sent to a Resource,
    it attempts to delete the item itself
    """
    print "JSON_REST_DELETE_ITEM"
    return context.delete_item(request) # returns task_id




@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.update", request_method="PUT", renderer="better_json", accept="text/plain")
def json_rest_update(context, request):
    """
    """
    print "JSON_REST_UPDATE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "JSON_STAFF_UPDATE: %s" % (params)

    # TODO: Add validation here
    item = context.model
    for (k,v) in params.items():
        if v: # Do not set empty fields
            setattr(item, k, v)

    #DBSession.add(new_item)
    print "JSON_STAFF_UPDATE: DONE"
    return {'result':"HELLO FROM THE SERVER"}


@view_config(context=crud.IResource, containment=IRestRootCollection, permission="rest.view", request_method="GET", renderer="better_json", accept="text/plain")
def json_rest_get(context, request):
    """
    """

    format_name = request.GET.get('format', 'default')

    print "JSON_REST_GET"

    #item = context.model

    try:
        form_name = context.data_formats[format_name]
    except KeyError:
        from pyramid.exceptions import ExceptionResponse
        e = ExceptionResponse("Data format '%s' is not registered for %s" % (format_name, context.__class__.__name__))
        e.status = '444 Data Format Not Found'
        raise e

    return context.get_data(format=format_name)
    #schema = get_form(form_name).structure

    #result = {}

    #for (field_name, field) in schema.attrs:
        #print "Checking %s" % field_name,
        #if hasattr(item, field_name):
            #print "... yep."
            #result[field_name] = getattr(item, field_name)

    #return result

