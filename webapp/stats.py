"""SQLAlchemy Metadata and Session object"""

# https://gist.github.com/258394

import traceback
from sqlalchemy.orm.session import Session as SessionBase

import webapp


# Query statistics tracking in Session and Sessions setup

class QueryStats(object):
    def __init__(self):
        self.begin()

    def add_query(self, statement, parameters):
        stack = traceback.format_stack()
        self.queries += [(statement, parameters, stack)]
        # self.time_elapsed += elapsed
        self.query_count += 1

    def begin(self):
        self.query_count = 0
        self.queries = []

    def __repr__(self):
        return "%s(query_count=%d)" % (self.__class__.__name__, self.query_count)


def begin(conn):
    webapp.get_session().stats.begin()


def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    webapp.get_session().stats.add_query(str(statement), str(parameters))

#event.listen(engine, "before_execute", before_execute)


class SessionStatsBase(SessionBase):
    """
    Add a stats property to the scoped Session object.
    """
    def __init__(self, *args, **kw):
        SessionBase.__init__(self, *args, **kw)
        self.stats = QueryStats()
