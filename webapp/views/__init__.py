# -*- coding: utf-8 -*-
#import rest


def form_loader(context, request):
    """
    A view which serves dynamically-loaded forms
    It uses URL dispatch (not traversal)
    and is available at /forms/FormID
    """
    import webapp
    formid = request.matchdict['id']
    print "Loadable form: %s" % formid
    form = webapp.get_form(formid)
    return form.get_html()
