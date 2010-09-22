# -*- coding: utf-8 -*-

import crud

class IRootSection(crud.ISection):
    """
    A marker interface
    """


class RootSection(crud.Section):
    implements(IRootSection)

