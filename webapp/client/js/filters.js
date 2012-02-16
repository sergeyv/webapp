(function ($, webapp) {
    "use strict";

    function Filters(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            identifier: "filters-partial",
            data_format: "NOT USED"
        }, options);

        webapp.Template.apply(this, [opts]);

    }

    Filters.prototype = new webapp.Template();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Filters.prototype.constructor = Filters;


    Filters.prototype.augmentView = function () {

        var self = this;

        self.view.find("select").chosen().change(function () {
            var $select = $(this),
                url = self.new_filter_url("filter-"+$select.data("filter-id"), $select.val());
            webapp.relocateTo(url);
        });
    };


    Filters.prototype.getRestUrl = function (with_params, path_fragments, extra_params) {
        /*
        * Finds and replaces placeholders in the rest_service_root
        * options parameters with the actual values from the 'event.parameters' dict
        * so if we have a view registered at /companies/:company_id/staff/:person_id, and its rest_service_root is
        * /rest/companies/:company_id/:person_id, the view will load its data from /rest/companies/123/456
        *
        * The resulting URL includes format name and any resp parameters, so it looks like
        * /rest/companies/123/contacts/@listing?sort_on=name&batch_start=50
        *
        * @param with_params - if 'with-params' is passed, append arguments collected by collectRestParams
        * @param path_fragments - allows to override variables from self.event.parameters for just one call
        * @param extra_params - allows to override variables from self.event.parameters for just one call
        */
        var self = this,
            params = $.extend({}, self.event.parameters, path_fragments),
            url = webapp.fillInPlaceholders(self.options.rest_service_root, params);


        /*if (with_params === "with-params" ) {
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
        }*/

        return url;
    };

    webapp.Filters = Filters;

}(jQuery, webapp));

