# -*- coding: utf-8 -*-

from datetime import datetime

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises

session = None


# Our test models

class School(webapp.Base):
    __tablename__ = "de_schools"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)
    established = sa.Column(sa.DateTime)
    is_school = sa.Column(sa.Boolean)

class Student(webapp.Base):
    __tablename__ = "de_students"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)
    school_id = sa.Column(sa.Integer, sa.ForeignKey("de_schools.id"))
    school = sa.orm.relationship(School, backref="students")

# forms

class StudentForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()

@webapp.loadable
class SchoolForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()
    is_school = sc.Boolean()

@webapp.loadable
class SchoolWithStudentsForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    students = sc.Sequence(StudentForm())
    established = sc.DateTime()

@webapp.loadable
class SchoolDefaultsForm(sc.Structure):
    id = sc.Integer(default=999)
    name = sc.String(default="DEFAULT")
    is_school = sc.Boolean(default=True)

class SchoolDetailsSubform(sc.Structure):
    name = sc.String()
    established = sc.DateTime()

@webapp.loadable
class SchoolFlattenForm(sc.Structure):
    id = sc.Integer()
    details = SchoolDetailsSubform()

    __flatten_subforms__ = ("details")

@crud.resource(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'test': 'SchoolForm',
        'defaults': 'SchoolDefaultsForm',
        'students': 'SchoolWithStudentsForm',
        'flat': 'SchoolFlattenForm',
        }


def setUp():
    global session
    session = webapp.get_session()


def tearDown():
    session.rollback()

class DummyRequest(object):
    pass

class DummySchool(object):
    pass

def test_deserialize():
    """
    Serialize an object and see if it contains the values
    """

    data = {
        "id":123,
        "name":"HELLO",
        "is_school": True,
        "established": "2011-05-10T17:47:56",
        "__schema__":SchoolForm
    }

    s = School()
    r = SchoolResource("123", None, s)

    data = r.deserialize(data, DummyRequest())

    assert s.id == 123
    assert s.name == "HELLO"
    print "IS SCHOOL: %s" % s.is_school
    assert s.is_school == True

