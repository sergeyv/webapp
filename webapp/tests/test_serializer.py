# -*- coding: utf-8 -*-

import sqlalchemy as sa
import schemaish as sc

import crud
import webapp

from nose.tools import raises

session = None

class TestModel(webapp.Base):
    __tablename__ = "test_models"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)


@webapp.loadable
class TestForm(sc.Structure):
    id = sc.Integer()
    name = sc.String()

@webapp.loadable
class DefaultsForm(sc.Structure):
    id = sc.Integer(default=999)
    name = sc.String(default="DEFAULT")

@crud.resource(TestModel)
class TestResource(webapp.RestResource):

    data_formats = {
        'test': 'TestForm',
        'defaults': 'DefaultsForm',
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

    m = TestModel(id=123, name="TEST!")
    r = TestResource("123", None, m)

    data = r.serialize(format="test")

    assert data['id'] == 123
    assert data['name'] == "TEST!"

def test_defaults():
    """
    Serialize an object using a form with defaults set and see if they come through
    """

    m = TestModel()
    r = TestResource("123", None, m)


    data = r.serialize(format="defaults")
    assert data['id'] == 999
    assert data['name'] == "DEFAULT"


def test_defaults_value():
    """
    Serialize an object using a form with defaults if object's
    fields override the defaults
    """

    m = TestModel(id=123, name="TEST!")
    r = TestResource("123", None, m)

    # If the model has some data then it should be used instead


    data = r.serialize(format="defaults")

    assert data['id'] == 123
    assert data['name'] == "TEST!"

