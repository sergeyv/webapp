(function ($, webapp) {
    "use strict";

    function Listing(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            batch_size: 50,
            searchable: true,
            need_filters: false, //add a Filters partial
            scroll: 'pager' // can be 'pager', next-prev', 'infinite', 'click-for-more'
        }, options);
        webapp.Template.apply(this, [opts]);

        if (!this.options.partials) {
            this.options.partials = {};
        }
    }

    Listing.prototype = new webapp.Template();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Listing.prototype.constructor = Listing;


    Listing.prototype.init = function () {

        /// this is called when the view is first shown
        var self = this,
            node_id = self.options.identifier + '-view',
            $node;

        ///
        if (this.options.need_filters) {
            this.options.partials.filters = new webapp.Filters({
                rest_service_root: self.getRestUrl()  + "/filters"
            });
        }

        // this is how to call a 'super' method in JS
        webapp.Template.prototype.init.call(this);

    };


    Listing.prototype.renderTableBody = function () {
        var self = this,
            output = self.row_template.jqote({data: self.data, view: self});
        return output;
    };


    Listing.prototype.collectRestParams = function () {
        /*
        * Adds batch_size to the params which are sent to the Rest backend
        */
        // this is how to call a 'super' method in JS
        var params = webapp.Template.prototype.collectRestParams.call(this),
            bs = this.event.uri_args.batch_size || this.options.batch_size;
        params.push('batch_size=' + bs);
        return params;
    };

    Listing.prototype.collectSelectedIds = function () {
        var checkboxes = this.view.find("input.multiEdit:checked"),
            vals = [];
        $.each(checkboxes, function(idx, cb) {
            vals.push($(cb).val());
        });
        return {ids: vals};
    };

    Listing.prototype._render_pager = function (need_pages) {
        var self = this,
            total = self.data.total_count,
            batch_size = self.event.uri_args.batch_size || self.options.batch_size,
            pages = Math.ceil(total / batch_size),
            batch_start = self.event.uri_args.batch_start || 0,
            current = Math.floor(batch_start / batch_size),
            i = 0,
            output = [],
            bs;

        output.push('<div class="pagination">');

        if (pages > 1) { // don't need a pager for just a single page
            output.push('<ul>');

            /// prev link
            if (current > 0) {
                bs = (current - 1) * batch_size;
                output.push('<li><a href="#' + self.new_filter_url('batch_start', bs) + '"> &laquo; </a></li>');
            } else {
                output.push('<li><span class="current"> &laquo; </span></li>');
            }

            if (need_pages) {
                for (i = 0; i < pages; i += 1) {
                    if (i === current) {
                        output.push('<li><span class="current">' + (i + 1) + '</span></li>');
                    } else {
                        bs = i * batch_size;
                        output.push('<li><a href="#' + self.new_filter_url('batch_start', bs) + '">' + (i + 1) + '</a></li>');
                    }
                }
            }

            /// next link
            if (current < pages - 1) {
                bs = (current + 1) * batch_size;
                output.push('<li><a href="#' + self.new_filter_url('batch_start', bs) + '"> &raquo; </a></li>');
            } else {
                output.push('<li><span class="current"> &raquo; </span></li>');
            }
            output.push('</ul>');
        } else {
            output.push('<span class="discreet">all ' + total + ' items shown</span>');
        }

        /// the current batch size
        output.push('<div class="batchSize">' + batch_size + ' per page');

        /// more link
        if (pages > 1 && batch_size < 200) {
            bs = Math.min(Math.floor(batch_size * 2), 200);
            output.push('<a href="#' + self.new_filter_url('batch_size', bs) + '" title="' + bs + ' per page">more</a>');
        }

        /// less link is shown even if there's just one page
        if (batch_size > 10) {
            bs = Math.max(Math.floor(batch_size / 2), 10);
            output.push('<a href="#' + self.new_filter_url('batch_size', bs) + '" title="' + bs + ' per page">less</a>');
        }

        output.push("</div>");
        output.push("</div>");


        return output.join('\n');
    };

    Listing.prototype._render_load_more_link = function () {
        var self = this,
            total = self.data.total_count,
            batch_size = self.event.uri_args.batch_size || self.options.batch_size,
            pages = Math.ceil(total / batch_size),
            batch_start = self.event.uri_args.batch_start || 0,
            current = Math.floor(batch_start / batch_size),
            i = 0,
            output = [],
            bs;

        output.push('<div class="pagination"><ul>');

        if (pages > 1) { // don't need a pager for just a single page
            /// next link
            if (current < pages - 1) {
                bs = (current + 1) * batch_size;
                output.push('<li><a class="loadMoreLink" href="#' + self.new_filter_url('batch_start', bs) + '"> show more </a></li>');
            } else {
                output.push('<li><span class="discreet">all items shown</span></li>');
            }
        } else {
            output.push('<li><span class="discreet">all ' + total + ' items shown</span></li>');
        }

        output.push("</ul></div>");

        return output.join('\n');
    };


    Listing.prototype.pager = function () {
        var self = this;

        switch (self.options.scroll) {
            case 'pager': return self._render_pager(true);
            case 'next-prev': return self._render_pager(false);
            case 'click-for-more': return self._render_load_more_link();
            case 'infinite': return '<div class="infiniteScrollMore"><span> </span> Loading...</div><div class="pagination"></div>';
        }

    };

    Listing.prototype.load_more = function (callback) {
        /*
        Loads the next portion of the listing and attaches it to the table,
        then invokes a callback function passing it the DOM fragment rendered from the data
        and the data for the current batch
        */
        var self = this,
            total = self.data.total_count,
            batch_size = self.event.uri_args.batch_size || self.options.batch_size,
            // num_loaded = self.event.num_loaded || self.data.this_batch_count || self.data.items.length,
            url = self.getRestUrl('with-params', undefined, {batch_start: self.data.next_batch_start}),
            blob,
            fragment;

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


    Listing.prototype.augmentView = function () {

        var self = this;

        function get_column_id(elem) {
            var result = null;
            $(elem.attr('class').split(' ')).each(function (idx, val) {
                var parts = val.split('-');
                if (parts[0] === "id") {
                    result = parts[1];
                    return false;
                }
            });
            return result;
        }

        function get_sort_class(id) {
            var args = self.event.uri_args;
            if (args.sort_on === id) {
                if (args.sort_order === 'desc') {
                    return 'sortedDesc';
                } else {
                    return 'sortedAsc';
                }
            }
            return "";
        }


        // this is how to call a 'super' method in JS
        webapp.Template.prototype.augmentView.call(this);

        self.view.find("th.sortable").each(function (ids, val) {
            var $cell = $(this),
                title = $cell.html(),
                id = get_column_id($cell);
            $cell.html('<a href="#' + self.new_sort_url(id) + '" class="' + get_sort_class(id) + '">' + title + '</a>');
        });


        if (self.options.scroll === 'click-for-more') {
            $(self.view)
                .off("click", "a.loadMoreLink")
                .on("click", "a.loadMoreLink", function () {

                /*var $link = $(this);*/
                self.load_more(function (fragment, data) {
                    fragment.effect("highlight", {}, 1500);
                    if (!data.has_more) {
                        $(".pagination").html('<span class="discreet">All ' + self.data.total_count + ' items shown</span>');
                    }
                });
                return false;
            });
        } else if (self.options.scroll === 'infinite') {
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
        }
    };

    webapp.Listing = Listing;

}(jQuery, webapp));
