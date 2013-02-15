(function ($, webapp) {
    "use strict";

    function Listing(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        var opts = $.extend({
            batch_size: 50,
            searchable: true,
            need_filters: false, //add a Filters partial
            scroll: 'pager' // can be 'pager', 'infinite', 'click for more'
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

    Listing.prototype._render_pager = function () {
        var self = this,
            total = self.data.total_count,
            batch_size = self.event.uri_args.batch_size || self.options.batch_size,
            pages = Math.ceil(total / batch_size),
            batch_start = self.event.uri_args.batch_start || 0,
            current = Math.floor(batch_start / batch_size),
            i = 0,
            output = [],
            bs;


        if (pages > 1) { // don't need a pager for just a single page
            output.push('<ul>');
            for (i = 0; i < pages; i += 1) {
                if (i === current) {
                    output.push('<li><span class="current">' + (i + 1) + '</span></li>');
                } else {
                    bs = i * batch_size;
                    output.push('<li><a href="#' + self.new_filter_url('batch_start', bs) + '">' + (i + 1) + '</a></li>');
                }
            }

            /// next link
            if (current < pages - 1) {
                bs = (current + 1) * batch_size;
                output.push('<li><a href="#' + self.new_filter_url('batch_start', bs) + '"> next </a></li>');
            } else {
                //output.push('<ul><span class="discreet">(last)</span></ul>');
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

        if (pages > 1) { // don't need a pager for just a single page

            /// next link
            if (current < pages - 1) {
                bs = (current + 1) * batch_size;
                output.push('<a class="loadMoreLink" href="#' + self.new_filter_url('batch_start', bs) + '"> more </a>');
            } else {
                output.push('<span class="discreet">all items shown</span>');
            }
        } else {
            output.push('<span class="discreet">all ' + total + ' items shown</span>');
        }

        output.push("</div>");

        return output.join('\n');
    };


    Listing.prototype.pager = function () {
        var self = this;

        if (self.options.scroll==='pager') {
            return self._render_pager();
        } else if (self.options.scroll==='click for more') {
            /*render_pager();*/
            return self._render_load_more_link();
            /*self.view.find("a.loadMoreLink").click(function () {
                alert("Hi!");
                return false;
            });*/

        } else if (self.options.scroll==='infinite') {
            /*render_pager();*/
        }

        /// <%=this.view.pager() %>
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

    };

    webapp.Listing = Listing;

}(jQuery, webapp));

