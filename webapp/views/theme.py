# -*- coding: utf-8 -*-


from crud.views.theme import Theme as BasicTheme

class Theme(BasicTheme):

    def __init__(self, context, request, page_title=None, registry=None):
        self.context = context
        self.request = request
        self.page_title = page_title
        self.registry = registry



class ResourceRegistry(object):
    """
    Add custom stuff to the standard theme
    """

    core_js_resources = (
    "/webapp.static/core_js/jquery-1.4.2.js",

    # REST support
    # from http://plugins.jquery.com/project/Rest
    "/webapp.static/core_js/json2.js",
    "/webapp.static/core_js/jquery.rest.js",

    # Client-side templates
    # from http://github.com/aefxx/jQote2
    "/webapp.static/core_js/jquery.jqote2.js",

    # from http://flowplayer.org/tools/

    # Address plugin which deals with the hash part of the url
    # from http://www.asual.com/jquery/address/
    "/webapp.static/core_js/jquery.address-1.2.js",

    # Full JQuery UI from http://jqueryui.com/download
    "/webapp.static/core_js/jquery-ui-1.8.1.custom.min.js",
    # Time picker from http://bililite.com/blog/2009/07/09/updating-timepickr/
    "/webapp.static/core_js/jquery.timepickr.js",

    # http://bassistance.de/jquery-plugins/jquery-plugin-validation/
    "/webapp.static/core_js/jquery.validate.js",
    "/webapp.static/core_js/additional-methods.js",

    # Our framework stuff
    "/webapp.static/js/generic_view.js",
    "/webapp.static/js/generic_form.js",
    "/webapp.static/js/app.js",
    )


    core_css_resources = (
    "/crud_static/default.css",
    "/webapp.static/css/jquery-ui-1.8.1.custom.css",
    "/webapp.static/css/webapp.css",
    )

    def __init__(self, css_resources=None, js_resources=None):


        self.js_resources = [r for r in self.core_js_resources]
        if js_resources is not None:
            for r in js_resources:
                self.js_resources.append(r)


        self.css_resources = [r for r in self.core_css_resources]
        if css_resources is not None:
            for r in css_resources:
                self.css_resources.append(r)


    def render_javascript_resources(self):
        lines = ["<!-- JS resources -->"]
        for r in self.js_resources:
            line = """<script language="javascript" src="%s"></script>""" % r
            lines.append(line)

        return "\n".join(lines)

    def render_css_resources(self):
        lines = ["<!-- CSS resources -->"]
        for r in self.css_resources:
            line = """<link rel="stylesheet" href="%s" />""" % r
            lines.append(line)
        return "\n".join(lines)

    def add_js_resource(self, r):
        self.js_resources.append(r)

    def add_css_resource(self, r):
        self.css_resources.append(r)

