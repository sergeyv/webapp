# -*- coding: utf-8 -*-

from zope.interface import implements

import crud

class IRootSection(crud.ISection):
    """
    A marker interface
    """


class RootSection(crud.Section):
    implements(IRootSection)

