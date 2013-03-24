(function ($, webapp) {
    "use strict";

    function InfiniteListing(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            batch_size: 50,
            preserve_uri_args: true // if a user visits a page for the second time,
                                    // we want to show the view in the same state the next time
        }, options);
        webapp.Template.apply(this, [opts]);
    }

    InfiniteListing.prototype = new webapp.Template();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    InfiniteListing.prototype.constructor = InfiniteListing;


    InfiniteListing.prototype.collectRestParams = function () {
        /*
        * Adds batch_start and batch_size to the params which are sent to the Rest backend
        */
        var params = webapp.Template.prototype.collectRestParams.call(this),
            batch_size = this.event.uri_args.batch_size || this.options.batch_size,
            batch_start = this.data && this.data.next_batch_start || 0;
        params.push('batch_size=' + batch_size);
        params.push('batch_start=' + batch_start);
        return params;
    };

    InfiniteListing.prototype.collectSelectedIds = function () {
        var checkboxes = this.view.find("input.multiEdit:checked"),
            vals = [];
        $.each(checkboxes, function(idx, cb) {
            vals.push($(cb).val());
        });
        return {ids: vals};
    };

    InfiniteListing.prototype.pager = function () {
        return '<div class="infiniteScrollMore"><span> </span> Loading...</div><div class="pagination"></div>';
    };

    InfiniteListing.prototype.reload = function () {
        var self = this;
        // if we don't delete it, the view will use next_batch_start from data
        delete self.data;
        webapp.Template.prototype.reload.call(this);
    };


    InfiniteListing.prototype.load_more = function (callback) {
        /*
        Loads the next portion of the listing and attaches it to the table,
        then invokes a callback function passing it the DOM fragment rendered from the data
        and the data for the current batch
        */
        var self = this,
            total = self.data.total_count,
            batch_size = self.event.uri_args.batch_size || self.options.batch_size,
            url,
            blob,
            fragment;


        // self.event.uri_args.batch_start = self.data.next_batch_start;
        url = self.getRestUrl('with-params');

        self.view.find('.infiniteScrollMore').show();

        webapp.get_cached_ajax(
            self.options.use_cache,
            self.options.invalidated_by,
            {
                type: "GET",
                url: url,
                cache: true
            }
        ).done(function (data) {
            blob = self.render_data_return_html(self.template, data);
            fragment = $(blob).find("table.listingTable tbody:last");
            self.view.find("table.listingTable").append(fragment);

            /* update data */
            self.data.items = self.data.items.concat(data.items);
            self.data.next_batch_start = data.next_batch_start;
            self.data.has_more = data.has_more;

            self.view.find('.infiniteScrollMore').hide();

            /* perform any JS initializations */
            if (self.options.before_view_shown) {
                self.options.before_view_shown.apply(self, [fragment]);
            }

            callback(fragment, data);
        });
    };

    InfiniteListing.prototype.augmentView = function () {
        var self = this;
        $(self.view).find('table.listingTable').infiniteScroll({
            threshold: 500, /* start loading more when less than 500px of the scroll left at the bottom */
            onEnd: function() {
                $(".pagination").html('<span class="discreet">All ' + self.data.total_count + ' items shown</span>');
            },
            onBottom: function(callback) {
                if (self.data.has_more) {
                    self.load_more(function (fragment, data) {
                        callback(data.has_more ? true : false); /* the plugin requires strictly true or false */
                        /* this triggers another scroll event which solves the problem
                        with the initial listing being too short for the scrollbar to appear
                        - in this case the plugin will continue to load portions of data until
                        we have enough to fill the whole screen  */
                        $(window).trigger('scroll');
                    });
                }
            }
        });
        $(window).trigger('scroll');
    };


    InfiniteListing.prototype.aboutToBeHidden = function () {
        /*
        Turn off the infinite scroll listener
        */
        var self = this;

        console.log("aboutToBeHidden");
        if (self.options.scroll === 'infinite') {
            $(window).off('scroll.infinite resize.infinite');
        }
    };

    webapp.InfiniteListing = InfiniteListing;

}(jQuery, webapp));
