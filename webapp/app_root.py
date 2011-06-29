# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

from zope.interface import implements

import crud

class IRootCollection(crud.ICollection):
    """
    A marker interface
    """


class RootCollection(crud.Collection):
    implements(IRootCollection)

