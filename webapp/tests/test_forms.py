# -*- coding: utf-8 -*-

from datetime import datetime

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises

session = None


# Our test models

class Organisation(webapp.Base):
    __tablename__ = "organisations3"
    id = sa.Column(sa.Integer, primary_key = True)

    type = sa.Column(sa.String)

    __mapper_args__ = {
        'polymorphic_on' : type,
        }

    name = sa.Column(sa.String)
    established = sa.Column(sa.DateTime)

class School(Organisation):
    __tablename__ = "schools3"
    __mapper_args__ = {'polymorphic_identity' : 'school'}

    id = sa.Column(sa.Integer, sa.ForeignKey('organisations3.id'), primary_key=True)

    is_school = sa.Column(sa.Boolean)


# forms

@webapp.loadable
class GenericForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()

@webapp.loadable
class SpecificForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()
    is_school = sc.Boolean()


@crud.resource(Organisation)
class OrganisationResource(webapp.RestResource):

    data_formats = {
        'generic': 'GenericForm',
        }

@crud.resource(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'specific': 'SpecificForm',
        }


def setUp():
    global session
    session = webapp.get_session()


def tearDown():
    session.rollback()



def test_inheritance():
    """
    if a resource provides no form, webapp looks up the object's parents to see
    if they define the form. So we can declare a form in a parent class
    and use it to serialize children.
    """
    est = datetime.now()
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



