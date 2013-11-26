
/// if window.console is absent, create a dummy object with methods
/// which do nothing - prevents the errors when the console does not exist
/// https://github.com/andyet/ConsoleDummy.js
(function (con) {
    "use strict";
    // the dummy function
    var dummy = function () {};
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

        this.request_cache = {};
        this.request_cache_by_type = {};
        this.served_cached_requests = 0;
        this.served_total_requests = 0;
        this.precog_cache = {};

        this.compiled_templates = {};

        this.showMessage = function (msg, title) {
            /*
            Displays a message - a nicer replacement for
            alert function
            */
            if (title) {
                msg = '<h1>' + title + '</h1>' + msg;
            }
            bootbox.alert(msg);
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
            //$("body").append($('<div id="ajax-spinner" class="flash-message flash-message-normal">Loading...</div>'));

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
                    /*
                        Arrgh, Firebug sometimes breaks here regardless of the try/except block
                        Let's really crudely check if the response looks like JSON and bail out
                        if it doesn't
                    */
                    if (jqx.responseText && jqx.responseText[0] === '{') {
                        data = $.parseJSON(jqx.responseText);
                    }
                } catch (exc) {
                    // pass
                }

                webapp.processFlashMessages(data, jqx);
            });


            /*$(document).ajaxError(function (e, jqx) {
                webapp._forgetXHR(jqx);
            });*/

            $('#ajax-spinner').ajaxStart(function () {
                $(this).fadeIn();
            });
            $('#ajax-spinner').ajaxStop(function () {
                $(this).fadeOut();
            });
            $('#ajax-spinner').ajaxError(function () {
                $(this).fadeOut();
            });
            $('#ajax-spinner').ajaxComplete(function () {
                $(this).fadeOut();
            });
            /// Error message box
            $(document).ajaxError(function (event, jqxhr, ajaxOptions, thrownError) {

                var self = this,
                    response,
                    show_alert = function (msg) {
                        // alert(msg);
                       /*if (!webapp.server_error_popup_count) {
                            webapp.server_error_popup_count = webapp.server_error_popup_count ?
                                webapp.server_error_popup_count + 1 : 1;
                            bootbox.alert(msg, function () {
                                webapp.server_error_popup_count -= 1;
                            });
                        }*/
                        webapp.flash_messages.push({
                            css_class: 'flash-message-error',
                            msg: msg
                        });

                        // process the messages right away
                        if (webapp.getController().currentView.renderFlashMessages) {
                            webapp.getController().currentView.renderFlashMessages();
                        }
                    };

                /* aborted calls trigger ajaxError too - we don't want to
                display any messages obviously. Also, responseText is null for
                such responses and status = 0.
                */
                if (jqxhr.statusText == 'abort') {
                    return;
                }

                /*
                calling code can set `ignore_errors` attribute to signal
                that errors are expected and are handled by the calling code
                */
                if (jqxhr.ignore_errors) {
                    return;
                }

                response = jqxhr.responseText.replace(new RegExp("/_debug/media/", "g"), "/webapp.client/weberror/");


                if (ajaxOptions.webapp_error_response_processed) {
                    return;
                }

                if (!webapp.testmode) {

                    /* this one should work in debug mode too */
                    if (jqxhr.status === 422) {
                        window.location.reload(true);
                        return;
                    }

                    /* When debug mode is on the messages are very long,
                     so we use it to crudely distinquish between when we want to
                     show a generic message or a traceback */
                    if (response.length > 400) {
                        show_alert(response);
                    } else {
                        switch (jqxhr.status) {
                            case 410:
                                /*
                                When a resource is soft-deleted the server sends 410 Gone
                                with a small JSON dict with a `message` attribute
                                */
                                webapp.showMessage("<p>"  + JSON.parse(response).message + "</p>");
                                webapp.relocateTo(webapp.previousPageUrl());
                                break;
                            case 422:
                                /* otherwise it shows a default message momentarily */
                                break;
                            case 500:
                                show_alert("There's been a server error. Our engineers have been notified.");
                                break;
                            case 502:
                                show_alert("The site is down. Please try again later.");
                                break;
                            default:
                                show_alert("Can't connect to the site. Please check your internet connection.");
                                break;

                        }
                    }

                } else {
                    //alert(response);
                    webapp.getController().showMainView(webapp.serverErrorView, webapp.getController().currentView.event);
                    $("div.activeContentView").html(response);
                }
                // This was here to deal with deleted tasks,
                // but it produces undesirable effects in other places
                // webapp.relocateTo(webapp.previousPageUrl());
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


    WebApp.prototype.processFlashMessages = function (data, jqXHR) {
        /// set a trigger on jqXHR to prevent rendering the same message twice
        /// (in case we call webapp.processFlashMessages manually from an onsuccess callback
        /// which is called earlier than the .ajaxSuccess which normally processes the flash messages)
        if (jqXHR.__flash_messages_processed__) {
            return;
        }
        if (data) {
            /* flash messages */
            if (data.__flash_messages__) {
                console.log('found flash messages in data!');
                webapp.flash_messages = webapp.flash_messages.concat(data.__flash_messages__);

                // process the messages right away
                if (webapp.getController().currentView.renderFlashMessages) {
                    webapp.getController().currentView.renderFlashMessages();
                }
            }
            jqXHR.__flash_messages_processed__ = true;
        }
    };


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

        if (self.ignore_next_address_change) {
            self.ignore_next_address_change = false;
            return;
        }

        // if the can_leave_page callback exists
        if (self.getController().currentView && (self.getController().currentView.options || {}).can_leave_page) {
            // if the user can't leave the page
            if(!self.getController().currentView.options.can_leave_page()) {

                var stay = self.getController().currentView.options.confirm_navigation();

                if(!stay) {
                    // the next call to here should be ignored
                    self.ignore_next_address_change = true;
                    // set the next page to be the old page
                    $.address.value(self.getController().currentView.event.hash);
                    return;
                }
            }
        }

        //webapp.abortAllRequests();
        webapp.clearStats();

        if (context.mapping) {
            // remember the url, as as it wasn't the last visited url
            if (context.hash !== webapp.visitedUrlsLog[webapp.visitedUrlsLog.length - 1]) {
                webapp.visitedUrlsLog.push(context.hash);
            }
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

        // If the new location is the same as the old one
        if (window.location.hash === ('#' + loc)) {
            // Change it so that it's the same but the address change handler gets called
            window.location.hash = loc + '/';
            // Go back to the right page so that the / don't keep stacking
            window.location.hash = loc;
        // Otherwise
        } else {
            // Change the location
            window.location.hash = loc;
        }

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
        out.push('<dt><strong>' + jqx._url + '</strong> - ' +
            webapp.helpers.readable_bytes(jqx.responseText.length) +
            ' in ' + millis + 'ms.</dt>');

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


    WebApp.prototype.popupView = function (url, mode, initiating_element, success_callback, custom_class_body) {
        var hash = webapp.normalizeHash(url),
            event = webapp.getEventContextForRoute(hash);

        url = (function (l) {
                    /* remove the part of the url before the hash */
                    var parts = l.split('#');
                    if (parts.length === 2) {
                        return "#" + parts[1];
                    }
                    return l;
                }(url));

        mode = mode || "popup";
        custom_class_body = custom_class_body || "";
        event.custom_class_body = custom_class_body;
        event.popup_success_callback = success_callback;
        event.display_mode = mode;
        event.initiating_element = initiating_element;
        if (initiating_element) {
            event.inline_container_selector = initiating_element.data('container');
        }

        event.popup_success_callback = success_callback || function (server_response) {
            var current_view = webapp.controller.currentView;
            /// find all classes which start with webappOnSuccess
            /// if found, it expects it to be in a form
            /// webappOnSuccess-methodName.
            /// If the view has such method,
            /// it is invoked when the call succeeds
            $(initiating_element.attr('class').split(' ')).each(function (idx, val) {
                var parts = val.split('-'),
                    fn;
                if (parts.length === 2 &&
                        parts[0] === "webappOnSuccess" &&
                        current_view[parts[1]]) {
                    fn = current_view[parts[1]];
                    fn.apply(current_view, [initiating_element, server_response]);
                }
            });
        };

        if (event.mapping) {
            event.mapping.controller.showSecondaryView(event.mapping.view, event, mode);
        } else {
            webapp.showMessage("POPUP VIEW NOT FOUND: " + hash);
        }
        return event.mapping.view;
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

    WebApp.prototype.Read = function (url, invalidated_by) {
        return webapp.get_cached_ajax(
            true,
            invalidated_by,
            {
                type: 'GET',
                url: url,
                contentType: "application/json",
                processData: false // tell jQuery not to process
            }
        );
    };

    WebApp.prototype._send_request_with_body = function (url, data, method) {
        if (typeof data !== "string") {
            data = JSON.stringify(data || {});
        }

        /*
        we need to use .get_cached_ajax() here because it also
        invalidates the cache
        */

        return webapp.get_cached_ajax(
            false,
            [],
            {
                type: method,
                url: url,
                contentType: "application/json",
                processData: false, // tell jQuery not to process
                data: data
            }
        );
    };

    WebApp.prototype.Create =  function (url, data) {
        /*
        Sends `data` to the `url` in a PUT request
        */
        return webapp._send_request_with_body(url, data, 'POST');
    };

    WebApp.prototype.Delete =  function (url, data) {
        /*
        Sends `data` to the `url` in a DELETE request

        A DELETE request can actually have a body:
        http://stackoverflow.com/questions/299628/is-an-entity-body-allowed-for-an-http-delete-request
        so it's no different from POST or PUT
        */
        return webapp._send_request_with_body(url, data, 'DELETE');
    };

    WebApp.prototype.Update =  function (url, data) {
        /*
        Sends `data` to the `url` in a PUT request
        */
        return webapp._send_request_with_body(url, data, 'PUT');
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
            callback = function (data, textStatus, jqXHR) {

                /* The new method of specifying the callback using data-attributes*/
                var view_fn_name = $link.data('onsuccess'),
                    view_fn;
                if (view_fn_name) {
                    view_fn = view[view_fn_name];
                    view_fn.apply(view, [$link, data, textStatus, jqXHR]);
                }

                /// LEGACY METHOD USING CLASSES - DO NOT USE
                /// find all classes which start with webappOnSuccess
                /// if found, it expects it to be in a form webappOnSuccess-methodName.
                /// If the view has such method, it is invoked when the call succeeds
                $($link.attr('class').split(' ')).each(function (idx, val) {
                    var parts = val.split('-');
                    if (parts.length === 2 &&
                            parts[0] === "webappOnSuccess" &&
                            view[parts[1]]) {
                        view[parts[1]].apply(view, [$link, data, textStatus, jqXHR]);
                    }
                });


            },
            data = {},
            optimistic_update = function () {
                var view_fn_name = $link.data('optimistic'),
                    view_fn;
                if (view_fn_name) {
                    view_fn = view[view_fn_name];
                    view_fn.apply(view, [$link]);
                }
            },
            link_uri = $link.attr('href'); // remember the link in case optimistic update changes it

        if ($link.hasClass("webappMethodDelete")) {
            meth = webapp.Delete;
        } else if ($link.hasClass("webappMethodPut")) {
            meth = webapp.Update;
        } else if ($link.hasClass("webappMethodPost")) {
            meth = webapp.Create;
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

        optimistic_update();

        if (meth === webapp.Read) {
            meth(link_uri, $link.data('invalidated_by')).done(callback);
        } else {
            meth(link_uri, data).done(callback);
        }

        if ($link.hasClass("webappGoBack")) {
            webapp.relocateTo(webapp.previousPageUrl());
        }
        return false;
    };


    /* CACHING */
    WebApp.prototype.get_cached_ajax = function (use_cache, invalidated_by, options) {
        /*
        webapp maintains a cache of
        */
        var self = this,
            cached = self.request_cache[options.url],
            ajax,
            update_stats = function () {
                $("#inconspicuous-caching-stats").text(
                    self.served_cached_requests + '/' + self.served_total_requests +
                    ' (' +
                    (self.served_cached_requests / self.served_total_requests * 100).toFixed(1) +
                    '%)'
                );
            };

        self.served_total_requests += 1;

        if (use_cache && cached) {
            console.log("HIT", options.url);
            cached.used += 1;
            /*if (cached.ajax.isResolved()) {
                console.log("mocking deferred");
                return {
                    done: function (callback) {
                        console.log("mocking deferred");
                        callback(cached.data);
                        return this;
                    }
                };
            }*/
            self.served_cached_requests += 1;
            update_stats();
            return cached.ajax; // make sure we don't do cache invalidation
        }

        if (!use_cache) {
            console.log("NO CACHE: ", options.url);
            ajax = $.ajax(options);
        } else {
            console.log("MISS", options.url);
            ajax = $.ajax(options);
            self.request_cache[options.url] = {
                ajax: ajax,
                invalidated_by: invalidated_by,
                used: 1/*,
                data: null*/
            };
            update_stats();

            $.each(invalidated_by || ['*'], function (idx, type) {
                if (!self.request_cache_by_type[type]) {
                    self.request_cache_by_type[type] = [];
                }
                self.request_cache_by_type[type].push(options.url);
            });
        }

        return ajax.done(function (data) {
            /*
            invalidate the cache, do not fail if the client returns
            something which is not a dict
            */
            // self.request_cache[options.url].data = data;
            // console.log("AJAX FINISHED:", options.url);
            if (data && (typeof data === "object") && data.__recently_modified__) {
                console.log("INVALIDATING", data.__recently_modified__);
                webapp.purge_cache(data.__recently_modified__, data.__recently_modified_timestamp__);
            } else if (typeof data !== "object") {
                console.log("data is not a json dict", data);
            } else {
                // console.log("nothing to invalidate");
            }
        });
    };

    WebApp.prototype.purge_cache = function (invalidated_by, timestamp) {
        var self = this;
        invalidated_by = invalidated_by || [];
        if (invalidated_by.indexOf('*') === -1) {
            invalidated_by.push('*'); // '*' entries are purged always
        }
        $.each(invalidated_by, function (idx, type) {
            console.log("PURGING: ", type);
            if (self.request_cache_by_type[type]) {

                $.each(self.request_cache_by_type[type], function (idx, url) {
                    delete self.request_cache[url];
                });

                delete self.request_cache_by_type[type];
            }

            /// remove all precog data for this type
            delete self.precog_cache[type];
        });

        if (timestamp) {
            $.removeCookie('last_changed', {path: '/'});
            $.cookie('last_changed', timestamp, {path: '/'});
            console.log($.cookie('last_changed'));
        }

    };

    WebApp.prototype.purge_cached_request = function (url) {
        /*
        Removes a spacific request from the cache
        */
        var self = this;
        delete self.request_cache[url];
    };

    WebApp.prototype.set_precog_attr = function (type, item_id, attr_name, value) {
        var self = this;

        self.precog_cache = self.precog_cache || {};
        self.precog_cache[type] = self.precog_cache[type] || {};
        self.precog_cache[type][item_id] = self.precog_cache[type][item_id] || {};
        self.precog_cache[type][item_id][attr_name] = value;

        console.log("PRECOG CACHE", self.precog_cache);
    };

    WebApp.prototype.get_precog_data = function (type, item_id, item) {
        var self = this,
            cache = self.precog_cache,
            data;

        if (!(self.precog_cache && self.precog_cache[type] && self.precog_cache[type][item_id])) {
            return item;
        }

        data = $.extend({}, item, self.precog_cache[type][item_id]);

        console.log("PRECOG ITEM DATA", data);

        return data;
    };


    /* END CACHING */

    WebApp.prototype.urlsafe_json = function (obj) {
        return encodeURIComponent(JSON.stringify(obj));
    };

    WebApp.prototype.attrsafe_json = function (obj) {
        /* converts a json object to a representaion
        which is safe to use in a html attribute */
        var s = JSON.stringify(obj);
        if (s) {
            s = s.replace(/\"/g, "&quot;");
        }
        return s;
    };


    WebApp.prototype.log_stack_trace = function () {
        var e = new Error('dummy'),
            stack = e.stack.replace(/\s+/g, '\n');
        return stack;
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

