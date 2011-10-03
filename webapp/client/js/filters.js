(function ($, webapp) {
    "use strict";

    function Filters(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            identifier: "filters-partial",
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

    webapp.Filters = Filters;

}(jQuery, webapp));

