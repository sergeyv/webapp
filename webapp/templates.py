# -*- coding: utf-8 -*-

from zope.interface import implements

import crud

from webapp.db import DBSession
from webapp.forms import get_form

class ITemplatesCollection(crud.ICollection):
    pass


class TemplatesCollection(crud.Collection):
    """
    A section to serve client-side templates (jquote etc.)
    Application can register views for ITemplatesCollection
    and load them from /templates/templateid
    """

    implements(ITemplatesCollection)
