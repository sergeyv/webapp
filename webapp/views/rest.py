# -*- coding: utf-8 -*-

import json

from repoze.bfg.view import bfg_view
from webob import Response

import formish
import schemaish as sc
import validatish as v

import crud

from webapp import DBSession
from webapp.rest import IRestRootSection
from webapp.forms import get_form


@bfg_view(context=crud.ISection, containment=IRestRootSection, permission="rest.list", request_method="GET", renderer="better_json", xhr=True, accept="application/json")
def json_rest_list(context, request, permission=""):
    """
    """
    result = context.get_items_listing(request)
    return result


@bfg_view(name="filters", context=crud.ISection, containment=IRestRootSection, permission="rest.list", request_method="GET", renderer="better_json")
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

@bfg_view(name="incremental", context=crud.ISection, containment=IRestRootSection, permission="rest.list", request_method="GET", renderer="better_json")
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


@bfg_view(context=crud.ISection, containment=IRestRootSection, permission="rest.create", request_method="POST", renderer="better_json", accept="text/plain")
def json_rest_create(context, request):
    """
    """
    print "JSON_REST_CREATE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "JSON_REST_CREATE: %s" % (params)

    # TODO: This is uncool. VocabSection uses that.
    if hasattr(context, 'create_new_item'):
        return context.create_new_item(params, request)

    # TODO: A generic case which probably should be moved to the
    # base class of our context

    # TODO: Add validation here
    new_item = context.create_subitem(params=params, request=request)

    if new_item is not None:
        # The context may choose not to return the item added
        # and do everything itself
        DBSession.add(new_item)

    return {'result':"HELLO FROM THE SERVER"}

@bfg_view(context=crud.ISection, containment=IRestRootSection, permission="rest.delete", request_method="DELETE", renderer="better_json", accept="text/plain")
def json_rest_delete(context, request):
    """
    """
    print "JSON_REST_DELETE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "JSON_REST_DELETE: %s" % (params)

    context.delete_subitems(ids=params['id'])
    return {'result':"HELLO FROM THE SERVER"}


@bfg_view(context=crud.IModel, containment=IRestRootSection, permission="rest.update", request_method="PUT", renderer="better_json", accept="text/plain")
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


@bfg_view(context=crud.IModel, containment=IRestRootSection, permission="rest.view", request_method="GET", renderer="better_json", accept="text/plain")
def json_rest_get(context, request):
    """
    """

    format_name = request.GET.get('format', 'default')

    print "JSON_REST_GET"

    item = context.model

    try:
        form_name = context.data_formats[format_name]
    except KeyError:
        from repoze.bfg.exceptions import ExceptionResponse
        e = ExceptionResponse("Data format '%s' is not registered for %s" % (format_name, context.__class__.__name__))
        e.status = '444 Data Format Not Found'
        raise e

    schema = get_form(form_name).structure

    result = {}

    for (field_name, field) in schema.attrs:
        print "Checking %s" % field_name,
        if hasattr(item, field_name):
            print "... yep."
            result[field_name] = getattr(item, field_name)

    return result

