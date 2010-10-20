# -*- coding: utf-8 -*-

from zope.interface import implements

import crud

from webapp.db import DBSession
from webapp.forms import get_form

class ITemplatesSection(crud.ISection):
    pass


class TemplatesSection(crud.Section):
    """
    A section to serve client-side templates (jquote etc.)
    Application can register views for ITemplatesSection
    and load them from /templates/templateid
    """

    implements(ITemplatesSection)
