# -*- coding: utf-8 -*-

from datetime import datetime

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises

from . import Student, Organisation, School

session = None

rr = crud.ResourceRegistry("forms")
fr = webapp.FormRegistry("forms")

# forms

@fr.loadable
class GenericForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()

@fr.loadable
class SpecificForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()
    is_school = sc.Boolean()


@rr.add(Organisation)
class OrganisationResource(webapp.RestResource):

    data_formats = {
        'generic': 'GenericForm',
        }

@rr.add(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'specific': 'SpecificForm',
        }


def setUp():
    global session
    session = webapp.get_session()
    webapp.Base.metadata.create_all()


def tearDown():
    session.rollback()
    session.close()
    webapp.Base.metadata.drop_all()



@raises(ValueError)
def test_inheritance():
    """
    if a resource provides no form, webapp USED TO look up the object's parents to see
    if they define the form. So we COULD declare a form in a parent class
    and use it to serialize children.
    
    This feature has since been disabled, so we just make sure the test
    raises ValueError
    """
    
    est = datetime.utcnow()
    s = School(id=123, name="TEST!", established = est)
    r = SchoolResource("123", None, s)

    data = r.serialize(format="generic")

    assert data['id'] == 123
    assert data['name'] == "TEST!"
    assert data['established'] == est

    data = r.serialize(format="specific")

    assert data['id'] == 123
    assert data['name'] == "TEST!"
    assert data['established'] == est



