
(function ($) {
    "use strict";

	// The class that controls the framework - a global instance is attached to window.webapp.
	function WebApp() {

        // Collection of route mappings that map URL patterns to views
        this.routeMappings = [];

        // I am the collection of controllers. All controllers are intended to be
        // singleton instances.
        this.controller = null;

		// an application can register some helper methods here to be used in
		// templates, <%=webapp.helpers.format_date(this.date) %>, for example
		this.helpers = {};

        /// validation rules to be used with forms
        this.validation_rules = {
        };

        // appended to all rest URLs. if specified, should not
        // end with a slash
        this.rest_service_prefix = '';
        this.templates_prefix = '/t/';
        this.forms_prefix = '/forms/';


        this.pageNotFoundView = undefined;

		this.isRunning = false;

        this.visitedUrlsLog = [];

        this.testmode = false; // do not show error dialogs when running in testmode

        this.after_view_fully_loaded = null;

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
            $('#ajax-spinner').ajaxComplete(function () {
                $(this).hide();
            });
            /// Error message box
            $("#ajax-error").ajaxError(function (event, xhr, ajaxOptions, thrownError) {

                var self = this,
                    response = xhr.responseText.replace(new RegExp("/_debug/media/", "g"), "/webapp.client/weberror/");

                if (!webapp.testmode) {

                    $(self).html(response).dialog({
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
                } else {
                    //alert(response);
                    webapp.getController().showView(webapp.serverErrorView, webapp.getController().currentView.event);
                    $("div.activeContentView").html(response);
                }
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
                // remove formish templates - template's name contains *
                if (this.name.indexOf('*') === -1) {
                    if (o[this.name]) {
                        if (!o[this.name].push) {
                            o[this.name] = [o[this.name]];
                        }
                        o[this.name].push(this.value || '');
                    } else {
                        o[this.name] = this.value || '';
                    }
                }
            });

            /// unchecked checkboxes are not serialized by serializeArray
            /// which conforms to HTML standards but is quite annoying
            /// we send 'false' if a checkbox is unchecked
            /// this actually may be wrong if we use checkboxes for lists etc.

            $.each(this.find('input:checkbox'), function () {
                if (!this.checked) {
                    console.log("Hi");
                    o[this.name] = false;
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



    WebApp.prototype.registerMenu = function (menu_id, tabs) {

    };


	// I intialize the views. Once the webapp starts running and the
	// DOM can be interacted with, I need to give the views a chance to
	// get ready.
	WebApp.prototype.initViews = function () {
        /// a "Page not found" view - displayed when a page is not found
        this.pageNotFoundView = new webapp.View({identifier: "404"});
        this.serverErrorView = new webapp.View({identifier: "500"});
	};


	// I am the logging method that will work cross-browser, if there is a
	// console or not. If no console is avilable, output simply gets appended
	// to the body of the page (in paragraph tags).
	WebApp.prototype.log = function () {
		// Check to see if there is a console to log to.
		if (console && console.log) {

			// Use the built-in logger.
			console.log.apply(console, arguments);

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


	WebApp.prototype.normalizeHash = function (hash) {
		// Strip off front hash and trailing slash. This will
		// convert hash values like "#/section/" into "#/section".
		return hash.replace(new RegExp("^#|/$", "g"), "");
	};

    WebApp.prototype.fillInPlaceholders = function (templ, params) {
        /// accepts a string with some :placeholders in it - i.e.
        /// /users/:user_id/edit and params object containing {user_id: 345}
        /// and returns a string where placeholders are replaced with
        ///  the values
        /// from the params object, i.e. /users/345/edit

        return templ.replace(
            new RegExp("(/):([^/]+)", "gi"),
            function ($0, $1, $2) {
                var repl = params[$2];
                if (repl !== undefined) { // if (repl) {...} would not work for false-y values, such as 0 or ''
                    return "/" + repl;
                }
                return "";
            }
        );

    };



    WebApp.prototype.getEventContextForRoute = function (hash) {
        /*
        Find a route which matches the URL hash we've given
        Returns an eventContext object - if a mapping matched, it'll have
        'mapping' attribute set to that mapping, otherwise the 'mapping'
        attribute will be null.
        */
        var self = this,
            normalized_hash = self.normalizeHash(hash),
            parts = normalized_hash.split('|'),
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

            if ( pair[0].indexOf( '.' ) != -1 ) // Key has dots in it, so parse it into a structure
            {
                var dot_parts = pair[0].split('.'),
                    cur_path = uri_args;

                // Traverses the structure and creates items as it goes along
                for ( var di = 0; di < dot_parts.length - 1; di += 1 )
                {
                    var dot_part = dot_parts[di];
                    var m;
                    if ( m = dot_part.match( '(.+)\\[([0-9]+)\\]' ) ) // Its an array!
                    {
                        if ( !cur_path.hasOwnProperty( m[1] ) )
                            cur_path[ m[1] ] = [];

                        if ( cur_path[ m[1] ][ parseInt( m[2] ) ] == undefined )
                            cur_path[ m[1] ][ parseInt( m[2] ) ] = {};

                        cur_path = cur_path[ m[1] ][ parseInt( m[2] ) ];
                    }
                    else // Just a normal object
                    {
                        if ( !cur_path.hasOwnProperty( dot_part ) )
                        {
                            cur_path[ dot_part ] = {};
                        }

                    }
                }

                // The path to the attribute has been created at this point so now we can finally set it.
                cur_path[ dot_parts[ dot_parts.length -1 ] ] = pair[1]
            }
            else
                uri_args[pair[0]] = pair[1];
        }

        // Define the default event context.
        eventContext = {
            webapp: self,
            hash: normalized_hash,
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
            uri_args: uri_args,
            mapping: null
        };

        // Iterate over the route mappings.
        // Using a for loop here is much cleaner then using JQuery's $.each
        for (i = 0; i < self.routeMappings.length; i += 1) {
            mapping = self.routeMappings[i];
            matches = eventContext.location.match(mapping.test);

            // Get the matches from the location (if the route mapping does
            // not match, this will return null) and check to see if this route
            // mapping applies to the current location (if no matches are
            // returned, matches array will be null).
            if (matches) {
                // The route mapping will handle this location change. Now, we
                // need to prepare the event context and invoke the route handler.

                // Remove the first array (the entire location match). This is
                // irrelevant information. What we want are the captured groups
                // which will be in the subsequent indices.
                matches.shift();

                /// push the default parameters into the parameters dict
                $.extend(eventContext.parameters, mapping.default_parameters);

                // Map the captured group matches to the ordered parameters defined
                // in the route mapping.
                $.each(matches, push_to_event_context);

                eventContext.mapping = mapping;
                break;
            }
        }

        return eventContext;
    };

    WebApp.prototype.onAddressChange = function (address_change_event) {
        /*
         * Invoked by jquery.address when the hash slack changes
         */

        var self = webapp,
            context = self.getEventContextForRoute(address_change_event.value);

        if (context.mapping) {
            // remember the url
            webapp.visitedUrlsLog.push(context.hash);
            context.mapping.controller.showView(context.mapping.view, context);


            // Check to see if this controller has a post-handler.
            if (context.mapping.controller.afterViewShown) {
                // Execute the post-handler.
                context.mapping.controller.afterViewShown(context);
            }
        } else {
            /// If we arrived here then no route was found; display a 404 message
            if (self.pageNotFoundView) {
                self.getController().showView(self.pageNotFoundView, context);
            } else {
                self.showMessage("NOT FOUND");
            }
        }
    };

    /*
     * Relocates the webapp to the given location.
     * Don't do anything explicitly -
     * let the location monitoring handle the change implicitly.
     * (hint: location may change without calling this function,
     * for example by clicking on a link
     */

	WebApp.prototype.relocateTo = function (loc) {

        // Clear the location.
        loc = this.normalizeHash(loc);

        // Change the location
        window.location.hash = loc;

	};


    WebApp.prototype.popupView = function (url, success_callback) {
        var hash = webapp.normalizeHash(url),
            context = webapp.getEventContextForRoute(hash);


        context.popup_success_callback = success_callback

        if (context.mapping) {
            context.mapping.controller.popupView(context.mapping.view, context);
        } else {
            self.showMessage("POPUP VIEW NOT FOUND: " + hash);
        }
        return false;
    }

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

		// Initialize the views.
		this.initViews();

		// Flag that the webapp is running.
		this.isRunning = true;

	};

    WebApp.prototype.renderMenu = function (id, data) {
        var output = $(id + "-template").jqote(data);
        $(id).html(output);
    };

    WebApp.prototype.Read =  function (url, callback) {

        return $.ajax({
            type: "GET",
            url: url,
            cache: false, // disable caching. May need to improve
            success: function (data) {
                return callback(data);
            }

        });
    };

    WebApp.prototype.Delete =  function (url, callback) {

        return $.ajax({
            type: "DELETE",
            url: url,
            success: function (data) {
                return callback(data);
            }

        });
    };

    WebApp.prototype.Create =  function (url, data, callback) {

        if (typeof data !== "string") {
            data = JSON.stringify(data || {});
        }

        return $.ajax({
            type: "POST",
            url: url,
            contentType: "application/json",
            processData: false, // tell jQuery not to process
            data: data,
            success: function (data) {
                callback(data);
            }

        });
    };

    WebApp.prototype.Update =  function (url, data, callback) {

        if (typeof data !== "string") {
            data = JSON.stringify(data || {});
        }

        return $.ajax({
            type: "PUT",
            url: url,
            contentType: "application/json",
            processData: false, // tell jQuery not to process
            data: data,
            success: function (data) {
                if (typeof(callback)==="function") {
                    callback(data);
                }
            }

        });
    };



    // ----------------------------------------------------------------------- //
    // ----------------------------------------------------------------------- //

	// Create a new instance of the webapp and store it in the window.
	window.webapp = new WebApp();

	// When the DOM is ready, run the webapp.
	$(function () {

        /// install the address change handler
        $.address.change(webapp.onAddressChange);

        /// Set up additional validators
        /// NOTE: Keep these in sync with the python side
        /// TODO: Move them somewhere
        var HOSTNAME_RE = /^[a-z0-9][a-z0-9\.\-_]*\.[a-z]+$/i,
            IPADDRESS_RE = /^((\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5]))$/i;
        $.validator.addMethod("hostname", function (value, elem, params) {
            if (!value) {
                return true;
            }
            if (value.match(HOSTNAME_RE)) {
                return true;
            }
            return false;
        },
            "Enter a valid hostname"
            );
        $.validator.addMethod("ip_address", function (value, elem, params) {
            if (!value) {
                return true;
            }
            if (value.match(IPADDRESS_RE)) {
                return true;
            }
            return false;
        },
            "Enter a valid IP address"
            );

        /// end validators setup

		webapp.run();
	});

	// Return a new webapp instance.
	return webapp;

}(jQuery));

