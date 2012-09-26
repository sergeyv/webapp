# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

from webapp.forms import get_form_registry_by_name


def form_loader(context, request):
    """
    A view which serves dynamically-loaded forms
    It uses URL dispatch (not traversal)
    and is available at /forms/registry_name/FormID
    """
    registry_name = request.matchdict.get('registry_name', 'default')
    formid = request.matchdict['id']

    form_registry = get_form_registry_by_name(registry_name)

    form = form_registry.get_form(formid)

    if form is not None:
        return form.get_html()

    return "<p>Form %s is not found</p>" % formid