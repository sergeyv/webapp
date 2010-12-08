
// Add view to the application.

    function TemplatedView(options){

        /* options are:
        -identifier
        - rest_service_root
        - data_format
        - after_data_loaded (function)
        */
        this.options = $.extend({
        }, options);

    };

    TemplatedView.prototype = new GenericView();

    TemplatedView.prototype.init = function(){
        /// this is called _before_ the view is loaded
        /// (as the view is loaded on demand)
        /// so the html stuff is not available yet
        var self = this;

        /// find or create the view container
        var node_id = self.options.identifier+'-view';
        self.view = $( "#"+node_id );
        if (!self.view.length)
        {
            window.application.log("Can't find a node for #"+node_id+", creating a new one");
            /// Create and append a node if not found
            var $node = ($('<div id="'+node_id+'" class="contentView">'));

            $("#content-views").append($node);
            self.view = $( "#"+node_id );
        }

        /// find or create the template container
        var node_id = self.options.identifier+'-template';
        self.template = $( "#"+node_id );
        if (!self.template.length)
        {
            window.application.log("Can't find a node for #"+node_id+", creating a new one");
            /// Create and append a node if not found
            var $node = ($('<script type="text/x-jquote-template"   id="'+node_id+'">'));

            $("body").append($node);
            self.template = $( "#"+node_id );
        }

    };

    TemplatedView.prototype.showViewFirstTime = function( parameters ) {

        self = this;
        var load_from = "/templates/"+self.options.identifier;

        self.template.load(load_from, function() {
            self.showView( parameters );
        });
    };

    TemplatedView.prototype.showView = function( parameters ){

        var self = this;

        this.parameters = parameters;
        // Show the view.
        this.view.addClass( "activeContentView" );
        this.populateView();
    };

    TemplatedView.prototype.populateView = function(){
        var self = this;
        var service_url = self.getRestServiceUrl();
        if (self.options.data_format) {
            service_url += "?format="+self.options.data_format;
        }
        $.Read(service_url, function(data) {
            var template = self.template;
            if (!self.template.length) { alert("Template not found!"); }
            var output = self.template.jqote({data:data, view:self});
            self.view.html(output);

            self.augmentView();

            if (self.options.after_data_loaded) {
                self.options.after_data_loaded(self);
            }
        });

    };

    TemplatedView.prototype.augmentView = function() {
        var self = this;
        var service_url = self.getRestServiceUrl();

        /// Every link marked with webappAsyncAction class will
        /// invoke an async task (well, it can be used to ping
        /// any URL, but the result is discarded, so it's only
        /// useful for async tasks
        self.view.find("a.webappAsyncAction").click(function() {
            var $link = $(this);
            $.Read(service_url + '/' + $link.attr('href'));
            return false;
        });
        /// Every link marked with webappInvokeOnLoad class will
        /// be 'clicked' programmatically when the view is loaded
        /// (in the same manner webappAsyncAction links are invoked when clicked). You can hide the link using css if it's not needed in the UI
        self.view.find("a.webappInvokeOnLoad").each(function(idx, elem) {
            var $link = $(elem);
            $.Read(service_url + '/' + $link.attr('href'));
            return false;
        });
    };

