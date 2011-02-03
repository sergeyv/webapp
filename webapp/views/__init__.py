# -*- coding: utf-8 -*-

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
    if form is not None:
        return form.get_html()

    return "<p>Form %s is not found</p>" % formid