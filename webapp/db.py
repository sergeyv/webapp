# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session
from sqlalchemy.orm import sessionmaker

# from sqlalchemy import create_engine

# In 0.7 an alias from sqlalchemy.exc to deprecated sqlalchemy.exceptions is finally removed
from sqlalchemy.exc import InvalidRequestError, IntegrityError
from sqlalchemy.orm.exc import NoResultFound

from .stats import SessionStatsBase, before_cursor_execute

_DBSession = None


def get_session():
    return _DBSession()


def get_session_class():
    return _DBSession


def set_dbsession(session):
    global _DBSession
    if _DBSession is not None:
        raise AttributeError("_DBSession has been already set to %s!" % _DBSession)

    # raise Exception("GOTCHA: %s!" % session)

    _DBSession = session


def clear_dbsession():
    """
    Clears the dbsession, used in testing teardown
    """
    global _DBSession
    _DBSession = None


class WebappBase(object):
    """
    This class is a superclass of SA-generated Base class,
    which in turn is the superclass of all db-aware classes
    so we can define common functions here

    The opposite approach (subclassing WebappBase from SABase)
    does not work because SA expect __table__ or __tablename__
    attributes to be present on its subclasses
    """

    def __unicode__(self):
        return str(self).decode('utf-8')

    def __str__(self):

        if hasattr(self, 'name') and self.name:
            return str(self.name() if callable(self.name) else self.name)

        if hasattr(self, 'title') and self.title:
            return str(self.title() if callable(self.title) else self.title)

        if hasattr(self, 'id') and self.id:
            return "%s #%s" % (self.__class__.__name__, self.id)

        #if hasattr(super(WebappBase, self), '__str__'):
        #    return super(WebappBase, self).__str__()

        return "<%s %s>" % (self.__class__.__name__, id(self))

    def __repr__(self):
        return "<%s '%s'>" % (self.__class__.__name__, str(self))

    def __setattr__(self, name, value):
        """
        Raise an exception if attempting to assign to an atribute which does not exist in the model.
        We're not checking if the attribute is an SQLAlchemy-mapped column because we also want it to work with properties etc.
        See http://stackoverflow.com/questions/12032260/ for more details.

        Transient attributes need to be prefixed with "_t_"
        """
        if (name != "_sa_instance_state"
          and not hasattr(self, name)
          and not name.startswith("_t_")):
            raise ValueError("Attribute %s is not a mapped column of object %s" % (name, self))
        super(WebappBase, self).__setattr__(name, value)


Base = declarative_base(cls=WebappBase)


def initialize_sql(db_string, db_echo, populate_fn=None):

    # zope.sqlalchemy is not present in worker processes -
    # ultimately we either need to stop importing webapp from non-web code
    # or move db stuff somewhere out of webapp
    from zope.sqlalchemy import ZopeTransactionExtension

    engine = sa.create_engine(db_string, echo=True) #db_echo)
    event.listen(engine, "before_cursor_execute", before_cursor_execute)

    # TODOXXX: We probably don't want SessionStatsBase to be used in
    # the worker process
    session = scoped_session(sessionmaker(class_=SessionStatsBase, extension=ZopeTransactionExtension()))
    session.configure(bind=engine)

    set_dbsession(session)

    Base.metadata.bind = engine

    print "Creating mooball schema"

    conn = engine.connect()
    conn = conn.execution_options(autocommit=False)

    # conn.execute("BEGIN")
    # conn.execute("DROP SCHEMA IF EXISTS mooball CASCADE")
    # conn.execute("CREATE SCHEMA mooball")
    # conn.execute("COMMIT")
    # conn.execute("SET search_path TO mooball")
    # print conn.execute("SELECT current_schema()").scalar()
    # without an explicit bind, create_all may check out a random
    # connection from the pool, which may be different from the one we called
    # search_path on
    # Base.metadata.create_all(bind=conn)
    # TODOXXX: Can we create the extension in a separate schema once
    # so we don't have to create it in every "workspace" schema individually?
    # IN addition, one needs to be a super-user to be able to create extensions
    # conn.execute("CREATE EXTENSION pgcrypto")
    # conn.execute("COMMIT")

    if populate_fn is not None:
        try:
            populate_fn()
        except IntegrityError:
            pass


