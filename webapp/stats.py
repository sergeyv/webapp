"""SQLAlchemy Metadata and Session object"""

# https://gist.github.com/258394

from sqlalchemy import MetaData
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.orm.session import Session as SessionBase
from sqlalchemy.interfaces import ConnectionProxy

from datetime import datetime
import time

import webapp


# Query statistics tracking in Session and Sessions setup

class QueryStats(object):
    def __init__(self, query_count=0, time_elapsed=0):
        self.query_count = query_count
        self.time_elapsed = time_elapsed
        self.queries = []

    def add_query(self, statement, elapsed):
        self.queries += [(statement, elapsed)]
        self.time_elapsed += elapsed
        self.query_count += 1

    def __repr__(self):
        return "%s(query_count=%d, time_elapsed=%0.4f)" % (self.__class__.__name__, self.query_count, self.time_elapsed)


class QueryStatsProxy(ConnectionProxy):
    """
    When creating the engine...
        engine = create_engine("...", proxy=QueryStatsProxy())
    """
    def cursor_execute(self, execute, cursor, statement, parameters, context, executemany):
        now = time.time()
        try:
            return execute(cursor, statement, parameters, context)
        finally:
            elapsed = time.time() - now
            webapp.get_session().stats.add_query(statement, elapsed)


class SessionStatsBase(SessionBase):
    """
    Add a stats property to the scoped Session object.
    """
    def __init__(self, *args, **kw):
        SessionBase.__init__(self, *args, **kw)
        self.stats = QueryStats()

