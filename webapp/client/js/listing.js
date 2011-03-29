(function ($, webapp) {

    function Listing(options) {

        // a nice side-effect of this is that it's doing a deep-copy
        this.options = $.extend({
            batch_size: 10,
            data_format: 'listing'
        }, options);

    }

    Listing.prototype = new webapp.Template();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Listing.prototype.constructor = Listing;


    Listing.prototype.init = function () {

    /// this is called when the view is first shown
        var self = this,
            node_id = self.options.identifier + '-view',
            $node;

        // this is how to call a 'super' method in JS
        webapp.Template.prototype.init.call(this);


        /// find or create the body template container
        node_id = self.options.identifier + '-row-template';
        self.row_template = $("#" + node_id);
        if (!self.row_template.length) {
            webapp.log("Can't find a node for #" + node_id + ", creating a new one");
            /// Create and append a node if not found
            $node = ($('<script type="text/x-jquote-template" id="' + node_id + '">'));

            $("body").append($node);
            self.row_template = $("#" + node_id);
        }

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
        var params = webapp.Template.prototype.collectRestParams.call(this);
        params.push('batch_size=' + this.options.batch_size);
        return params;
    };

    Listing.prototype.augmentView = function () {

        var self = this;

        function modified_url(args) {
            var url = self.event.location,
                slack = '';
            $.each(args, function (key, value) {
                slack += '|' + key + ':' + value;
            });
            return url + slack;
        }

        function new_filter_url(attr, value) {
            /* returns the current url with one of the filters changed */
            // deep-copy
            var args = $.extend({}, self.event.uri_args);
            args[attr] = value;
            return modified_url(args);
        }

        function new_sort_url(value) {
            /* returns the current url with sort_on and sort_order values changed */
            var args = $.extend({}, self.event.uri_args); // deep copy
            if (args.sort_on === value) {
                if (args.sort_order === 'desc') {
                    args.sort_order = 'asc';
                } else {
                    args.sort_order = 'desc';
                }
            }
            args.sort_on = value;
            return modified_url(args);
        }

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
                    return 'sortedAsc';
                } else {
                    return 'sortedDesc';
                }
            }
            return "";
        }


        function render_pager() {
            var total = self.data.total_count,
                batch_size = self.options.batch_size,
                pages = Math.floor(total / batch_size + 0.5),
                batch_start = self.event.uri_args.batch_start || 0,
                current = Math.floor(batch_start / batch_size),
                i = 0,
                output = [],
                bs,
                $pager = self.view.find("div.pager");

            if (pages > 1) { // no need a pager for just a single page
                for (i = 0; i < pages; i += 1) {
                    if (i === current) {
                        output.push('<span class="current">' + (i + 1) + '</span>');
                    } else {
                        bs = i * batch_size;
                        output.push('<a href="#' + new_filter_url('batch_start', bs) + '">' + (i + 1) + '</a>');
                    }
                }
            }
            $pager.html(output.join('\n'));
        }

        // this is how to call a 'super' method in JS
        webapp.Template.prototype.augmentView.call(this);

        self.view.find("th.sortable").each(function (ids, val) {
            var $cell = $(this),
                title = $cell.html(),
                id = get_column_id($cell);
            //alert(id);
            $cell.html('<a href="#' + new_sort_url(id) + '" class="' + get_sort_class(id) + '">' + title + '</a>');
        });

        render_pager();
    };

    webapp.Listing = Listing;

}(jQuery, webapp));

