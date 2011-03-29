(function ($, webapp) {

    function GenericView(options) {
        this.options = $.extend({}, options);
    }

    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    GenericView.prototype.constructor = GenericView;


    GenericView.prototype.init = function () {
        /// this is called _before_ the view is loaded
        /// (as the view is loaded on demand)
        /// so the html stuff is not available yet
        var self = this,
            nodeId = self.options.identifier + '-view',
            $node;

        self.view = $("#" + self.options.identifier + "-view");
        if (!self.view.length) {
            webapp.log("Can't find a node for #" + self.options.identifier + "-view, creating a new one");
            /// Create and append a node if not found

            $node = $('<div id="' + nodeId + '" class="contentView">');

            $("#content-views").append($node);
            self.view = $("#" + nodeId);

            if (self.decorateView) {
                self.decorateView();
            }
        }
    };


    GenericView.prototype.hideView = function () {
        this.view.removeClass("activeContentView");
    };

    GenericView.prototype.showView = function () {
        this.view.addClass("activeContentView");
    };

    GenericView.prototype.showViewFirstTime = function () {
        this.init();
    };


    GenericView.prototype.collectRestParams = function () {
        /*
        * returns a list of 'key=value' strings aggreggated from
        * different parts of the view to be passed to the Rest backend
        * when querying for data. Subclasses may override this to add
        * more parameters
        */
        var self = this,
            params = [];
        if (self.options.data_format) {
            params.push("format=" + self.options.data_format);
        }
        if (self.options.ann) {
            params.push("ann=1");
        }

        $.each(self.event.uri_args, function (key, value) {
            params.push(key + "=" + value);
        });
        return params;
    };

    GenericView.prototype.getRestServiceUrl = function (with_params, overrides) {
        /*
        * Finds and replaces placeholders in the rest_service_root
        * options parameters with the actual values from the 'event.parameters' dict
        * so if we have a view registered at /companies/:company_id/staff/:person_id, and its rest_service_root is
        * /rest/companies/:company_id/:person_id, the view will load its data from /rest/companies/123/456
        *
        * @param with_params - if 'with-params' is passed, append arguments collected by collectRestParams
        * @param overrides - allows to override variables from self.event.parameters for just one call
        */
        var self = this,
            root = self.options.rest_service_root,
            // we don't want to modify self.event.parameters here,
            // so we're extending an empty object
            params = $.extend({}, self.event.parameters, overrides),
            url;

        /* Not every view needs to load data */
        if (!root) {
            return "";
        }

        url = root.replace(
            new RegExp("(/):([^/]+)", "gi"),
            function ($0, $1, $2) {
                var repl = params[$2];
                if (repl !== undefined) { // if (repl) {...} would not work for false-y values, such as 0 or ''
                    return "/" + repl;
                }
                return "";
            }
        );


        if (with_params === "with-params") {
            params = self.collectRestParams();

            params = params.join("&");
            if (params) {
                url = url + "?" + params;
            }
        }

        return url;
    };

    webapp.GenericView = GenericView;

}(jQuery, webapp));



/*
 * RedirectView - redirects to another url when invoked
 */

(function ($, webapp) {

    function RedirectView(target_url) {
        this.target_url = target_url;
        return this;
    }

    RedirectView.prototype.hideView = function () {
        // Nothing to do
    };

    RedirectView.prototype.showView = function () {
        webapp.log("Redirecting to " + this.target_url);
        webapp.relocateTo(this.target_url);
    };

    webapp.RedirectView = RedirectView;

}(jQuery, webapp));

