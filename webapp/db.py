# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import threading

from zope.sqlalchemy import ZopeTransactionExtension
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session
from sqlalchemy.orm import sessionmaker

from sqlalchemy import create_engine

# In 0.7 an alias from sqlalchemy.exc to deprecated sqlalchemy.exceptions is finally removed
from sqlalchemy.exc import InvalidRequestError, IntegrityError
from sqlalchemy.orm.exc import NoResultFound



#DBEngine = None

_DBSession = None

#local_storage = threading.local()

def get_session():
    return _DBSession()
    #return local_storage._DBSession()

def get_session_class():
    return _DBSession
    #return local_storage._DBSession

def set_dbsession(session):
    global _DBSession
    if _DBSession is not None:
        raise AttributeError("_DBSession has been already set!")

    _DBSession = session
    #if hasattr(local_storage, "_DBSession"):
    #    raise AttributeError("_DBSession is already set in this thread!")
    #local_storage._DBSession = session

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
        if hasattr(self, 'name') and self.name:
            return str(self.name() if callable(self.name) else self.name)

        if hasattr(self, 'title') and self.title:
            return str(self.title() if callable(self.title) else self.title)

        if hasattr(self, 'id') and self.id:
            return "%s #%s" % (self.__class__.__name__, self.id)

        return repr(self)


    def __str__(self):
        return unicode(self).encode('utf-8')


    @classmethod
    def by_id(cls, object_id):
        """
        Returns a single object by its ID, may return None
        """

        if object_id is None:
            return None
        try:
            result = get_session().query(cls).filter(cls.id==object_id).one()
        except InvalidRequestError:
            # If an object doesn't exist for this ID - return None
            #raise
            return None
        except NoResultFound:
            ## Hmm... now SA raises NoResultFound...
            ##raise
            return None

        return result


    @classmethod
    def from_list_of_ids(cls, ids):
        """
        Returns a list of objects which IDs match the list
        passed to the function

        NOTE: Doesn't preserve order!
        """

        try:
            result = get_session().query(cls).filter(cls.id.in_(ids)).all()
        except InvalidRequestError:
            # If nothing found - return an empty list
            # (though I'm not sure we need this here)
            return []

        return result


Base = declarative_base(cls=WebappBase)

def initialize_sql(db_string, db_echo, populate_fn=None):

    engine = create_engine(db_string, echo=db_echo)

    session = scoped_session(sessionmaker(extension=ZopeTransactionExtension()))
    session.configure(bind=engine)

    set_dbsession(session)

    Base.metadata.bind = engine


    if populate_fn is not None:
        try:
            populate_fn()
        except IntegrityError:
            pass


