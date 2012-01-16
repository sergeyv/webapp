# -*- coding: utf-8 -*-

from datetime import datetime

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises


from . import Student, Organisation, School

session = None

rr = crud.ResourceRegistry("serializer")
fr = webapp.FormRegistry("serializer")


# forms

class StudentForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()

@fr.loadable
class SchoolForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()
    established = sc.DateTime()

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
        
    form_registry = "serializer"


def setUp():
    global session
    session = webapp.get_session()


def tearDown():
    session.rollback()
    #webapp.Base.metadata.clear()
    #sa.orm.clear_mappers()



def test_serialize():
    """
    Serialize an object and see if it contains the values
    """
    est = datetime.utcnow()
    s = School(id=123, name="TEST!", established = est)
    r = SchoolResource("123", None, s)

    data = r.serialize(format="test")

    assert data['id'] == 123
    assert data['name'] == "TEST!"
    assert data['established'] == est

def test_defaults():
    """
    Serialize an object using a form with defaults set and see if they come through
    """

    m = School()
    r = SchoolResource("123", None, m)


    data = r.serialize(format="defaults")

    assert data['id'] == 999
    assert data['name'] == "DEFAULT"

def test_defaults_value():
    """
    Serialize an object using a form with defaults if object's
    fields override the defaults
    """

    m = School(id=123, name="TEST!")
    r = SchoolResource("123", None, m)

    # If the model has some data then it should be used instead


    data = r.serialize(format="defaults")

    assert data['id'] == 123
    assert data['name'] == "TEST!"
    assert data['is_school'] == True




def test_sequences():
    """
    Serialize an object with some subobjects
    Also, see if fields coming after the sequence
    are serialized properly
    """

    est = datetime.utcnow()
    s = School(id=123, name="TEST!", established = est)

    s.students.append(Student(id=1, name="Student One"))
    s.students.append(Student(id=2, name="Student Two"))

    r = SchoolResource("123", None, s)

    data = r.serialize(format="students")

    assert isinstance(data['students'], list)
    assert len(data['students']) == 2
    assert data['established'] == est

def test_html_escape():
    """
    Try to serialize some html and see if it gets escaped
    """

    m = School(id=123, name="<h1>Nasty Hacker!</h1>")
    r = SchoolResource("123", None, m)

    # check < >
    data = r.serialize(format="defaults")

    #assert data['id'] == 123
    assert "<" not in data['name']
    assert ">" not in data['name']

    m.name="&laquo;Nice quotes!&raquo;"
    data = r.serialize(format="defaults")
    assert "&laquo;" not in data['name']
    assert "&raquo;" not in data['name']

def test_form_flattening():
    """
    Test if __flatten_subforms__ attribute works - it should take the data from the item instead of trying to find a subobject... so
    data["details"]['name'] come from obj.name, not from (non-existent) obj.details.name
    """
    est = datetime.utcnow()
    s = School(id=123, name="TEST!", established = est)
    r = SchoolResource("123", None, s)

    data = r.serialize(format="flat")

    assert data['id'] == 123
    assert data["details"]['name'] == "TEST!"
    assert data["details"]['established'] == est

