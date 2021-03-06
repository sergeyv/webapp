(function ($, webapp) {
    "use strict";

    function View(options) {
        this.options = $.extend({}, options);
        /*
        sometimes we want to call a view's method without showing the view first
        - this works better if this.event exists, even if empty
        */
        this.event = {};
    }

    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    View.prototype.constructor = View;


    View.prototype.init = function () {
        /// this is called _before_ the view is loaded
        /// (as the view is loaded on demand)
        /// so the html stuff is not available yet
        var self = this,
            nodeId = self.options.identifier + '-view',
            $node;

        self.view = $("#" + self.options.identifier + "-view");
        if (!self.view.length) {
            /// Create and append a node if not found

            $node = $('<div id="' + nodeId + '">');

            console.log("Init: " + nodeId);
            $("#content-views").append($node);
            self.view = $("#" + nodeId);

            if (self.decorateView) {
                self.decorateView();
            }
        }
        this.alreadyInitialized = true;
    };


    View.prototype.show = function () {
        if (!this.alreadyInitialized) {
            this.init();
        }
        webapp.controller.setActiveView(this);
    };

    View.prototype.log_timings = function () {
    };

    View.prototype.get_title = function () {
        return this.event.parameters.title || this.options.title;
    };

    View.prototype.dismiss = function () {
        /*
        Hides a popup view using the appropriate method of a plugin used
        */
        var self = this,
            dm = self.event.display_mode;
        if (dm === "popup") {
            console.log("dismissing dialog...");
            self.view.dialog("close");
        } else if (dm === "modal") {
            console.log("dismissing modal...");
            if (self.view.find('.rawModal').length) {
                self.view.find('.rawModal').require_one().modal("hide").remove();
            } else {
                self.view.parents('.modal').require_one().modal("hide").remove();
            }
        } else if (dm === "popover") {
            /*console.log("dismissing modal...");*/
            $('[data-instant_popover-open=1]').each(function () {
              if ($(this).data('instant_popover')) $(this).data('instant_popover').do_dismiss();
            });

        } else {
            console.log("Unknown display_mode: " + dm);
        }

        webapp.controller.currentView = self.event.parentView;
    };


    View.prototype.modified_url = function (args) {
        var url = this.event.location; /*,
            slack = '';
        $.each(args, function (key, value) {
            slack += '|' + key + ':' + value;
        });
        return url + slack;*/
        return url + '(json):' + encodeURIComponent(JSON.stringify(args));
    };

    View.prototype.go_back = function () {
        webapp.relocateTo(webapp.previousPageUrl());
    };


    View.prototype.collectRestParams = function () {
        /*
        * returns a list of 'key=value' strings aggreggated from
        * different parts of the view to be passed to the Rest backend
        * when querying for data. Subclasses may override this to add
        * more parameters
        */
        var self = this,
            params = [];

        /*if (self.options.data_format) {
            params.push("format=" + self.options.data_format);
        }*/

        $.each(self.event.uri_args, function (key, value) {
            params.push(key + "=" + value);
        });


        /* a view can define an function to provide additional rest parameters */
        if (self.options.rest_params_method) {
            $.each(self.options.rest_params_method.apply(self), function (key, value) {
                params.push(key + "=" + value);
            });
        }

        return params;
    };


    View.prototype.getRestBase = function (path_fragments) {
        /*
        * Replaces the placeholders and returns the url without data format
        * or URL parameters - /companies/123/contacts/
        */
        var self = this,
            root = webapp.rest_service_prefix + self.options.rest_service_root,
            // we don't want to modify self.event.parameters here,
            // so we're extending an empty object
            params = $.extend({}, self.event.parameters, path_fragments),
            url;

        /* Not every view needs to load data */
        if (!root) {
            return "";
        }

        url = webapp.fillInPlaceholders(root, params);
        return url;

    };

    View.prototype.getRestUrl = function (with_params, path_fragments, extra_params) {
        /*
        * Finds and replaces placeholders in the rest_service_root
        * options parameters with the actual values from the 'event.parameters' dict
        * so if we have a view registered at /companies/:company_id/staff/:staff_id, and its rest_service_root is
        * /companies/:company_id/:staff_id, the view will load its data from /companies/123/456
        *
        * The resulting URL includes format name and any resp parameters, so it looks like
        * /companies/123/contacts/@listing?sort_on=name&batch_start=50
        *
        * @param with_params - if 'with-params' is passed, append arguments collected by collectRestParams
        * @param path_fragments - allows to override variables from self.event.parameters for just one call
        * @param extra_params - allows to override variables from self.event.parameters for just one call
        */
        var self = this,
            url = self.getRestBase(path_fragments),
            params;

        /* Not every view needs to load data */
        if (!url) {
            return "";
        }

        //url = webapp.fillInPlaceholders(root, params);

        if (self.options.data_format) {
            ///Check if the url ends with a slash and add
            /// one if it doesn't
            if (url.indexOf('/', url.length - 1) === -1) {
                url += '/';
            }
            url += "@" + self.options.data_format;
        }


        if (with_params === "with-params") {
            params = self.collectRestParams();
        } else {
            params = [];
        }

        if (extra_params) {
            $.each(extra_params, function (key, value) {
                params.push(key + "=" + value);
            });
        }

        params = params.join("&");
        if (params) {
            url = url + "?" + params;
        }

        return url;
    };

    webapp.View = View;

}(jQuery, webapp));



/*
 * RedirectView - redirects to another url when invoked
 */

(function ($, webapp) {
    "use strict";

    function RedirectView(target_url) {
        this.options = {}; /* to make it consistent with other views */
        this.target_url = target_url;
        return this;
    }

    RedirectView.prototype.show = function () {
        webapp.relocateTo(this.target_url);
    };

    webapp.RedirectView = RedirectView;

}(jQuery, webapp));

