(function ($, webapp) {
    "use strict";

    /*
     * Currently, a partial view shares event object with the view it is embedded into
     * which produces strange results when we insert a listing into a page which
     * is a listing itself (i.e. - display a dropdown menu on a page
     * which contains a listing - sorting the listing by name will make the dropdown to
     * send ?order_by=name, which may succeed or may fail if sorting by name is not possible
     * for that resource
     *
     * Partial class has a simplified getRestUrl method which doesn't use
     * parameters from the event object.
     *
     * Ultimately this need to be fixed by not sharing the event object between
     * views - can we use some kind of "multi-hash-slack" which would combine
     * the states of the main view and all the partials and popups? That may result
     * in huge URLs...
     *
     * Something like
     *
     * #/clients|sort_by:name|batch_start:50[projects_partial|sort_by:num_tasks]>/clients/add
     *
     * (in the above example, we have a listing of Clients sorted by name with a portlet which shows
     * Projects sorted by num_tasks, and a popup form displayed over it)
     *
     * (NOTE, however, that we're switching to using JSON to store parameters on the hash slack,
     * so the url should use JSON dicts)
     *
     * Alternatively, if we make the views to store their state between displays
     * (i.e. if a listing has been sorted by name, it stays sorted when we re-visit it),
     * we may live with the fact that the application is not fully stateless and URI-driven
     * but still have an option to have the partials sorted individually and separately
     * from the main listing
     *
     * TODO.
     */

    function Partial(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            identifier: "filters-partial",
            data_format: ""
        }, options);

        webapp.Template.apply(this, [opts]);

    }

    Partial.prototype = new webapp.Template();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Partial.prototype.constructor = Partial;



    Partial.prototype.getRestUrl = function (with_params, path_fragments, extra_params) {
        var self = this,
            url = self.getRestBase(path_fragments),
            params = [];

        // Not every view needs to load data
        if (!url) {
            return "";
        }

        if (self.options.data_format) {
            ///Check if the url ends with a slash and add
            /// one if it doesn't
            if (url.indexOf('/', url.length - 1) === -1) {
                url += '/';
            }
            url += "@" + self.options.data_format;
        }

        /* a view can define a function to provide additional rest parameters */
        /* TODOXXX: this has been copied from View.collectRestParams */
        if (self.options.rest_params_method) {
            $.each(self.options.rest_params_method.apply(self), function (key, value) {
                params.push(key + "=" + value);
            });
        }
        params = params.join("&");
        if (params) {
            url = url + "?" + params;
        }
        /* === */


        return url;
    };

    webapp.Partial = Partial;

}(jQuery, webapp));

