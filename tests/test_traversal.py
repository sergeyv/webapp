# -*- coding: utf-8 -*-

from datetime import datetime
from nose.tools import raises, ok_

import sqlalchemy as sa
import schemaish as sc

from pyramid import testing
from pyramid.traversal import traverse
from pyramid.testing import DummyRequest

import crud
import webapp

from . import Student, Organisation, School

from webapp.exc import WebappFormError

session = None
config = None

rr = crud.ResourceRegistry("traversal")
fr = webapp.FormRegistry("traversal")

SCHOOL_ID = 321


# resources
@rr.add(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'view': 'SchoolViewForm',
        }

    subsections = {
        'students': webapp.RestCollection("Students", 'students')
        }


@rr.add(Student)
class StudentResource(webapp.RestResource):
    pass


## forms
#@fr.loadable
#class SchoolViewForm(sc.Structure):
    #id = sc.Integer()
    #name = sc.String()
    #established = sc.DateTime()
    #is_school = sc.Boolean()



class RestRootCollection(webapp.RestCollection):
    subsections = {
        'schools': webapp.RestCollection("Schools", School)
        }

    form_registry = 'traversal'
    resource_registry = 'traversal'


class RootCollection(crud.Collection):
    subsections = {
        'rest': RestRootCollection("Rest", "rest")
        }


_root = RootCollection("kitovu Admin")


def root_factory(request):
    return _root


# set up
def setUp():
    global session
    session = webapp.get_session()
    webapp.Base.metadata.create_all()

    session.add(School(id=SCHOOL_ID, name="School"))
    session.add(Student(id=234, name="Joe Bloggs", school_id=SCHOOL_ID))
    session.add(Student(id=235, name="John Smith", school_id=SCHOOL_ID))
    session.flush()
    session.commit()


def tearDown():
    session.rollback()
    session.close()
    webapp.Base.metadata.drop_all()


# tests


#def test_no_schools():
    #"""
    #Make sure there are no stale objects from the previous tests
    #in the session - session.close() in tearDown() makes sure
    #the session is cleaned after each module
    #"""

    #all = session.query(School).all()
    #ok_(len(all) == 0, msg="Schools table is not empty")

    #num = session.query(Student).count()
    #ok_(num == 0, msg="Students table is not empty")

def test_root():
    result = traverse(_root, "/")
    assert(isinstance(result['context'], RootCollection))


def test_subcollection():
    result = traverse(_root, "/rest")
    assert(isinstance(result['context'], RestRootCollection))


def test_resource():
    result = traverse(_root, "/rest/schools/%s" % SCHOOL_ID)
    context = result['context']
    assert(isinstance(context, SchoolResource))
    assert(isinstance(context.model, School))
    assert(context.model.id == SCHOOL_ID)


def test_resource_collection():
    result = traverse(_root, "/rest/schools/%s/students" % SCHOOL_ID)
    context = result['context']
    assert(isinstance(context, webapp.RestCollection))
    assert(context.subitems_source == 'students')


def test_resource_collection_resource():
    result = traverse(_root, "/rest/schools/%s/students/234" % SCHOOL_ID)
    context = result['context']
    assert(isinstance(context, StudentResource))
    assert(isinstance(context.model, Student))
    assert(context.model.id == 234)


def test_resource_form():
    result = traverse(_root, "/rest/schools/%s" % SCHOOL_ID)
    context = result['context']

    request = DummyRequest(params={
        'format': 'view',
        })
    request.context = context

    from webapp.views.rest import json_rest_get
    result = json_rest_get(context, request)
    assert(result['id'] == SCHOOL_ID)


@raises(WebappFormError)
def test_resource_form_nonexistent():
    result = traverse(_root, "/rest/schools/%s" % SCHOOL_ID)
    context = result['context']

    request = DummyRequest(params={
        'format': 'does_not_exist',
        })
    request.context = context

    from webapp.views.rest import json_rest_get
    result = json_rest_get(context, request)
    # should raise here


# TODO: The code for this is not implemented yet
def test_resource_form_traversal():
    result = traverse(_root, "/rest/schools/%s/@@view" % SCHOOL_ID)
    context = result['context']

    request = DummyRequest(params={})
    request.context = context

    from webapp.views.rest import json_rest_get
    result = json_rest_get(context, request)
    assert(result['id'] == SCHOOL_ID)
