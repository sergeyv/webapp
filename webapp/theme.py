# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

#_theme_registry = {}
#
#def set_theme(name, theme):
#    _theme_registry[name] = theme
#
#def get_theme(name):
#    return _theme_registry[name]


class AssetRegistry(object):
    """
    Add custom stuff to the standard theme
    """

    core_js_assets = (
    "/webapp.client/core_js/jquery-1.7.js",

    # REST support
    # from http://plugins.jquery.com/project/Rest
    "/webapp.client/core_js/json2.js",
    #"/webapp.client/core_js/jquery.rest.js",

    # Client-side templates
    # from http://github.com/aefxx/jQote2
    "/webapp.client/core_js/jquery.jqote2.js",

    # Formish
    #"/formish.js/formish.js",

    # from http://flowplayer.org/tools/

    # Address plugin which deals with the hash part of the url
    # from http://www.asual.com/jquery/address/
    "/webapp.client/core_js/jquery.address.js",

    # Full JQuery UI from http://jqueryui.com/download
    "/webapp.client/core_js/jquery-ui-1.8.16.custom.min.js",
    # Time picker from http://bililite.com/blog/2009/07/09/updating-timepickr/
    "/webapp.client/core_js/jquery.timepickr.js",

    # http://bassistance.de/jquery-plugins/jquery-plugin-validation/
    "/webapp.client/core_js/jquery.validate.js",
    "/webapp.client/core_js/additional-methods.js",

    # Time picker addon for datepicker http://trentrichardson.com/examples/timepicker/
    # NOT USED
    #"/webapp.client/core_js/jquery-ui-timepicker-addon.js",

    # Simple jquery color picker https://github.com/tkrotoff/jquery-simplecolorpicker
    "/webapp.client/core_js/jquery.simplecolorpicker.js",

    # from http://plugins.jquery.com/node/1386/release
    # we're using this for caching
    "/webapp.client/core_js/jquery.cookie.js",


    # Formish
    "/webapp.client/js/formish_support.js",


    # Our framework stuff
    "/webapp.client/js/webapp.js",
    "/webapp.client/js/controller.js",
    "/webapp.client/js/view.js",
    "/webapp.client/js/template.js",
    "/webapp.client/js/form.js",
    "/webapp.client/js/listing.js",
    "/webapp.client/js/infinite_listing.js",
    "/webapp.client/js/filters.js",
    "/webapp.client/js/partial.js",

    )


    core_css_assets = (
    "/crud_static/default.css",
    "/webapp.client/css/jquery-ui-1.8.16.custom.css",
    "/webapp.client/css/jquery.simplecolorpicker.css",
    #"/formish.css/formish.css",
    "/webapp.client/css/webapp.css",
    )
    
    core_less_assets = ()

    def __init__(self, less_assets=None, css_assets=None, js_assets=None):


        self.js_assets = [r for r in self.core_js_assets]
        if js_assets is not None:
            for r in js_assets:
                self.js_assets.append(r)


        self.css_assets = [r for r in self.core_css_assets]
        if css_assets is not None:
            for r in css_assets:
                self.css_assets.append(r)

        self.less_assets = [r for r in self.core_less_assets]
        if less_assets is not None:
            for r in less_assets:
                self.less_assets.append(r)


    def render_javascript_assets(self):
        lines = ["<!-- JS assets -->"]
        for r in self.js_assets:
            line = """<script type="text/javascript" src="%s"></script>""" % r
            lines.append(line)

        return "\n".join(lines)

    def render_css_assets(self):
        lines = ["<!-- CSS assets -->"]
        for r in self.css_assets:
            line = """<link rel="stylesheet" type="text/css" href="%s" />""" % r
            lines.append(line)
        return "\n".join(lines)

    def render_less_assets(self):
        lines = ["<!-- LESS assets -->"]
        for r in self.less_assets:
            line = """<link rel="stylesheet/less" type="text/css" href="%s" />""" % r
            lines.append(line)
        return "\n".join(lines)

    def add_js_asset(self, r):
        self.js_assets.append(r)

    def add_css_asset(self, r):
        self.css_asset.append(r)

    def add_less_asset(self, r):
        self.less_asset.append(r)

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

    def remove_less_asset(self, r):
        try:
            self.less_assets.remove(r)
        except ValueError:
            pass

    def replace_js_assets(self, new_assets):
        self.js_assets = new_assets

    def replace_css_assets(self, new_assets):
        self.css_assets = new_assets

    def replace_less_assets(self, new_assets):
        self.less_assets = new_assets
