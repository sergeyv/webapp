
// Add view to the application.

    function TemplatedView(options){

        /* options are:
        -identifier
        - rest_service_root
        - data_format
        - ann
        - after_data_loaded (function)
        */
        this.options = $.extend({
        }, options);

    };

    TemplatedView.prototype = new GenericView();

    TemplatedView.prototype.init = function(){
        /// this is called when the view is first shown
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

        var self = this;

        self.init();
        
        var load_from = "/t/"+self.options.identifier+".html";

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
        var params = [];
        if (self.options.data_format) {
            params.push("format="+self.options.data_format);
        }
        if (self.options.ann) {
            params.push("ann=1");
        }

        params = params.join("&");
        if (params) {
            service_url = service_url + "?" + params;
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

    /*
     * TemplatedView allows links to have some special classes
     * which modify their behaviour:
     *
     * - webappAsyncAction - clicking on the link pings the target URL
     *   without the page being reloaded. The server response is discarded
     *
     * - webappInvokeOnLoad - the URL will be pinged when the view is shown
     *
     * - webappConfirmDialog - shows a confirmation dialog, only pings the URL
     *   if the user chooses OK. The link's title tag is used for
     *   the dialog's message text
     *
     * - webappMethodDelete - uses DELETE instead of POST (otherwise it's GET)
     *   We can add more methods when needed though it's not yet
     *   clear how to send any data in a POST or PUT request.
     *
     * - webappGoBack - after the async action has been invoked,
     *   redirect to the previous page
     *
     * - webappOnSuccess-<method_name> - invoke a specified method
     *   of the view object after the call succeeds,
     *   i.e. webappOnSuccess-populateView will reload
     *   the data from the server and re-render the template with that data.
     *
     */
    TemplatedView.prototype.augmentView = function() {

        var self = this;
        //var service_url = self.getRestServiceUrl();

        var invoke_async_action = function($link) {
            var meth = $.Read;
            var callback = function() {

                /// find all classes which start with webappOnSuccess
                /// if found, it expects it to be in a form webappOnSuccess-methodName.
                /// If the view has such method, it is invoked when the call succeeds
                $($link.attr('class').split(' ')).each(function(idx, val) {
                    var parts = val.split('-');
                    if (parts.length===2 &&
                        parts[0]==="webappOnSuccess" &&
                        self[parts[1]])
                    {
                        self[parts[1]]();
                    }
                });
            };

            if ($link.hasClass("webappMethodDelete")) {
                meth = $.Delete;
            }


/*            var href = $link.attr('href');
            if href[0] != '/':
                href = service_url + '/' + href;*/
            meth($link.attr('href'), callback);

            if ($link.hasClass("webappGoBack")) {
                window.application.relocateTo(window.application.previousPageUrl());
            }
            return false;
        }
        /// Every link marked with webappAsyncAction class will
        /// invoke an async task (well, it can be used to ping
        /// any URL, but the result is discarded, so it's only
        /// useful for async tasks
        self.view.find("a.webappAsyncAction").click(function() {
            var $link = $(this);
            /// if the link also has 'webappConfirmDialog' class,
            /// we show a confirmation dialog and only invoke
            // the action if the user clicks OK
            if ($link.hasClass("webappConfirmDialog")) {
                $('<div></div>').text($link.attr('title')).dialog({
                    modal: true,
                    title: "Confirm",
                    buttons: {
                        Cancel: function() {
                            $(this).dialog('close');
                        },
                        OK: function() {
                            invoke_async_action($link);
                            $(this).dialog('close');
                        }
                    }

                });

            } else {
                /// if there's no webappConfirmDialog class then
                /// we invoke the method directly
                invoke_async_action($link);
            }
            return false;
        });
        /// Every link marked with webappInvokeOnLoad class will
        /// be 'clicked' programmatically when the view is loaded
        /// (in the same manner webappAsyncAction links are invoked when clicked). You can hide the link using css if it should not be displayed in the UI
        self.view.find("a.webappInvokeOnLoad").each(function(idx, elem) {
            var $link = $(elem);
            invoke_async_action($link);
            return undefined; // if we return false the iteration stops
        });
    };

