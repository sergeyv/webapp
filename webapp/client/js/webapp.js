
/// if window.console is absent, create a dummy object with methods
/// which do nothing - prevents the errors when the console does not exist
/// https://github.com/andyet/ConsoleDummy.js
(function (con) {
    "use strict";
    // the dummy function
    function dummy() {};
    // console methods that may exist
    for(var methods = "assert,count,debug,dir,dirxml,error,exception,group,groupCollapsed,groupEnd,info,log,markTimeline,profile,profileEnd,time,timeEnd,trace,warn".split(','), func; func = methods.pop();) {
        con[func] = con[func] || dummy;
    }
}(window.console = window.console || {}));



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

        this.xhr_id = 0;
        this.currently_active_xhrs = {};

        this.flash_messages = [];

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

            $.ajaxSetup({
                beforeSend: function (jqXHR, settings) {
                    jqXHR._url = settings.url;
                    jqXHR._start = new Date();
                },
                success: function (data, textStatus, jqXHR) {
                    webapp._addRequestStats(data, textStatus, jqXHR);
                }
            });
            /// Ajax spinner
            $("body").append($('<div id="ajax-spinner">&nbsp;</div>'));

            $("body").append($('<div id="ajax-error"> </div>'));

            /// Experiment with using Bootstrap's modal dialog
            /*$("body").append($('<div id="ajax-error" class="modal hide fade"><div class="modal-header">' +
                '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>' +
                '<h3>Server Error</h3></div>' +
                '<div class="modal-body"></div>' +
                '<div class="modal-footer">' +
                '<button class="btn" data-dismiss="modal" aria-hidden="true">Close</button>' +
                '</div></div>'
            ));*/

            $(document).ajaxSend(function (e, jqx) {
                /* add an unique ID to an XHR so we can tell them apart later */
                webapp._rememberXHR(jqx);
            });

            $(document).ajaxComplete(function (e, jqx) {
                /* Called both on success and error */
                webapp._forgetXHR(jqx);
            });

            $(document).ajaxSuccess(function (e, jqx) {
                // TODOXXX: this parses .responseText to JSON
                // second time - it's inefficient but I wasn't
                // able to find how to get json data from ajaxSuccess
                var data;
                try {
                    data = $.parseJSON(jqx.responseText);
                } catch (e) {
                    // pass
                };

                if (data && data.__flash_messages__) {
                    webapp.flash_messages = webapp.flash_messages.concat(data.__flash_messages__);
                }

            });


            /*$(document).ajaxError(function (e, jqx) {
                webapp._forgetXHR(jqx);
            });*/

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
                    response;

                /* aborted calls trigger ajaxError too - we don't want to
                display any messages obviously. Also, responseText is null for
                such responses and status = 0.
                */
                if (xhr.statusText == 'abort') {
                    return;
                }

                response = xhr.responseText.replace(new RegExp("/_debug/media/", "g"), "/webapp.client/weberror/");


                if (ajaxOptions.webapp_error_response_processed) {
                    return;
                }

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
                    webapp.getController().showMainView(webapp.serverErrorView, webapp.getController().currentView.event);
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
                    if (o.hasOwnProperty(this.name)) {
                        /* If the property already exists then we check
                        if it's an array already, if not we're converting it
                        to an array and then we append the value
                        */
                        if (!o[this.name].push) { /* 'push' is how we tell Array from something else */
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
            /// but only if there's no already a value (a scalar or an array)
            /// for that name.

            $.each(this.find('input:checkbox').not(':checked'), function () {
                if (!o.hasOwnProperty(this.name)) {
                    o[this.name] = false;
                }
            });

            /// make empty multiselects to return [] - otherwise they're ignored
            /// also, for multiselects we convert single values to arrays with one element
            $.each(this.find('select'), function () {
                var s = $(this);
                if (s.attr("multiple")) {
                    if (s.val() === null) {
                        o[this.name] = [];
                    } else if (typeof s.val() === "string") {
                        o[this.name] = [o[this.name]];
                    }
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


	// I intialize the views. Once the webapp starts running and the
	// DOM can be interacted with, I need to give the views a chance to
	// get ready.
	WebApp.prototype.initViews = function () {
        /// a "Page not found" view - displayed when a page is not found
        this.pageNotFoundView = new webapp.View({identifier: "404"});
        this.serverErrorView = new webapp.View({identifier: "500"});
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

        The slack hash can contain parameters which are either passed as

        #/path/to/view|param1:value|param2:value|compound.key1:value|compound.key2:value

        or as

        #/path/to/view(json):{"name":"John"}

        the latter is preferable as it uses built-in jquery method to parse the data
        and avoids issues with using | and : in data values.
        */
        var self = this,
            normalized_hash = self.normalizeHash(hash),
            json_separated_parts = normalized_hash.split('(json):'),
            parts = json_separated_parts[0].split('|'),
            uri_args = {},
            i,
            pair,
            eventContext,
            matches,
            mapping,
            push_to_event_context = function (index, value) {
                eventContext.parameters[mapping.parameters[index]] = value;
            };


        if (json_separated_parts[1]) {
            uri_args = $.parseJSON(decodeURIComponent(json_separated_parts[1]));
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

        webapp.abortAllRequests();
        webapp.clearStats()

        if (context.mapping) {
            // remember the url
            webapp.visitedUrlsLog.push(context.hash);
            context.mapping.controller.showMainView(context.mapping.view, context);


            // Check to see if this controller has a post-handler.
            if (context.mapping.controller.afterViewShown) {
                // Execute the post-handler.
                context.mapping.controller.afterViewShown(context);
            }
        } else {
            /// If we arrived here then no route was found; display a 404 message
            if (self.pageNotFoundView) {
                self.getController().showMainView(self.pageNotFoundView, context);
            } else {
                webapp.showMessage("NOT FOUND");
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


    /* Request aborting stuff */

    WebApp.prototype._rememberXHR = function (xhr) {
        xhr._id = ++webapp.xhr_id;
        webapp.currently_active_xhrs[xhr._id] = xhr;
    };

    WebApp.prototype._forgetXHR = function (xhr) {
        delete webapp.currently_active_xhrs[xhr._id];
    };

    WebApp.prototype.abortAllRequests = function () {
        var r = [];
        $.each(webapp.currently_active_xhrs, function (i, xhr) {
            if (!xhr._webapp_unabortable) {
                r.push(xhr._id);
                xhr.abort();
            }
        });
        webapp.currently_active_xhrs = {};
        return r;
    };

    /* End request aborting stuff */


    /* stats stuff */
    WebApp.prototype._addRequestStats = function (data, textStatus, jqx) {
        var $stats = $("#stats-view"),
            $cont = $('<dl class="statsContainer"></dl>'),
            millis = new Date() - jqx._start,
            out = [];

        /* TODOXXX: this is a dependency on helpers.js which is not included in webapp */
        out.push('<dt><strong>' + jqx._url + '</strong> - '
            + webapp.helpers.readable_bytes(jqx.responseText.length)
            + ' in ' + millis + 'ms.</dt>');

        if (data && data.stats) {
            // this is how to concatenate two arrays in JS
            out.push.apply(out, [
                '<dd><strong>',
                data.stats.query_count,
                ' queries</strong>, main query in ',
                (data.stats.main_query_time||0 * 1000).toFixed(3),
                's</dd>',
                '<dd><strong>',
                (data.stats.total_time||0 * 1000).toFixed(3),
                's Python time</strong>',
                ' - ',
                (data.stats.serialize_time||0 * 1000).toFixed(3),
                ' spent in serializer</dd>'
                ]);

            if (data.stats.queries) {
                out.push('<dd><strong>Queries:</strong><ol>');
                $.each(data.stats.queries, function (idx, val) {
                    out.push('<li>' + val + '</li>');
                });
                out.push('</ol></dd>');
            }
            // out.push('</ul></dd>');
        }

        $cont.append(out.join(''));
        $cont.appendTo($stats);
    };


    WebApp.prototype.clearStats = function () {
        $("#stats-view").html('');
    };

    /* end stats stuff */


    WebApp.prototype.popupView = function (url, mode, success_callback) {
        var hash = webapp.normalizeHash(url),
            event = webapp.getEventContextForRoute(hash);

        mode = mode || "popup";
        event.popup_success_callback = success_callback;
        event.display_mode = mode;

        if (event.mapping) {
            event.mapping.controller.showSecondaryView(event.mapping.view, event, mode);
        } else {
            webapp.showMessage("POPUP VIEW NOT FOUND: " + hash);
        }
        return false;
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
            //cache: false, // disable caching. May need to improve
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

    WebApp.prototype.format_date = function (date_str) {
        /*
        Converts a date parsable by the Date class (i.e. in ISO-whatever format)
        to a 27 Mar 2001 format
        */
        if (webapp.helpers.date) {
            // webapp.helpers.date overrides this
            return webapp.helpers.date(date_str);
        }

        if (!date_str) { return ""; }

        var d = new Date(date_str),
            MONTH_NAMES = [
                'Jan', 'Feb', 'Mar',
                'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'
            ],
            day = d.getDate();

        if (day < 10) { day = "0" + day; }
        return String(day) + " " + MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
    };


    WebApp.prototype.invoke_async_action = function (view, $link) {
        var webapp = this,
            meth = webapp.Read,
            need_send_data = false,
            callback = function () {

				if(!$link.hasClass("webappHideSpinner")) {
                	$link.addClass("asyncTaskSent");
				}
                /// find all classes which start with webappOnSuccess
                /// if found, it expects it to be in a form webappOnSuccess-methodName.
                /// If the view has such method, it is invoked when the call succeeds
                $($link.attr('class').split(' ')).each(function (idx, val) {
                    var parts = val.split('-');
                    if (parts.length === 2 &&
                            parts[0] === "webappOnSuccess" &&
                            view[parts[1]]) {
                        view[parts[1]].apply(view);
                    }
                });
            },
            data = {};

        if ($link.hasClass("webappMethodDelete")) {
            meth = webapp.Delete;
            need_send_data = false;
        } else if ($link.hasClass("webappMethodPut")) {
            meth = webapp.Update;
            need_send_data = true;
        } else if ($link.hasClass("webappMethodPost")) {
            meth = webapp.Create;
            need_send_data = true;
        }


        if ($link.hasClass('webappSendData')) {
            data = $link.data('send') || {};

            $.extend(data, (function () {
                var meth_name = $link.data("collect-method");
                if (view[meth_name]) {
                    return view[meth_name].apply(view);
                }
                return {};
            }()));

            /// if there's a class webappCollectDataMethod-methodName
            /// we will extend `data` with what methodName returns
            //$.each($link.attr('class').split(' '), function (idx, val) {
            //    var parts = val.split('-');
                /*if (parts.length === 2 &&
                        parts[0] === "webappCollectDataMethod" &&
                        self[parts[1]]) {
                    $.extend(data, self[parts[1]]());
                }*/
            //});

        }

        /// the signatures of webapp.Read and webapp.Delete
        /// require 2 parameters - url and callback, while
        /// webapp.Create and webapp.Update also accept `data`
        /// parameter which unfortunately is in the middle
        /// we may need to refactor this because it's kinda ugly
        if (need_send_data) {
            meth($link.attr('href'), data, callback);
        } else {
            meth($link.attr('href'), callback);
        }

        if ($link.hasClass("webappGoBack")) {
            webapp.relocateTo(webapp.previousPageUrl());
        }
        return false;
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

