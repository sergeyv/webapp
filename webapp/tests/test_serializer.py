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
    __tablename__ = "schools"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)
    established = sa.Column(sa.DateTime)

class Student(webapp.Base):
    __tablename__ = "students"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)
    school_id = sa.Column(sa.Integer, sa.ForeignKey("schools.id"))
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

@crud.resource(School)
class SchoolResource(webapp.RestResource):

    data_formats = {
        'test': 'SchoolForm',
        'defaults': 'SchoolDefaultsForm',
        'students': 'SchoolWithStudentsForm',
        }


def setUp():
    global session
    session = webapp.get_session()


def tearDown():
    session.rollback()



def test_serialize():
    """
    Serialize an object and see if it contains the values
    """
    est = datetime.now()
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


def test_sequences():
    """
    Serialize an object with some subobjects
    Also, see if fields coming after the sequence
    are serialized properly
    """

    est = datetime.now()
    s = School(id=123, name="TEST!", established = est)

    s.students.append(Student(id=1, name="Student One"))
    s.students.append(Student(id=2, name="Student Two"))

    r = SchoolResource("123", None, s)

    data = r.serialize(format="students")

    assert isinstance(data['students'], list)
    assert len(data['students']) == 2
    assert data['established'] == est
