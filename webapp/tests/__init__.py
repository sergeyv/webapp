# -*- coding: utf-8 -*-

import sqlalchemy as sa

import crud
import webapp

from unittest import TestCase

from paste.deploy import loadapp
from paste.script.appinstall import SetupCommand

class Organisation(webapp.Base):
    __tablename__ = "organisations"
    id = sa.Column(sa.Integer, primary_key = True)

    type = sa.Column(sa.String)

    __mapper_args__ = {
        'polymorphic_on' : type,
        }

    name = sa.Column(sa.String)
    established = sa.Column(sa.DateTime)

class School(Organisation):
    __tablename__ = "schools"
    __mapper_args__ = {'polymorphic_identity' : 'school'}

    id = sa.Column(sa.Integer, sa.ForeignKey('organisations.id'), primary_key=True)

    is_school = sa.Column(sa.Boolean)

    
class Student(webapp.Base):
    __tablename__ = "students"
    id = sa.Column(sa.Integer, primary_key = True)
    name = sa.Column(sa.String)
    school_id = sa.Column(sa.Integer, sa.ForeignKey("schools.id"))
    school = sa.orm.relationship(School, backref="students")

    def __repr__(self):
        return "<Student %s (%s) from school #%s>" % (self.name, self.id, self.school_id)


def setUp():
    # SQLite database in memory
    DB_STRING = 'sqlite://'
    DB_ECHO = True

    engine = sa.create_engine(DB_STRING, echo=DB_ECHO)

    session = sa.orm.scoped_session(sa.orm.sessionmaker(bind=engine))
    session.configure()

    webapp.set_dbsession(session)
    crud.crud_init(session)
    webapp.Base.metadata.bind = engine


def tearDown():
    webapp.Base.metadata.drop_all()
    #raise Exception()

