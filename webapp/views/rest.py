# -*- coding: utf-8 -*-

import json

from repoze.bfg.view import bfg_view
from webob import Response

import formish
import schemaish as sc
import validatish as v

import crud

from webapp import DBSession



@bfg_view(context=crud.ISection, containment=IRestRootSection, permission="rest.list", request_method="GET", renderer="better_json", xhr=True, accept="application/json")
def json_rest_list(context, request, permission=""):
    """
    """
    result = context.get_items_listing(request)
    return result


@bfg_view(context=crud.ISection, containment=IRestRootSection, permission="rest.create", request_method="POST", renderer="better_json", accept="text/plain")
def json_rest_create(context, request):
    """
    """
    print "JSON_REST_CREATE: request body %s" % (request.body)

    params = json.loads(request.body)
    print "JSON_REST_CREATE: %s" % (params)

    if hasattr(context, 'create_new_item'):
        return context.create_new_item(params)

    # TODO: A generic case which probably should be moved to the
    # base class of our context

    # TODO: Add validation here
    new_item = context.create_subitem()
    for (k,v) in params.items():
        if v: # Do not set empty fields
            setattr(new_item, k, v)

    DBSession.add(new_item)
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
    #try:
    schema = context.data_formats[format_name]
    #except AttributeError:
    #    print "CONTEXT: %s" % context

    result = {}

    for (field_name, field) in schema.attrs:
        print "Checking %s" % field_name,
        if hasattr(item, field_name):
            print "... yep."
            result[field_name] = getattr(item, field_name)

    return result

