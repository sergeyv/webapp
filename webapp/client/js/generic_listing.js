
// Add view to the application.

    function GenericListing(options){

        /* options are:
        - rest_service_root
        */
        this.options = $.extend({
        }, options);

    };

    GenericListing.prototype = new GenericView();


    GenericListing.prototype.showViewFirstTime = function( parameters ) {

        self = this;
        var load_from = "/t/"+self.options.identifier+".html";

        self.view.load(load_from, function() {

            self.listing = self.view.find("table.listingTable > tbody");

            if (self.options.after_template_loaded) {
                self.options.after_template_loaded(self);
            }

            self.populateFilters( function() {
                self.showView( parameters );
            });

        });

    };

    GenericListing.prototype.populateFilters = function(continue_fn) {

        var self = this;
        var service_url = this.options.rest_service_root + "/filters";

        $.Read(service_url, function(data) {

            self.filter_vocabularies = data;

            $.each(data, function(name, values) {
                var select = $("#"+name);
                var s = '';
                $.each(values, function(idx, option) {
                    s += '<li><a class="option'+option.id+'" href="#/filter/status:'+option.id+'">'+option.name+'</a></li>';
                });

                select.html(s);
                continue_fn();

            });
        });

        self.view.find(".incrementalSearch").autocomplete({
                source: this.options.rest_service_root + "/incremental",
                select: function(event, ui) {
                    self.selectItemByName(ui.item.label);
                    return true;
                }

        });
    }

    GenericListing.prototype.selectItemByName = function(name) {

        var self = this;
        var service_url = this.options.rest_service_root + "/incremental?get_id_for=" + name;
        $.Read(service_url, function(data) {
                self.filters.id = data.id;
                window.application.relocateTo("#/filter/"+self.calculateFilterString());
        });
    }

    GenericListing.prototype.calculateFilterString = function() {
        var self = this;
        var filter_parts = [];

        if (self.filters) {
            $.each(self.filters, function(name,value) {
                if (name && value) { /// skip empty values
                    filter_parts.push(name+":"+value);
                }
            });
        }
        return filter_parts.join("|");
    }

    GenericListing.prototype.showView = function( parameters ){

        var self = this;

        // Show the view.
        this.view.addClass( "activeContentView" );

        if (parameters&&parameters.sort) {
            var sort_params = parameters.sort.split(":");

            this.sort_on = sort_params[0];
            this.sort_order = sort_params[1];
        } else {
            this.sort_on="";
            this.sort_order="";
        }

        this.filters = {};

        if (parameters&&parameters.filter) {
            var filter_params = parameters.filter.split("|");
            $.each(filter_params, function(idx, f) {
                var pair = f.split(":");
                self.filters[pair[0]] = pair[1];
            });
        }
        self.filter_string = self.calculateFilterString();


        this.adjustSortLinks();
        this.adjustFilters();
        this.populateList();

    };

    // ----------------------------------------------------------------------- //
    // ----------------------------------------------------------------------- //

    GenericListing.prototype.adjustSortLinks = function() {
        var self = this;
        var links = $(".sortLink");
        links.removeClass("sortedAsc").removeClass("sortedDesc");

        $.each(links, function(idx, l) {
            var link = $(l);
            var url = link.attr("href");
            var url_parts = url.split("/");
            var sort_parts = url_parts[2].split(":");
            var cur_sort_on = sort_parts[0];
            var cur_sort_order = sort_parts[1];
            var url = "";
            if (self.sort_on == cur_sort_on) {
                if (self.sort_order == 'asc') {
                    var order = 'desc';
                    var linkClass='sortedAsc';
                } else {
                    var order = 'asc';
                    var linkClass='sortedDesc';
                }
            } else {
                var order = cur_sort_order;
            }

            url = "#/sort/"+cur_sort_on+":"+order;

            if (self.filter_string) {
                url += "/filter/"+self.filter_string;
            }
            link.attr("href", url);
            link.addClass(linkClass);
        });
    };

    GenericListing.prototype.adjustFilters = function() {
        var self = this;
    };

    // I clear the contact list.
    GenericListing.prototype.clearList = function(){
        this.listing.children().remove();
    };


    // I get called when the view needs to be hidden.
    GenericListing.prototype.hideView = function(){
        this.view.removeClass( "activeContentView" );
    };


    GenericListing.prototype.populateList = function(next_batch_start){
        var self = this;

        var sort_on = this.sort_on;
        var sort_order = this.sort_order;

        var qry = "";
        var need_clearing = true;

        if (next_batch_start)
        {
            qry += "from="+next_batch_start;
            need_clearing = false;
        }

        if (sort_on)
        {
            qry += "&sort_on="+sort_on;
            qry += "&sort_order="+sort_order;
        }

        if (this.options.data_format) {
            qry += "&format="+this.options.data_format;
        }

        $.each(self.filters, function(name,value) {
            if (name) {
                qry += '&'+name+'='+value;
            }
        })


        var service_url = this.options.rest_service_root
        if (qry) service_url = service_url+"?"+qry;

        $.Read(service_url, function(data) {

            // Show the total number of records found
            //self.view.find("span.itemsCount").html(data.total_count);

            if (need_clearing) {
                self.clearList();
            } else {
                self.view.find(".moreLink").replaceWith($('<hr />'));
            }

            /// Convert categories which are passed as numerical IDs
            /// to proper names using the filter vocabulary we loaded
            /// when the view was created.
            /// TODO: We may need a more generic approach to this
            /*var cats = new Object();
            var cats_src = self.filter_vocabularies['project-category-filter'];
            for (var i = 0; i<cats_src.length; i++)
            {
                cats[cats_src[i].id] = cats_src[i].name;
            }*/

            /*$.each(data.items, function(idx, item) {
                item.category = cats[item.category];
            });*/
            /// End modifying categories

            var template = self.view.find("script.rowTemplate");
            if (!template.length) { alert("Template not found!"); }
            var output = template.jqote(data.items);

            self.listing.append(output);
            if (data.has_more) {
                var more_link = '<tr><td colspan="99"><a class="moreLink" href="#">Show More</a></td></tr>';
                var next_batch_start = data.next_batch_start;

                $(more_link).appendTo(self.listing).click(function() {
                    self.populateList(next_batch_start);
                    return false;
                });
            }

        });

    };
