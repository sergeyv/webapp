# -*- coding: utf-8 -*-
from zope.sqlalchemy import ZopeTransactionExtension
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session
from sqlalchemy.orm import sessionmaker

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError

DBSession = scoped_session(sessionmaker(extension=ZopeTransactionExtension()))


class WebappBase(object):
    """
    This class is a superclass of SA-generated Base class,
    which in turn is the superclass of all db-aware classes
    so we can define common functions here

    The opposite approach (subclassing WebappBase from SABase)
    does not work because SA expect __table__ or __tablename__
    attributes to be present on its subclasses
    """


    def __str__(self):
        if hasattr(self, 'name') and self.name:
            return str(self.name)

        if hasattr(self, 'title') and self.title:
            return str(self.title)

        if hasattr(self, 'id') and self.id:
            return "%s #%s" % (self.__class__.__name__, self.id)

        return super(WebappBase, self).__str__()


    @classmethod
    def vocab(classobj, filter=None):
        """
        returns a list of all items of a given class suitable for a listbox dropdown
        """
        return [ (item.id, str(item)) for item in DBSession.query(classobj).all() ]


Base = declarative_base(cls=WebappBase)



def initialize_sql(db_string, db_echo):
    engine = create_engine(db_string, echo=db_echo)
    DBSession.configure(bind=engine)
    Base.metadata.bind = engine
    Base.metadata.create_all(engine)
    #try:
    #    populate()
    #except IntegrityError:
    #    pass

