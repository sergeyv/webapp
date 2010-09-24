
// Add view to the application.

window.application.addView("ProvidersListing", (function( $, application ){

	function ProvidersListing(){
		this.view = null;
		this.listing = null;
		this.staffTemplate = null;
	};


	ProvidersListing.prototype.init = function(){
		var self = this;
		this.view = $( "#providers-listing-view" );

	};


    ProvidersListing.prototype.showViewFirstTime = function( parameters ) {

        var self = this;
        self.listing = $("#providers-listing-container > tbody");

        /*self.populateFilters( function() {
        });*/

        self.showView( parameters );


        /*

        $("#projects-listing-container div.moreContactsLink a")
            .live('click', function() {
                var $link = $(this);
                $link.parent().parent().children("ul").children("li").show("slow");
                $link.parent().remove();
        });
        */
    };

    ProvidersListing.prototype.populateFilters = function(continue_fn) {

        var self = this;
        var service_url = "/rest/providers/filters";

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

        $("#projects-client-filter").autocomplete({
                source: "/rest/clients/incremental",
                select: function(event, ui) {
                    self.selectClientByName(ui.item.label);
                    return true;
                }

        });
    }

    ProvidersListing.prototype.selectClientByName = function(name) {

        var self = this;
        var service_url = "/rest/clients/incremental?get_id_for="+name;
        $.Read(service_url, function(data) {
                self.filters.client = data.id;
                window.application.relocateTo("#/filter/"+self.calculateFilterString());
        });
    }

    ProvidersListing.prototype.calculateFilterString = function() {
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

    ProvidersListing.prototype.showView = function( parameters ){

        var self = this;

        // Show the view.
        this.view.addClass( "activeContentView" );

        var sort_params = parameters.sort.split(":");

        this.sort_on = sort_params[0];
        this.sort_order = sort_params[1];

        this.filters = {};

        var filter_params = parameters.filter.split("|");
        $.each(filter_params, function(idx, f) {
            var pair = f.split(":");
            self.filters[pair[0]] = pair[1];
        });
        self.filter_string = self.calculateFilterString();


        this.adjustSortLinks();
        this.adjustFilters();
        this.populateList();

    };

	// ----------------------------------------------------------------------- //
	// ----------------------------------------------------------------------- //

    ProvidersListing.prototype.adjustSortLinks = function() {
        var self = this;
        var links = $(".sortLink");
        links.removeClass("sortedAsc").removeClass("sortedDesc");

        $.each(links, function(idx, l) {
            //alert(l);
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

    ProvidersListing.prototype.adjustFilters = function() {

        var self = this;
        /*$.each(self.filters, function(name, value) {
            var $f = $("#projects-"+name+"-filter");
            $f.val(value);
        });*/
        $("#project-status-filter").find("a").removeClass("current");
        var status_id = self.filters.status;
        $("#project-status-filter").find("a.option"+status_id).addClass("current");

        /*var statuses = self.filter_vocabularies['project-status-filter'];

        $.each(statuses, function(idx, status) {
            if (status.id == status_id) {
                $("#project-listing-stats").find("span.projectStatus").html(status.name);
            }
        });*/

    };

	// I clear the contact list.
	ProvidersListing.prototype.clearList = function(){
        this.listing.children().remove();
	};


	// I get called when the view needs to be hidden.
	ProvidersListing.prototype.hideView = function(){
		this.view.removeClass( "activeContentView" );
	};


	ProvidersListing.prototype.populateList = function(next_batch_start){
		var self = this;

        var sort_on = this.sort_on;
        var sort_order = this.sort_order;

        //var status = self.statusFilter.val();
        //var user_type = self.userTypeFilter.val();
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

        $.each(self.filters, function(name,value) {
            if (name) {
                qry += '&'+name+'='+value;
            }
        })


        var service_url = "/rest/projects/";

        if (qry) service_url = service_url+ "?"+qry;


        $.Read(service_url, function(data) {

            // Show the total number of records found
            $("#project-listing-stats").find("span.projectCount").html(data.total_count);

            if (need_clearing) {
                self.clearList();
            } else {
                $("#more-link").replaceWith($('<hr />'));
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

            var template = $('#project-listing-template');
            if (!template.length) { alert("Template not found!"); }
            var output = template.jqote(data.items);
            self.listing.append(output);

            if (data.has_more) {
                var more_link = '<tr><td colspan="99"><a id="more-link" class="moreLink" href="#">Show More</a></td></tr>';
                var next_batch_start = data.next_batch_start;

                self.listing.append($(more_link));
                $("#more-link").click(function() {
                    self.populateList(next_batch_start);
                    return false;
                });
            }

        });

	};


	// ----------------------------------------------------------------------- //

	// Return a new view class singleton instance.
	return( new ProvidersListing() );

})( jQuery, window.application ));
