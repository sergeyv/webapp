# -*- coding: utf-8 -*-

import sqlalchemy as sa
import webapp

from unittest import TestCase

from paste.deploy import loadapp
from paste.script.appinstall import SetupCommand


# export dbfixture here for tests :
#__all__ = ['TestController', 'dbfixture']



def setUp():
    DB_STRING = 'sqlite://'
    DB_ECHO = True

    engine = sa.create_engine(DB_STRING, echo=DB_ECHO)

    session = sa.orm.scoped_session(sa.orm.sessionmaker())
    session.configure(bind=engine)

    webapp.set_dbsession(session)

    webapp.Base.metadata.bind = engine
    webapp.Base.metadata.create_all(engine)


def tearDown():
    print "__init__.py -> tearDown"
    webapp.Base.metadata.drop_all()

