(function ($, webapp) {
    "use strict";

    function View(options) {
        this.options = $.extend({}, options);
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

            $node = $('<div id="' + nodeId + '" class="contentView">');

            $("#content-views").append($node);
            self.view = $("#" + nodeId);

            if (self.decorateView) {
                self.decorateView();
            }
        }
    };


    View.prototype.showView = function () {
        webapp.controller.setActiveView(this);
    };

    View.prototype.showViewFirstTime = function () {
        this.init();
        this.showView();
    };


    View.prototype.modified_url = function (args) {
        var url = this.event.location,
            slack = '';
        $.each(args, function (key, value) {
            slack += '|' + key + ':' + value;
        });
        return url + slack;
    };

    View.prototype.new_filter_url = function (attr, value) {
        /* returns the current url with one of the filters changed */
        // deep-copy
        var args = $.extend({}, this.event.uri_args);
        args[attr] = value;
        return this.modified_url(args);
    };

    View.prototype.new_sort_url = function (value) {
        /* returns the current url with sort_on and sort_order values changed */
        var args = $.extend({}, this.event.uri_args); // deep copy
        if (args.sort_on === value) {
            if (args.sort_order === 'desc') {
                args.sort_order = 'asc';
            } else {
                args.sort_order = 'desc';
            }
        }
        args.sort_on = value;
        return this.modified_url(args);
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

        // not used/supported anymore
        /*if (self.options.ann) {
            params.push("ann=1");
        }*/

        $.each(self.event.uri_args, function (key, value) {
            params.push(key + "=" + value);
        });
        return params;
    };

    View.prototype.getRestServiceUrl = function (with_params, path_fragments, extra_params) {
        /*
        * Finds and replaces placeholders in the rest_service_root
        * options parameters with the actual values from the 'event.parameters' dict
        * so if we have a view registered at /companies/:company_id/staff/:person_id, and its rest_service_root is
        * /rest/companies/:company_id/:person_id, the view will load its data from /rest/companies/123/456
        *
        * @param with_params - if 'with-params' is passed, append arguments collected by collectRestParams
        * @param path_fragments - allows to override variables from self.event.parameters for just one call
        * @param extra_params - allows to override variables from self.event.parameters for just one call
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

        if (self.options.data_format) {
            url += "/@" + self.options.data_format;
        }


        if (with_params === "with-params" ) {
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
        this.target_url = target_url;
        return this;
    }

    RedirectView.prototype.showView = function () {
        webapp.relocateTo(this.target_url);
    };

    webapp.RedirectView = RedirectView;

}(jQuery, webapp));

