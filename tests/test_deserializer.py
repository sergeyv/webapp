# -*- coding: utf-8 -*-

import schemaish as sc

import crud
import webapp

from pyramid import testing
from webapp.forms.data_format import DataFormatWriter


from . import Student, School

session = None

rr = crud.ResourceRegistry("deserialize")
fr = webapp.FormRegistry("deserialize")


@rr.add(School)
class SchoolResource(webapp.RestResource):

    form_registry = "deserialize"
    resource_registry = "deserialize"

    subsections = {
        'students': webapp.RestCollection("Students", 'students')
        }


@rr.add(Student)
class StudentResource(webapp.RestResource):
    pass


# forms

class StudentForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()


@SchoolResource.readwrite_format
class SchoolForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()
    is_school = sc.Boolean()


@SchoolResource.readwrite_format
class SchoolWithStudentsForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    students = sc.Sequence(StudentForm())
    established = sc.DateTime()


@SchoolResource.readwrite_format
class SchoolDefaultsForm(sc.Structure):
    id = sc.Integer(default=999)
    name = sc.String(default="DEFAULT")
    is_school = sc.Boolean(default=True)


class SchoolDetailsSubform(sc.Structure):
    name = sc.String()
    established = sc.DateTime()


@SchoolResource.readwrite_format
class SchoolFlattenForm(sc.Structure):
    id = sc.Integer()
    details = SchoolDetailsSubform()

    __flatten_subforms__ = ("details")


def setUp():
    global session
    session = webapp.get_session()
    webapp.Base.metadata.create_all()


def tearDown():
    session.rollback()
    session.close()
    webapp.Base.metadata.drop_all()


class DummySchool(object):
    pass


def _get_writer(resource, structure):
    reader = DataFormatWriter(structure)
    reader.__parent__ = resource
    return reader


def _make_request():
    return testing.DummyRequest()


def test_deserialize():
    """
    Serialize an object and see if it contains the values
    """

    data = {
        "id": 123,
        "name": "HELLO",
        "is_school": True,
        "established": "2011-05-10T17:47:56"
        }

    s = School()
    r = SchoolResource("123", None, s)

    data = _get_writer(r, SchoolForm).deserialize(data, _make_request())

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

    s = session.query(School).filter(School.id == 321).one()
    assert len(s.students) == 2
    assert s.students[0].id == 234
    assert s.students[1].id == 235

    data = {
        'id': 321,
        'name': 'New School!',
        '__schema__': SchoolWithStudentsForm,
        'students': {
            0: {'id': '234',
              '__delete__': 1,
            },
            1: {'id': '235',
              'name': 'Ivan Ivanoff',
              '__delete__': '',
              '__new__': False,
            },
            2: {'id': '999',
              'name': 'Arnie',
              '__delete__': None,
              '__new__': "1",
            },
        },
        }

    #data = r.deserialize(data, DummyRequest())
    data = _get_writer(r, SchoolWithStudentsForm).deserialize(data, _make_request())

    session.flush()
    session.commit()

    s = session.query(School).filter(School.id == 321).one()

    assert s.name == 'New School!'
    print "GOT STUDENTS: %s" % s.students
    assert len(s.students) == 2

    s1 = s.students[0]
    s2 = s.students[1]

    assert s1.name == 'Ivan Ivanoff'
    assert s2.name == 'Arnie'

