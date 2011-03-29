
// Create a closed memory space for the webapp definition and instantiation.
// This way, we keep the global name space clean.
(function ($) {

	// I am the class that controls the Javascript framework.
	function WebApp() {

        // I am the collection of route mappings that map URL patterns to event
        // handlers within the cached controllers.
        this.routeMappings = [];

        // I am the collection of controllers. All controllers are intended to be
        // singleton instances.
        this.controller = null;

        // I am the collection of models. I can contain either cached singleton
        // instances or class definitions (to be instantiated at request).
        this.models = {
            cache: {},
            classes: {}
        };

        // I am the collection of views. I can contain either cached singleton
        // instances of class definitions (to be instantiated at request).
        this.views = {
            cache: {},
            classes: {}
        };

		// an application can register some helper methods here to be used in
		// templates, <%=webapp.helpers.format_date(this.date) %>, for example
		this.helpers = {};

        /// validation rules to be used with forms
        this.validation_rules = {
        };

        this.pageNotFoundView = undefined;

		this.isRunning = false;

        this.visitedUrlsLog = [];

        this.showMessage = function (msg, title) {
            /*
            Displays a message - a nicer replacement for
            alert function
            */
            $('<div></div>').html(msg).dialog({
                modal: true,
                title: title,
                width: 400,
                buttons: {
                    Ok: function () {
                        $(this).dialog('close');
                    }
                }
            });
        };

        /* The code above is executed before the DOM is loaded so we need to
           postpone registering the error handlers until later
        */
        $(function () {
            /// Ajax spinner
            $("body").append($('<div id="ajax-spinner">&nbsp;</div>'));
            $('#ajax-spinner').ajaxStart(function () {
                $(this).show();
            });
            $('#ajax-spinner').ajaxStop(function () {
                $(this).hide();
            });
            $('#ajax-spinner').ajaxError(function () {
                $(this).hide();
            });
            /// Error message box
            $("#ajax-error").ajaxError(function (event, xhr, ajaxOptions, thrownError) {
                var self = this;
                $(self).html(xhr.responseText).dialog({
                    modal: true,
                    title: "Server Error",
                    width: "80%",
                    height: 600,
                    buttons: {
                        Ok: function () {
                            $(this).dialog('close');
                        }
                    }
                });
            });

        });

        /// TODO: Not sure it belongs here
        $.fn.serializeObject = function () {
            /// This creates a custom function which
            /// serializes a form into an object which
            /// can easily be converted to JSON representation
            /// TODO: not sure how robust this is with multiple values
            /// See http://stackoverflow.com/questions/1184624/serialize-form-to-json-with-jquery
            var o = {},
                a = this.serializeArray();
            $.each(a, function () {
                if (o[this.name]) {
                    if (!o[this.name].push) {
                        o[this.name] = [o[this.name]];
                    }
                    o[this.name].push(this.value || '');
                } else {
                    o[this.name] = this.value || '';
                }
            });
            return o;
        };
	}


	WebApp.prototype.getController = function () {
		// Add the controller.
		if (!this.controller) {
            this.controller = new webapp.Controller();
        }

        return this.controller;
	};

    WebApp.prototype.addValidationRules = function (name, rule) {
        this.validation_rules[name] = rule;
    };

    WebApp.prototype.getValidationRules = function (name) {
        return this.validation_rules[name];
    };


	// I add the given view class or instance to the view class library. Any classes
	// that are passed in AS instances will be cached and act as singletons.
	WebApp.prototype.addView = function (name, view) {
        this.views[name] = view;
	};

    WebApp.prototype.registerMenu = function (menu_id, tabs) {

    };

	// I return an instance of the class with the given name.
	WebApp.prototype.getView = function (name, initArguments) {
        this.log("Asked for " + name + ", found " + name);
        return this.views[name];
	};


	// I initialize the given class instance.
	WebApp.prototype.initClass = function (instance) {
		// Check to see if the target instance has an init method.
		if (instance.init) {
			// Invoke the init method.
			instance.init();
		}
	};


	// I intialize the given collection of class singletons.
	WebApp.prototype.initClasses = function (classes) {
		var self = this;

		// Loop over the given class collection - our singletons - and init them.
		$.each(
			classes,
			function (index, instance) {
				self.initClass(instance);
			}
		);
	};



	// I intialize the model. Once the webapp starts running and the
	// DOM can be interacted with, I need to give the model a chance to
	// get ready.
	WebApp.prototype.initModels = function () {
		this.initClasses(this.models.cache);
	};


	// I intialize the views. Once the webapp starts running and the
	// DOM can be interacted with, I need to give the views a chance to
	// get ready.
	WebApp.prototype.initViews = function () {
        var self = this;
        /// a "Page not found" view - displayed when a page is not found
        this.pageNotFoundView = new webapp.View({identifier: "404"});
	};


	// I am the logging method that will work cross-browser, if there is a
	// console or not. If no console is avilable, output simply gets appended
	// to the body of the page (in paragraph tags).
	WebApp.prototype.log = function () {
		// Check to see if there is a console to log to.
		if (window.console && window.console.log) {

			// Use the built-in logger.
			window.console.log.apply(window.console, arguments);

		} else {

            return;
			// Output the page using P tags.
			/*$.each(
				arguments,
				function( index, value ){
					$( document.body ).append( "<p>" + value.toString() + "</p>" );
				}
			);*/

		}
	};


	// I normalize a hash value for comparison.
	WebApp.prototype.normalizeHash = function (hash) {
		// Strip off front hash and slashses as well as trailing slash. This will
		// convert hash values like "#/section/" into "#/section".
        //hash.replace( new RegExp( "^[#/]+|/$", "g" ), "" )
		return hash.replace(new RegExp("/$", "g"), "");
	};



    $.address.change(function (address_change_event) {
        /*
        Find a route which matches the URL hash we've given and show the view
        which is registered for that route
        */
		var self = webapp,
            hash = self.normalizeHash(address_change_event.value),
            parts = hash.split('|'),
            uri_args = {},
            i,
            pair,
            eventContext,
            matches,
            mapping,
            push_to_event_context = function (index, value) {
                eventContext.parameters[mapping.parameters[index]] = value;
            };

        // note that we're starting with the 1st element, skipping
        /// the 0th, which goes into event's 'location' attribute
        for (i = 1; i < parts.length; i += 1) {
            pair = parts[i].split(':');
            uri_args[pair[0]] = pair[1];
        }

        // remember the url
        self.visitedUrlsLog.push(hash);

        // Define the default event context.
        eventContext = {
            webapp: self,
            /// `location` is the current hash slack
            location: parts[0],
            /// `parameters` are filled from the matching route
            /// - i.e. if our url is /clients/10/contacts/123, then a route
            /// /clients/:client_id/contacts/:contact_id will extract
            /// {client_id:10, contact_id:123} into the `parameters` dictionary
            parameters: {},
            /// uri_args filled from our 'slack's slack' - the part of hash slack after the first | symbol
            /// is treated as a |-separated list of name:value pairs, for example
            /// /clients/10/contacts|sort_by:name|filter_status:active
            uri_args: uri_args
        };

		// Iterate over the route mappings.
        // Using a for loop here is much cleaner then using JQuery's $.each
		for (i = 0; i < self.routeMappings.length; i += 1) {
            mapping = self.routeMappings[i];
            self.log("Hash: " + hash + " test: " + mapping.test);
            matches = eventContext.location.match(mapping.test);

            // Get the matches from the location (if the route mapping does
            // not match, this will return null) and check to see if this route
            // mapping applies to the current location (if no matches are returned,
            // matches array will be null).
            if (matches) {
                self.log("MATCH: " + matches);
                // The route mapping will handle this location change. Now, we
                // need to prepare the event context and invoke the route handler.

                // Remove the first array (the entire location match). This is
                // irrelevant information. What we want are the captured groups
                // which will be in the subsequent indices.
                matches.shift();

                /// push the default parameters into the parameters dict
                $.extend(eventContext.parameters, mapping.default_parameters);
                /*if (mapping.default_parameters)
                {
                    $.each(
                        mapping.default_parameters,
                        function( index, value ){
                            eventContext.parameters[ index ] = value;
                        }
                    );
                }*/

                // Map the captured group matches to the ordered parameters defined
                // in the route mapping.
                $.each(matches, push_to_event_context);

                mapping.controller.showView(mapping.view, eventContext);


                // Check to see if this controller has a post-handler.
                if (mapping.controller.afterViewShown) {
                    // Execute the post-handler.
                    mapping.controller.afterViewShown(eventContext);
                }

                // The view has been found, try no further
                self.log("Returning!");
                return;
            }
        }

        /// If we arrived here then no route was found; display a 404 message
        if (self.pageNotFoundView) {
            self.getController().showView(self.pageNotFoundView, eventContext);
        } else {
            self.showMessage("NOT FOUND");
        }
	});


    /*
     * Relocates the webapp to the given location.
     * Don't do anything explicitly -
     * let the location monitoring handle the change implicitly.
     * (hint: location may change without calling this function,
     * for example by clicking on a link
     */

	WebApp.prototype.relocateTo = function (location) {

        // Clear the location.
        location = this.normalizeHash(location);

        // Change the location
        window.location.hash = (location);

	};

    // uses webapp.visitedUrlsLog
    // to return the previous page url
    WebApp.prototype.previousPageUrl = function () {
        var l = this.visitedUrlsLog,
            result = "";
        if (l.length > 1) {
            result = l[l.length - 2];
        }

        if (result.indexOf('#') !== 0) {
            result = '#' + result;
        }
        return result;
    };

	WebApp.prototype.run = function () {
		// Initialize the model.
		this.initModels();

		// Initialize the views.
		this.initViews();

		// Flag that the webapp is running.
		this.isRunning = true;

	};

    WebApp.prototype.renderMenu = function (id, data) {
        var output = $(id + "-template").jqote(data);
        $(id).html(output);
    };

	// ----------------------------------------------------------------------- //
	// ----------------------------------------------------------------------- //

	WebApp.prototype.Controller = function () {
        this.currentView = null;
	};


	// I am the prototype for the Controller prototype.
	WebApp.prototype.Controller.prototype = {

		// I route the given pseudo location to the given controller method.
		route: function (path, view, default_parameters) {
            // We will need to extract the parameters into an array - these will be used
            // to create the event object when the location changes get routed.
            var parameters = [],
                // Extract the parameters and replace with capturing groups at the same
                // time (such that when the pattern is tested, we can map the captured
                // groups to the ordered parameters above.
                pattern = webapp.normalizeHash(path).replace(
                    new RegExp("(/):([^/]+)", "gi"),
                    function ($0, $1, $2) {
                        // Add the named parameter.
                        parameters.push($2);

                        // Replace with a capturing group. This captured group will be used
                        // to create a named parameter if this route gets matched.
                        return $1 + "([^/]+)";
                    }
                );

            // Do not allow to add an undefined view:
            if (!view) {
                webapp.showMessage("Undefined view for path " + path, "Invalid Route");
            }

			// Now that we have our parameters and our test pattern, we can create our
			// route mapping (which will be used by the webapp to match location
			// changes to controllers).
			webapp.routeMappings.push({
				controller: this,
				parameters: parameters,
				test: new RegExp(("^" + pattern + "$"), "i"),
				view : view,
                default_parameters : default_parameters
			});
		},

        showView : function (view, event) {

            view.controller = this;

            // hide the current view
            if (this.currentView && this.currentView.hideView) {
                this.currentView.hideView();
            }

            view.event = event;

            /// Do the initial view set-up before the first showing.
            /// Allows us, say, to load the view contents on demand
            if (!view.alreadyInitialized && view.showViewFirstTime) {
                view.showViewFirstTime();
                view.alreadyInitialized = true;
            } else {
                // Show the given view.
                view.showView();
            }

            // Store the given view as the current view.
            this.currentView = view;

            // TODO: just logging - delete later
            $.each(event.parameters || [], function (idx, value) {
                webapp.log("PARAMETER: " + idx + "->" + value);
            });

            if (event) {
                $.each(event, function (idx, value) {
                    webapp.log("EVENT: " + idx + "->" + value);
                });
            }

            // reflect the change in the navigation

            /// A controller can declare this.$menu, which is a jquery
            /// object pointing to a menu. It supposed to have some sub-elements
            /// with ids like #<menu_id>-<tab_id>.

            if (this.$menu) {
                /// Hide the current tab
                this.$menu.find("a.current").removeClass("current");

                /// in route options we may provide a hint as to what
                /// menu tab to display: { menu_tab: 'megatab' } - then
                /// the element #<menu_id>-megatab will be displayed
                var tab_name = event.parameters && event.parameters.menu_tab;

                /// if there's no menu_tab hint, we use the first part of
                /// the view's location, so /clients/123/orders/325 will toggle
                /// #<menu_id>-clients
                if (tab_name === undefined) {
                    // location starts with /, so the first element is an empty string
                    tab_name = event.location.split('/')[1];
                    if (!tab_name) {
                        /// if event.location was empty (as in case of http://mysite.com/ or http://mysite.com/#/ path)
                        /// then the tab name is 'default'
                        tab_name = 'default';
                    }
                }
                $("#" + this.$menu.attr('id') + "-" + tab_name).addClass("current");
            }
        }

	};


	// ----------------------------------------------------------------------- //
	// ----------------------------------------------------------------------- //


	// Create a new instance of the webapp and store it in the window.
	webapp = new WebApp();

	// When the DOM is ready, run the webapp.
	$(function () {
		webapp.run();
	});

	// Return a new webapp instance.
	return webapp;

}(jQuery));

