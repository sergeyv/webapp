# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import webapp

def form_loader(context, request):
    """
    A view which serves dynamically-loaded forms
    It uses URL dispatch (not traversal)
    and is available at /forms/FormID
    """
    formid = request.matchdict['id']
    form = webapp.get_form(formid)
    if form is not None:
        return form.get_html()

    return "<p>Form %s is not found</p>" % formid