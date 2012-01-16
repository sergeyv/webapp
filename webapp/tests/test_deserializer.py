# -*- coding: utf-8 -*-

from datetime import datetime

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises

from . import Student, Organisation, School

session = None

rr = crud.ResourceRegistry("deserialize")
fr = webapp.FormRegistry("deserialize")

# forms

class StudentForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()

@fr.loadable
class SchoolForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()
    is_school = sc.Boolean()

@fr.loadable
class SchoolWithStudentsForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    students = sc.Sequence(StudentForm())
    established = sc.DateTime()

@fr.loadable
class SchoolDefaultsForm(sc.Structure):
    id = sc.Integer(default=999)
    name = sc.String(default="DEFAULT")
    is_school = sc.Boolean(default=True)

class SchoolDetailsSubform(sc.Structure):
    name = sc.String()
    established = sc.DateTime()

@fr.loadable
class SchoolFlattenForm(sc.Structure):
    id = sc.Integer()
    details = SchoolDetailsSubform()

    __flatten_subforms__ = ("details")

@rr.add(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'test': 'SchoolForm',
        'defaults': 'SchoolDefaultsForm',
        'students': 'SchoolWithStudentsForm',
        'flat': 'SchoolFlattenForm',
        }

    subsections = {
        'students': webapp.RestCollection("Students", 'students')
        }

@rr.add(Student)
class StudentResource(webapp.RestResource):
    pass


def setUp():
    global session
    session = webapp.get_session()
    crud_root = crud.Collection( "test" )
    crud.crud_init(session)


def tearDown():
    session.rollback()
    #webapp.Base.metadata.clear()
    #sa.orm.clear_mappers()


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



def test_sequences():

    s = School(id=321, name="School")
    r = SchoolResource("321", None, s)
    session.add(s)
    session.add(Student(id=234, name="Joe Bloggs", school_id=321))
    session.add(Student(id=235, name="John Smith", school_id=321))

    session.flush()
    session.commit()

    s = session.query(School).filter(School.id==321).one()
    assert len(s.students) == 2
    assert s.students[0].id == 234
    assert s.students[1].id == 235

    data = {
        'id': 321,
        'name': 'New School!',
        '__schema__': SchoolWithStudentsForm,
        'students': {
            0: { 'id': '234',
              '__delete__': 1,
            },
            1: { 'id': '235',
              'name': 'Ivan Ivanoff',
              '__delete__': '',
              '__new__': False,
            },
            2:{ 'id': '999',
              'name': 'Arnie',
              '__delete__': None,
              '__new__': "1",
            },
        },
        }

    data = r.deserialize(data, DummyRequest())

    session.flush()
    session.commit()
    s = session.query(School).filter(School.id==321).one()

    assert s.name == 'New School!'
    print "GOT STUDENTS: %s" % s.students
    assert len(s.students) == 2

    s1 = s.students[0]
    s2 = s.students[1]

    assert s1.name == 'Ivan Ivanoff'
    assert s2.name == 'Arnie'

