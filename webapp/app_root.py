# -*- coding: utf-8 -*-

from zope.interface import implements

import crud

class IRootCollection(crud.ICollection):
    """
    A marker interface
    """


class RootCollection(crud.Collection):
    implements(IRootCollection)

