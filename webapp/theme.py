# -*- coding: utf-8 -*-


#from crud.views.theme import Theme as BasicTheme

#class Theme(BasicTheme):

    #def __init__(self, context, request, page_title=None, registry=None):
        #self.context = context
        #self.request = request
        #self.page_title = page_title
        #self.registry = registry



_theme_registry = {}

def set_theme(name, theme):
    _theme_registry[name] = theme

def get_theme(name):
    return _theme_registry[name]



from pyramid.security import authenticated_userid


class AssetRegistry(object):
    """
    Add custom stuff to the standard theme
    """

    core_js_assets = (
    "/webapp.client/core_js/jquery-1.4.2.js",

    # REST support
    # from http://plugins.jquery.com/project/Rest
    "/webapp.client/core_js/json2.js",
    "/webapp.client/core_js/jquery.rest.js",

    # Client-side templates
    # from http://github.com/aefxx/jQote2
    "/webapp.client/core_js/jquery.jqote2.js",

    # from http://flowplayer.org/tools/

    # Address plugin which deals with the hash part of the url
    # from http://www.asual.com/jquery/address/
    "/webapp.client/core_js/jquery.address-1.2.js",

    # Full JQuery UI from http://jqueryui.com/download
    "/webapp.client/core_js/jquery-ui-1.8.1.custom.min.js",
    # Time picker from http://bililite.com/blog/2009/07/09/updating-timepickr/
    "/webapp.client/core_js/jquery.timepickr.js",

    # http://bassistance.de/jquery-plugins/jquery-plugin-validation/
    "/webapp.client/core_js/jquery.validate.js",
    "/webapp.client/core_js/additional-methods.js",

    # Jquery.cookie plugin - not directly used by the webapp
    # but we need this for doing the auth with orbited
    # from http://plugins.jquery.com/node/1386/release
    "/webapp.client/core_js/jquery.cookie.js",


    # Our framework stuff
    "/webapp.client/js/generic_view.js",
    "/webapp.client/js/generic_form.js",
    "/webapp.client/js/templated_view.js",
    "/webapp.client/js/generic_listing.js",
    "/webapp.client/js/app.js",
    )


    core_css_assets = (
    "/crud_static/default.css",
    "/webapp.client/css/jquery-ui-1.8.1.custom.css",
    "/webapp.client/css/webapp.css",
    )

    def __init__(self, css_assets=None, js_assets=None):


        self.js_assets = [r for r in self.core_js_assets]
        if js_assets is not None:
            for r in js_assets:
                self.js_assets.append(r)


        self.css_assets = [r for r in self.core_css_assets]
        if css_assets is not None:
            for r in css_assets:
                self.css_assets.append(r)


    def render_javascript_assets(self):
        lines = ["<!-- JS assets -->"]
        for r in self.js_assets:
            line = """<script language="javascript" src="%s"></script>""" % r
            lines.append(line)

        return "\n".join(lines)

    def render_css_assets(self):
        lines = ["<!-- CSS assets -->"]
        for r in self.css_assets:
            line = """<link rel="stylesheet" href="%s" />""" % r
            lines.append(line)
        return "\n".join(lines)

    def add_js_asset(self, r):
        self.js_assets.append(r)

    def add_css_asset(self, r):
        self.css_asset.append(r)

    def remove_js_asset(self, r):
        try:
            self.js_assets.remove(r)
        except ValueError:
            pass

    def remove_css_asset(self, r):
        try:
            self.css_assets.remove(r)
        except ValueError:
            pass

