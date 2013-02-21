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
            self.view.parents('.modal').require_one().modal("hide").remove();
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

    View.prototype.new_filter_url = function (attr, val, extra_args) {
        /* returns the current url with one of the filters changed */
        // deep-copy
        var args = $.extend({}, this.event.uri_args);
        args[attr] = val;

        // extra_args optional parameter to be add more args to the url
        // useful for overriding the cached filter options in the case of some portlets
        extra_args = (typeof extra_args === "undefined") ? "" : extra_args;
        if(extra_args) {
		    $.each(extra_args, function(key, value) {
		    	args[key] = value;
		    });
        }

        if (attr != 'batch_start') {
        	args.batch_start = 0;
    	}
        // we want to go to the first page if filtering changes

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
        args.batch_start = 0; // we want to go to the first page if sorting changes
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
        * or URL parameters - /rest/companies/123/contacts/
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
        * /rest/companies/:company_id/:staff_id, the view will load its data from /rest/companies/123/456
        *
        * The resulting URL includes format name and any resp parameters, so it looks like
        * /rest/companies/123/contacts/@listing?sort_on=name&batch_start=50
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
        this.target_url = target_url;
        return this;
    }

    RedirectView.prototype.show = function () {
        webapp.relocateTo(this.target_url);
    };

    webapp.RedirectView = RedirectView;

}(jQuery, webapp));

