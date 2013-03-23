# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import json
import time
from datetime import datetime

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

#from webapp.testing import sluggish, explode


class bcolors:
    """
    This is for printing color messages in the terminal
    """
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'


def _add_flash_messages(data, request):
    """
    An apptication can produce "flash messages" during the request
    processing which are sent to the client and rendered
    """

    if data is None:
        print "WARNING: A view should return a dict, not None"
    else:
        if len(request.flash_messages):
            data['__flash_messages__'] = request.flash_messages
    return data


def _add_last_changed(data, request):
    """
    Adds last-changed
    """
    # TODOXXX: this introduces a dependency on models, KitovuCommon etc.
    # Need to somehow factor out

    TS_FORMAT = '%Y-%m-%d-%H-%M-%S.%f'  # dashes are to avoid bothering with cookie urlencoding

    if not (isinstance(data, dict)):
        print bcolors.FAIL + "The response at " + request.url + " does not return a JSON dict" + bcolors.ENDC
        print bcolors.WARNING + "Just a nagging reminder to fix this - all views should return a dict" + bcolors.ENDC
        return data

    from models.last_changed import LastChangedItem
    since = request.cookies.get('last_changed', None)
    session = request.dbsession
    query = session.query(LastChangedItem)
    if since is not None:
        # since = datetime.utcfromtimestamp(float(since))
        try:
            since = datetime.strptime(since, TS_FORMAT)
        except ValueError:
            since = datetime.strptime('1900-01-01-00-00-00.000', TS_FORMAT)
        print bcolors.FAIL + ("Since %s" % since) + bcolors.ENDC
        query = query.filter(LastChangedItem.modified > since)
    # TODO: re-enable later
    # alternatively, do not set a cookie, but send a "timestamp key"
    # so if the client knows how to process the __recently_modified__ data
    # it does the processing and then sets the cookie itself, otherwise
    # the data is getting resent until the client does something about it
    # request.response.set_cookie('last_changed', time.time())
    result = []
    for item in query.all():
        result.append(item.item_type)

    if result:
        data['__recently_modified__'] = result
        ts = datetime.utcnow().strftime(TS_FORMAT)
        data['__recently_modified_timestamp__'] = ts
        print bcolors.FAIL + ("TS %s" % ts) + bcolors.ENDC

    return data



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


@view_config(
    name="filters",
    context=IDataFormatLister,
    permission="rest.list",
    request_method="GET",
    renderer="better_json")
def json_rest_filters(context, request):
    """
    Returns a list of possible filters for the current DataFormat:
    /rest/servers/@listing/filters
    """

    # time.sleep(10);

    return context.get_filters(request)


@view_config(
    name="incremental",
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


@view_config(
    context=crud.ICollection,
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

    data = {'ids': params['id']}
    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)

    return data


@view_config(
    context=crud.IResource,
    permission="rest.delete",
    request_method="DELETE",
    renderer="better_json",
    accept="text/plain")
def json_rest_delete_item(context, request):
    """
    When a DELETE request is sent to a Resource,
    it attempts to delete the item itself
    """

    item_id = context.delete_item(request, soft=getattr(context, '__soft_delete__', False))

    data = {'id': item_id}
    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)

    return data


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
@view_config(
    context=IDataFormat,
    permission="rest.create",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatCreator),)
)
def json_rest_create_f(context, request):

    data = context.create(request)
    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)

    return data


@view_config(
    context=IDataFormat,
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
    start = time.time()
    data = context.read(request)

    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)
    #data.setdefault('stats', {})['total_time'] = time.time() - start
    return data


@view_config(
    context=IDataFormat,
    permission="rest.update",
    request_method="PUT",
    renderer="better_json",
    accept="text/plain",
    custom_predicates=(context_implements(IDataFormatWriter),)
)
def json_rest_update_f(context, request):
    """
    """
    data = context.update(request)
    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)

    return data


@view_config(
    context=IDataFormat,
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

    # time.sleep(10);

    data = context.get_items_listing(request)

    if isinstance(data, dict):
        data.setdefault('stats', {})['total_time'] = time.time() - start

    data = _add_flash_messages(data, request)
    data = _add_last_changed(data, request)

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

    data = None

    if hasattr(structure, validator_name):
        data = getattr(structure, validator_name)(format, request)
    elif hasattr(res_or_coll, validator_name):
        data = getattr(res_or_coll, validator_name)(format, request)
    else:
        raise HTTPNotFound("No validator found for attribute %s" % request.subpath[0])

    data = _add_flash_messages(data, request)
    return data


@view_config(
    name="v",  # for 'Vendetta', obviously
    context=IDataFormatWriter,
    permission="rest.update",
    request_method="GET",
    renderer="better_json",
    accept="text/plain",
)
def validate_on_update(context, request):
    return _do_validate(context, request)


@view_config(
    name="v",  # for 'Vendetta', obviously
    context=IDataFormatCreator,
    permission="rest.create",
    request_method="GET",
    renderer="better_json",
    accept="text/plain",
)
def validate_on_create(context, request):
    return _do_validate(context, request)


### FOR DEBUG PURPOSES

@view_config(
    name="formats",
    context=crud.ITraversable,
    permission="rest.view",
    request_method="GET",
    renderer="string",
    accept="text/plain"
)
def list_resource_formats(context, request):

    return str(getattr(context, '__data_formats__', None))
